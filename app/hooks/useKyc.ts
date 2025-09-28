"use client";

/**
 * KYC & Deposit Hooks (client-side)
 *
 * Provides:
 * - useKyc: fetch & poll KYC status for an address, derived gating booleans
 * - useDeposits: create & poll deposits until readyToMint, list deposits
 * - useMintGate: compose KYC + Deposits to compute "mintEnabled"
 *
 * These hooks target the API routes:
 *  - /api/kyc
 *  - /api/deposits
 *
 * Notes:
 * - Keep hooks client-side only; server components must not call them.
 * - All hooks accept an optional "address". If omitted, they'll use the active wallet address.
 * - They support polling with sensible defaults and visibility-aware intervals.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useActiveAccount } from "thirdweb/react";

/* =========================================
 * Constants Over Magic Numbers
 * ========================================= */

const KYC_API = "/api/kyc";
const DEPOSITS_API = "/api/deposits";

const DEFAULT_KYC_POLL_MS = 5_000;
const DEFAULT_DEPOSIT_POLL_MS = 2_500;

// Gate rules: Adjust as your product evolves
const CAN_MINT_WHEN: KYCStatus[] = ["approved"];
const CAN_SWAP_WHEN: KYCStatus[] = ["approved"];
const CAN_REDEEM_WHEN: KYCStatus[] = ["approved"];

/* =========================================
 * Types
 * ========================================= */

export type HexAddress = `0x${string}`;

export type KYCStatus = "pending" | "approved" | "rejected";

export type KycRecord = {
  address: HexAddress;
  status: KYCStatus;
  updatedAt: string;
  notes?: string;
};

export type DepositStatus = "pending" | "confirming" | "confirmed" | "failed";

export type DepositRecord = {
  id: string;
  address: HexAddress;
  amount: string;
  currency: string;
  status: DepositStatus;
  readyToMint: boolean;
  createdAt: string;
  updatedAt: string;
  confirmations?: number;
  notes?: string;
  fiatRefId?: string;
  chainTxHash?: string;
  // Hints for polling UI (from API)
  etaMs?: number | null;
  nextAction?: "mint_available" | "contact_support" | "wait_for_bank";
};



/* =========================================
 * Utilities
 * ========================================= */

/**
 * Safe JSON fetch wrapper with error normalization.
 */
async function fetchJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  const controller = new AbortController();
  const id =
    init?.timeoutMs && init.timeoutMs > 0
      ? setTimeout(() => controller.abort(), init.timeoutMs)
      : undefined;

  try {
    const res = await fetch(input, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      signal: controller.signal,
      cache: "no-store",
    });

    const raw = (await res.json()) as unknown;

    if (!res.ok) {
      const r = (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null);
      const msg =
        (r && typeof r.error === "string" ? r.error : undefined) ||
        `Request failed with status ${res.status}`;
      throw new Error(msg);
    }

    // Validate union shape and extract data
    const r = (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null);
    if (!r || r.ok !== true || !("data" in r)) {
      throw new Error("Malformed response");
    }
    return (r as { ok: true; data: T }).data;
  } finally {
    if (id) clearTimeout(id);
  }
}

/**
 * Visibility-aware interval.
 * Skips execution when document is hidden to reduce noise.
 */
function useVisibilityInterval(
  cb: () => void,
  delayMs: number | null,
  enabled: boolean,
) {
  const saved = useRef(cb);
  useEffect(() => {
    saved.current = cb;
  }, [cb]);

  useEffect(() => {
    if (!enabled || delayMs === null) return;

    let raf = 0;
    let id: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) {
        // Try again on next animation frame to keep loop responsive
        raf = requestAnimationFrame(tick);
        return;
      }
      saved.current();
    };

    id = setInterval(tick, delayMs);
    return () => {
      if (id) clearInterval(id);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [delayMs, enabled]);
}

/* =========================================
 * KYC Hook
 * ========================================= */

export type UseKycOptions = {
  address?: HexAddress;
  pollMs?: number;
  autoStart?: boolean;
};

export type UseKycResult = {
  address?: HexAddress;
  loading: boolean;
  error?: string;
  record?: KycRecord;
  refresh: () => Promise<void>;
  // Gating booleans
  kycStatus?: KYCStatus;
  kycApproved: boolean;
  canMint: boolean;
  canSwap: boolean;
  canRedeem: boolean;
  // Admin helpers (in-memory API)
  setStatus: (status: KYCStatus, notes?: string) => Promise<void>;
  reset: () => Promise<void>;
};

export function useKyc(options?: UseKycOptions): UseKycResult {
  const account = useActiveAccount();
  const address = useMemo<HexAddress | undefined>(() => {
    return options?.address ?? (account?.address as HexAddress | undefined);
  }, [account?.address, options?.address]);

  const pollMs = options?.pollMs ?? DEFAULT_KYC_POLL_MS;
  const autoStart = options?.autoStart ?? true;

  const [loading, setLoading] = useState<boolean>(false);
  const [record, setRecord] = useState<KycRecord | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  const fetchKyc = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(undefined);
    try {
      const data = await fetchJson<KycRecord>(`${KYC_API}?address=${address}`);
      setRecord(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (!address || !autoStart) return;
    void fetchKyc();
  }, [address, autoStart, fetchKyc]);

  useVisibilityInterval(
    () => {
      void fetchKyc();
    },
    address && autoStart ? pollMs : null,
    Boolean(address && autoStart),
  );

  const kycStatus = record?.status;
  const kycApproved = kycStatus === "approved";
  const canMint = kycApproved && CAN_MINT_WHEN.includes("approved");
  const canSwap = kycApproved && CAN_SWAP_WHEN.includes("approved");
  const canRedeem = kycApproved && CAN_REDEEM_WHEN.includes("approved");

  const setStatus = useCallback(
    async (status: KYCStatus, notes?: string) => {
      if (!address) throw new Error("KYC: missing address");
      setLoading(true);
      setError(undefined);
      try {
        const data = await fetchJson<{ previous: KycRecord | null; current: KycRecord }>(KYC_API, {
          method: "PATCH",
          body: JSON.stringify({ address, status, ...(notes ? { notes } : {}) }),
        });
        setRecord(data.current);
      } catch (e) {
        setError((e as Error).message);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [address],
  );

  const reset = useCallback(async () => {
    if (!address) throw new Error("KYC: missing address");
    setLoading(true);
    setError(undefined);
    try {
      await fetchJson<{ deleted: boolean; address: HexAddress }>(KYC_API, {
        method: "DELETE",
        body: JSON.stringify({ address }),
      });
      setRecord(undefined);
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [address]);

  return {
    address,
    loading,
    error,
    record,
    refresh: fetchKyc,
    kycStatus,
    kycApproved,
    canMint,
    canSwap,
    canRedeem,
    setStatus,
    reset,
  };
}

/* =========================================
 * Deposits Hook
 * ========================================= */

export type CreateDepositInput = {
  amount: string | number;
  currency?: string;
  notes?: string;
};

export type UseDepositsOptions = {
  address?: HexAddress;
  pollMs?: number;
  autoStart?: boolean; // auto-list on mount
};

export type UseDepositsResult = {
  address?: HexAddress;
  loading: boolean;
  error?: string;
  // CRUD
  create: (input: CreateDepositInput) => Promise<DepositRecord>;
  get: (id: string) => Promise<DepositRecord>;
  list: () => Promise<DepositRecord[]>;
  // Polling single deposit until ready or failure
  poll: (id: string, onUpdate?: (d: DepositRecord) => void) => void;
  stopPolling: () => void;
  // State from last list/get
  records: DepositRecord[];
  lastFetched?: number;
};

export function useDeposits(options?: UseDepositsOptions): UseDepositsResult {
  const account = useActiveAccount();
  const address = useMemo<HexAddress | undefined>(() => {
    return options?.address ?? (account?.address as HexAddress | undefined);
  }, [account?.address, options?.address]);

  const pollMs = options?.pollMs ?? DEFAULT_DEPOSIT_POLL_MS;
  const autoStart = options?.autoStart ?? false;

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [records, setRecords] = useState<DepositRecord[]>([]);
  const [lastFetched, setLastFetched] = useState<number | undefined>(undefined);

  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollIdRef = useRef<string | null>(null);
  const pollCbRef = useRef<((d: DepositRecord) => void) | undefined>(undefined);

  const create = useCallback(
    async (input: CreateDepositInput) => {
      if (!address) throw new Error("Deposits: missing address");
      setLoading(true);
      setError(undefined);
      try {
        const body = { address, ...input };
        const data = await fetchJson<DepositRecord>(DEPOSITS_API, {
          method: "POST",
          body: JSON.stringify(body),
        });
        // Keep local list up to date (prepend new)
        setRecords((prev) => [data, ...prev]);
        setLastFetched(Date.now());
        return data;
      } catch (e) {
        setError((e as Error).message);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [address],
  );

  const get = useCallback(async (id: string) => {
    setError(undefined);
    const data = await fetchJson<DepositRecord>(`${DEPOSITS_API}?id=${id}`);
    return data;
  }, []);

  const list = useCallback(async () => {
    if (!address) return [];
    setLoading(true);
    setError(undefined);
    try {
      const data = await fetchJson<{ count: number; records: DepositRecord[] }>(
        `${DEPOSITS_API}?address=${address}`,
      );
      setRecords(data.records);
      setLastFetched(Date.now());
      return data.records;
    } catch (e) {
      setError((e as Error).message);
      return [];
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (!address || !autoStart) return;
    void list();
  }, [address, autoStart, list]);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
    pollIdRef.current = null;
    pollCbRef.current = undefined;
  }, []);

  const poll = useCallback(
    (id: string, onUpdate?: (d: DepositRecord) => void) => {
      stopPolling();
      pollIdRef.current = id;
      pollCbRef.current = onUpdate;

      const tick = async () => {
        // Respect visibility to reduce churn
        if (typeof document !== "undefined" && document.hidden) return;

        try {
          const data = await fetchJson<DepositRecord>(`${DEPOSITS_API}?id=${id}`);
          onUpdate?.(data);

          // Update local list with latest info
          setRecords((prev) => {
            const idx = prev.findIndex((r) => r.id === id);
            if (idx === -1) return prev;
            const clone = prev.slice();
            clone[idx] = data;
            return clone;
          });

          if (data.readyToMint || data.status === "failed") {
            stopPolling();
          }
        } catch (e) {
          // Stop polling on error to avoid infinite loops
          stopPolling();
          setError((e as Error).message);
        }
      };

      // Immediate first tick for fast UI
      void tick();
      pollTimer.current = setInterval(tick, pollMs);
    },
    [pollMs, stopPolling],
  );

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  return {
    address,
    loading,
    error,
    create,
    get,
    list,
    poll,
    stopPolling,
    records,
    lastFetched,
  };
}

/* =========================================
 * Mint Gate (composition)
 * ========================================= */

export type UseMintGateOptions = {
  address?: HexAddress;
  depositId?: string | null;
  kycPollMs?: number;
  depositPollMs?: number;
};

export type UseMintGateResult = {
  address?: HexAddress;
  loading: boolean;
  error?: string;
  kyc?: KycRecord;
  kycApproved: boolean;
  deposit?: DepositRecord;
  readyToMint: boolean;
  mintEnabled: boolean;
  refreshAll: () => Promise<void>;
  // Controls for polling a specific deposit until ready
  startDepositPolling: (id: string, onUpdate?: (d: DepositRecord) => void) => void;
  stopDepositPolling: () => void;
};

export function useMintGate(options?: UseMintGateOptions): UseMintGateResult {
  const account = useActiveAccount();
  const address = useMemo<HexAddress | undefined>(() => {
    return options?.address ?? (account?.address as HexAddress | undefined);
  }, [account?.address, options?.address]);

  // KYC
  const {
    record: kyc,
    kycApproved,
    loading: kycLoading,
    error: kycError,
    refresh: refreshKyc,
  } = useKyc({
    address,
    pollMs: options?.kycPollMs ?? DEFAULT_KYC_POLL_MS,
    autoStart: true,
  });

  // Deposits
  const {
    get,
    poll,
    stopPolling,
    loading: depLoading,
    error: depError,
  } = useDeposits({
    address,
    pollMs: options?.depositPollMs ?? DEFAULT_DEPOSIT_POLL_MS,
    autoStart: false,
  });

  const [deposit, setDeposit] = useState<DepositRecord | undefined>(undefined);

  const fetchDepositIfSet = useCallback(async () => {
    if (!options?.depositId) return;
    try {
      const rec = await get(options.depositId);
      setDeposit(rec);
    } catch {
      // Surface via error
    }
  }, [get, options?.depositId]);

  useEffect(() => {
    void fetchDepositIfSet();
  }, [fetchDepositIfSet]);

  const startDepositPolling = useCallback(
    (id: string, onUpdate?: (d: DepositRecord) => void) => {
      poll(id, (d) => {
        setDeposit(d);
        onUpdate?.(d);
      });
    },
    [poll],
  );

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshKyc(), fetchDepositIfSet()]);
  }, [refreshKyc, fetchDepositIfSet]);

  const readyToMint = Boolean(deposit?.readyToMint);
  const mintEnabled = Boolean(kycApproved && readyToMint);

  return {
    address,
    loading: kycLoading || depLoading,
    error: kycError || depError,
    kyc,
    kycApproved,
    deposit,
    readyToMint,
    mintEnabled,
    refreshAll,
    startDepositPolling,
    stopDepositPolling: stopPolling,
  };
}
