/* eslint-disable no-console */
import { NextResponse } from "next/server";

/**
 * Deposits API (in-memory, polling-ready, development)
 *
 * This route provides an in-memory deposit flow that becomes "ready to mint" after a short delay.
 * It enables the frontend to poll for deposit readiness and then enable the "Mint" button.
 *
 * Endpoints:
 * - GET /api/deposits?address=0x...          -> List deposits for an address
 * - GET /api/deposits?id=dep_...             -> Get a specific deposit (auto-advances status over time)
 * - GET /api/deposits                        -> Admin/list all deposits (debug)
 * - POST /api/deposits                       -> Create a deposit intent ({ address, amount, currency? })
 * - PATCH /api/deposits                      -> Update a deposit ({ id, status?, readyToMint?, notes? })
 * - DELETE /api/deposits                     -> Delete a deposit ({ id })
 *
 * Behavior:
 * - When a deposit is created, it starts with `status: "pending", readyToMint: false`.
 * - On subsequent GETs, if enough time has elapsed (AUTO_CONFIRM_MS), the deposit is auto-updated to:
 *      status: "confirmed", readyToMint: true
 * - The payload includes `etaMs` while pending to support UX timers/spinners.
 *
 * WARNING:
 * - This is for local development/demo only. It's in-memory and resets on server restart.
 * - No authentication is implemented. Do not use in production.
 */

export const dynamic = "force-dynamic";

/* ============================
 * Types & Constants
 * ============================ */

type HexAddress = `0x${string}`;
type DepositStatus = "pending" | "confirming" | "confirmed" | "failed";

type DepositRecord = {
  id: string;
  address: HexAddress;
  amount: string; // decimal string (e.g., "1000.00")
  currency: string; // e.g., "INR"
  status: DepositStatus;
  readyToMint: boolean;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  confirmations?: number; // development field
  notes?: string;
  // Optional refs
  fiatRefId?: string; // e.g., bank reference
  chainTxHash?: string; // EVM tx if applicable
};

type PostBody = {
  address?: string;
  amount?: string | number;
  currency?: string;
  notes?: string;
};

type PatchBody = {
  id?: string;
  status?: DepositStatus;
  readyToMint?: boolean;
  notes?: string;
  confirmations?: number;
};

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const AMOUNT_REGEX = /^(?:\d+)(?:\.\d{1,18})?$/; // up to 18 decimals
const DEFAULT_CURRENCY = "INR";

/**
 * Auto confirmation window in ms.
 * After this time elapses since deposit creation, GET /api/deposits will auto-advance the record
 * to confirmed + readyToMint for demo purposes.
 */
const AUTO_CONFIRM_MS = 8000;

/* ============================
 * Store (global, in-memory)
 * ============================ */

declare global {
  // eslint-disable-next-line no-var
  var __DEPOSIT_STATE__: Map<string, DepositRecord> | undefined;
}
const deposits: Map<string, DepositRecord> =
  globalThis.__DEPOSIT_STATE__ ?? new Map<string, DepositRecord>();
globalThis.__DEPOSIT_STATE__ = deposits;

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

function nowISO(): string {
  return new Date().toISOString();
}

function normalizeAddress(addr: string | undefined | null): HexAddress | null {
  if (!addr || typeof addr !== "string") return null;
  const a = addr.trim();
  if (!ADDRESS_REGEX.test(a)) return null;
  return a.toLowerCase() as HexAddress;
}

function isValidAmount(amount: unknown): boolean {
  if (typeof amount === "number") {
    // Convert to string to validate via regex
    return AMOUNT_REGEX.test(amount.toString());
  }
  if (typeof amount === "string") {
    return AMOUNT_REGEX.test(amount.trim());
  }
  return false;
}

function toAmountString(amount: string | number): string {
  return typeof amount === "number" ? amount.toString() : amount.trim();
}

function genId(prefix = "dep"): string {
  // Simple unique-ish ID for demo use only
  const rand = Math.random().toString(36).slice(2, 8);
  const ts = Date.now().toString(36);
  return `${prefix}_${ts}${rand}`;
}

/**
 * Auto-advance status based on elapsed time since creation.
 * If pending/confirming and elapsed > AUTO_CONFIRM_MS -> confirm + readyToMint.
 */
function maybeAutoAdvance(rec: DepositRecord): DepositRecord {
  const created = Date.parse(rec.createdAt);
  const elapsed = Date.now() - created;

  if ((rec.status === "pending" || rec.status === "confirming") && elapsed >= AUTO_CONFIRM_MS) {
    rec.status = "confirmed";
    rec.readyToMint = true;
    rec.confirmations = (rec.confirmations ?? 0) + 1;
    rec.updatedAt = nowISO();
  }

  return rec;
}

/**
 * Extend response with polling hints.
 */
function withPollingHints(rec: DepositRecord) {
  let etaMs: number | null = null;
  if (rec.status === "pending" || rec.status === "confirming") {
    const created = Date.parse(rec.createdAt);
    etaMs = Math.max(0, AUTO_CONFIRM_MS - (Date.now() - created));
  }

  return {
    ...rec,
    etaMs,
    nextAction: rec.readyToMint
      ? "mint_available"
      : rec.status === "failed"
        ? "contact_support"
        : "wait_for_bank",
  };
}

/* ============================
 * Handlers
 * ============================ */

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const qAddr = searchParams.get("address");
  const address = normalizeAddress(qAddr);

  if (id) {
    const rec = deposits.get(id);
    if (!rec) return jsonErr("Deposit not found", 404);

    const updated = maybeAutoAdvance(rec);
    deposits.set(id, updated);
    return jsonOk(withPollingHints(updated));
  }

  if (address) {
    const list = Array.from(deposits.values())
      .filter((r) => r.address === address)
      .map((r) => {
        const updated = maybeAutoAdvance(r);
        deposits.set(updated.id, updated);
        return withPollingHints(updated);
      });
    return jsonOk({ count: list.length, records: list });
  }

  // Admin/list all
  const all = Array.from(deposits.values()).map((r) => {
    const updated = maybeAutoAdvance(r);
    deposits.set(updated.id, updated);
    return withPollingHints(updated);
  });
  return jsonOk({ count: all.length, records: all });
}

export async function POST(request: Request) {
  let body: PostBody | null = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  if (!body) return jsonErr("Invalid JSON body", 400);

  const address = normalizeAddress(body.address);
  if (!address) return jsonErr("Invalid or missing 'address'", 422);

  if (!isValidAmount(body.amount)) {
    return jsonErr("Invalid or missing 'amount' (must be a positive number/string with up to 18 decimals)", 422);
  }
  const amount = toAmountString(body.amount!);

  const currency =
    typeof body.currency === "string" && body.currency.trim() ? body.currency.trim().toUpperCase() : DEFAULT_CURRENCY;

  const id = genId();
  const now = nowISO();
  const rec: DepositRecord = {
    id,
    address,
    amount,
    currency,
    status: "pending",
    readyToMint: false,
    createdAt: now,
    updatedAt: now,
    confirmations: 0,
    ...(body.notes ? { notes: body.notes } : {}),
  };

  deposits.set(id, rec);
  return jsonOk(withPollingHints(rec), { status: 201 });
}

export async function PATCH(request: Request) {
  let body: PatchBody | null = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  if (!body) return jsonErr("Invalid JSON body", 400);

  const { id } = body;
  if (!id || !deposits.has(id)) return jsonErr("Missing or invalid 'id'", 422);

  const rec = deposits.get(id)!;

  if (typeof body.status === "string") {
    const allowed: DepositStatus[] = ["pending", "confirming", "confirmed", "failed"];
    if (!allowed.includes(body.status)) {
      return jsonErr(`Invalid 'status'. Allowed: ${allowed.join(", ")}`, 422);
    }
    rec.status = body.status;
  }

  if (typeof body.readyToMint === "boolean") {
    rec.readyToMint = body.readyToMint;
  }

  if (typeof body.notes === "string") {
    rec.notes = body.notes.trim();
  }

  if (typeof body.confirmations === "number" && Number.isFinite(body.confirmations) && body.confirmations >= 0) {
    rec.confirmations = Math.floor(body.confirmations);
  }

  rec.updatedAt = nowISO();
  deposits.set(id, rec);
  return jsonOk(withPollingHints(rec));
}

export async function DELETE(request: Request) {
  let body: { id?: string } | null = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  if (!body) return jsonErr("Invalid JSON body", 400);

  const { id } = body;
  if (!id) return jsonErr("Missing 'id'", 422);

  const existed = deposits.delete(id);
  return jsonOk({ deleted: existed, id });
}
