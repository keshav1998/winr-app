/* eslint-disable no-console */
import { NextResponse } from "next/server";

/**
 * Mock KYC API (in-memory)
 *
 * This route provides a simple in-memory KYC state keyed by EVM address.
 * - GET /api/kyc?address=0x...   -> Fetch KYC status for a single address (or list all when no address provided)
 * - POST /api/kyc                -> Create/initialize a record as "pending" ({ address, notes? })
 * - PATCH /api/kyc               -> Update status ({ address, status: 'pending'|'approved'|'rejected', notes? })
 * - DELETE /api/kyc              -> Remove a record ({ address })
 *
 * NOTE:
 * - This is a mock for development only. State is in-memory and resets on server restart.
 * - Uses globalThis to minimize resets during hot-reload in dev.
 * - No authentication is implemented. Do not use in production.
 */

export const dynamic = "force-dynamic";

type HexAddress = `0x${string}`;
type KYCStatus = "pending" | "approved" | "rejected";

type KYCRecord = {
  address: HexAddress;
  status: KYCStatus;
  updatedAt: string;
  notes?: string;
};

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const DEFAULT_STATUS: KYCStatus = "pending";
const VALID_STATUSES: readonly KYCStatus[] = ["pending", "approved", "rejected"] as const;

// In-memory store attached to global scope to survive hot reload in dev
declare global {
  // eslint-disable-next-line no-var
  var __KYC_STATE__: Map<string, KYCRecord> | undefined;
}
const store: Map<string, KYCRecord> = globalThis.__KYC_STATE__ ?? new Map();
globalThis.__KYC_STATE__ = store;

/* ============================
 * Utilities
 * ============================ */

function jsonOk(data: unknown, init?: ResponseInit) {
  return NextResponse.json(
    { ok: true, data },
    {
      ...init,
      headers: {
        "Cache-Control": "no-store",
        ...(init?.headers ?? {}),
      },
    },
  );
}

function jsonErr(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json(
    { ok: false, error: message, ...(extra ?? {}) },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

function normalizeAddress(addr: string | undefined | null): HexAddress | null {
  if (!addr || typeof addr !== "string") return null;
  const a = addr.trim();
  if (!ADDRESS_REGEX.test(a)) return null;
  return a.toLowerCase() as HexAddress;
}

async function readBody<T>(req: Request): Promise<T | null> {
  try {
    const text = await req.text();
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function nowISO(): string {
  return new Date().toISOString();
}

/* ============================
 * Handlers
 * ============================ */

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const qAddr = searchParams.get("address");
  const address = normalizeAddress(qAddr);

  if (address) {
    const existing = store.get(address);
    // If not found, return default (pending) without mutating the store
    const record: KYCRecord =
      existing ??
      ({
        address,
        status: DEFAULT_STATUS,
        updatedAt: nowISO(),
      } as KYCRecord);

    return jsonOk(record);
  }

  // Admin/list view: return all records in the store (unsorted)
  const data = Array.from(store.values());
  return jsonOk({ count: data.length, records: data });
}

export async function POST(request: Request) {
  type Body = { address?: string; notes?: string };
  const body = await readBody<Body>(request);
  if (!body) return jsonErr("Invalid JSON body", 400);

  const address = normalizeAddress(body.address);
  if (!address) return jsonErr("Invalid or missing 'address'", 422);

  const existing = store.get(address);
  const record: KYCRecord = {
    address,
    status: existing?.status ?? DEFAULT_STATUS,
    updatedAt: nowISO(),
    ...(body.notes ? { notes: body.notes } : {}),
  };

  store.set(address, record);
  return jsonOk(record, { status: existing ? 200 : 201 });
}

export async function PATCH(request: Request) {
  type Body = { address?: string; status?: KYCStatus; notes?: string };
  const body = await readBody<Body>(request);
  if (!body) return jsonErr("Invalid JSON body", 400);

  const address = normalizeAddress(body.address);
  if (!address) return jsonErr("Invalid or missing 'address'", 422);

  const status = body.status;
  if (!status || !VALID_STATUSES.includes(status)) {
    return jsonErr(
      `Invalid or missing 'status'. Allowed: ${VALID_STATUSES.join(", ")}`,
      422,
    );
  }

  const previous = store.get(address);
  const record: KYCRecord = {
    address,
    status,
    updatedAt: nowISO(),
    ...(body.notes ? { notes: body.notes } : {}),
  };

  store.set(address, record);
  return jsonOk({ previous: previous ?? null, current: record });
}

export async function DELETE(request: Request) {
  type Body = { address?: string };
  const body = await readBody<Body>(request);
  if (!body) return jsonErr("Invalid JSON body", 400);

  const address = normalizeAddress(body.address);
  if (!address) return jsonErr("Invalid or missing 'address'", 422);

  const existed = store.delete(address);
  return jsonOk({ deleted: existed, address });
}
