"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Spinner,
  cn,
} from "../components/ui";

/**
 * Admin Dashboard
 * - Roles Management (localStorage-persisted demo)
 * - Allow / Deny Lists with CSV upload (localStorage-persisted demo)
 * - KYC Management via in-memory API (/api/kyc)
 *
 * NOTE: Roles/Allow/Deny here are local-only demo states.
 * KYC uses in-memory API routes provided by the app.
 */

/* =========================================
 * Types & Constants
 * ========================================= */
type HexAddress = `0x${string}`;
type KYCStatus = "pending" | "approved" | "rejected";

type KycRecord = {
  address: HexAddress;
  status: KYCStatus;
  updatedAt: string;
  notes?: string;
};

type RolesState = {
  ADMIN: HexAddress[];
  MINTER: HexAddress[];
  BURNER: HexAddress[];
  PAUSER: HexAddress[];
};

type ListState = {
  allow: HexAddress[];
  deny: HexAddress[];
};

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const KYC_API = "/api/kyc";

const STORAGE_KEYS = {
  ROLES: "winr_admin_roles_v1",
  LISTS: "winr_admin_lists_v1",
} as const;

const DEFAULT_ROLES: RolesState = {
  ADMIN: [],
  MINTER: [],
  BURNER: [],
  PAUSER: [],
};

const DEFAULT_LISTS: ListState = {
  allow: [],
  deny: [],
};

/* =========================================
 * Utilities
 * ========================================= */
function isHexAddress(addr: string): boolean {
  return ADDRESS_REGEX.test(addr.trim());
}

function normalizeAddress(addr: string): HexAddress {
  return addr.trim().toLowerCase() as HexAddress;
}

function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

async function fetchJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const json = await res.json();
  // The API wraps with { ok, data }, both for GET and mutations
  if (!res.ok || json?.ok === false) {
    const msg = json?.error || `Request failed with status ${res.status}`;
    throw new Error(msg);
  }
  return json.data as T;
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.setAttribute("href", url);
  a.setAttribute("download", filename);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/* CSV parsing - accepts either:
 * - "address" header; or
 * - address only per line; or
 * - address,status per line (status will be ignored in allow/deny import)
 */
function parseCsvAddresses(csv: string) {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const header = lines[0]?.toLowerCase() ?? "";
  const hasHeader = header.includes("address");
  const start = hasHeader ? 1 : 0;

  const addresses: string[] = [];
  const invalid: string[] = [];

  for (let i = start; i < lines.length; i++) {
    const row = lines[i];
    const [addr] = row.split(",").map((c) => c.trim());
    if (!addr) continue;

    if (isHexAddress(addr)) {
      addresses.push(normalizeAddress(addr));
    } else {
      invalid.push(row);
    }
  }

  const unique = dedupe(addresses) as HexAddress[];
  return { addresses: unique, invalid };
}

/* =========================================
 * Local Storage Hooks
 * ========================================= */
function useLocalStorageState<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return initial;
      return JSON.parse(raw) as T;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // ignore
    }
  }, [key, state]);

  return [state, setState] as const;
}

/* =========================================
 * KYC Management
 * ========================================= */
function useKycAdmin() {
  const [records, setRecords] = useState<KycRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      // Admin list: GET /api/kyc -> { data: { count, records } }
      const res = await fetchJson<{ count: number; records: KycRecord[] }>(KYC_API);
      setRecords(res.records ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const initPending = useCallback(async (address: HexAddress, notes?: string) => {
    setLoading(true);
    setError(undefined);
    try {
      const rec = await fetchJson<KycRecord>(KYC_API, {
        method: "POST",
        body: JSON.stringify({ address, ...(notes ? { notes } : {}) }),
      });
      // Upsert
      setRecords((prev) => {
        const idx = prev.findIndex((r) => r.address === rec.address);
        if (idx === -1) return [rec, ...prev];
        const clone = prev.slice();
        clone[idx] = rec;
        return clone;
      });
      return rec;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const setStatus = useCallback(
    async (address: HexAddress, status: KYCStatus, notes?: string) => {
      setError(undefined);
      const res = await fetchJson<{ previous: KycRecord | null; current: KycRecord }>(
        KYC_API,
        {
          method: "PATCH",
          body: JSON.stringify({ address, status, ...(notes ? { notes } : {}) }),
        },
      );
      setRecords((prev) => {
        const idx = prev.findIndex((r) => r.address === address);
        if (idx === -1) return [res.current, ...prev];
        const clone = prev.slice();
        clone[idx] = res.current;
        return clone;
      });
      return res.current;
    },
    [],
  );

  const remove = useCallback(async (address: HexAddress) => {
    setError(undefined);
    await fetchJson<{ deleted: boolean; address: HexAddress }>(KYC_API, {
      method: "DELETE",
      body: JSON.stringify({ address }),
    });
    setRecords((prev) => prev.filter((r) => r.address !== address));
  }, []);

  return { records, loading, error, refresh, initPending, setStatus, remove };
}

/* =========================================
 * Component
 * ========================================= */
export default function AdminPage() {
  // Roles state (local-only demo)
  const [roles, setRoles] = useLocalStorageState<RolesState>(
    STORAGE_KEYS.ROLES,
    DEFAULT_ROLES,
  );
  const [roleAddress, setRoleAddress] = useState<string>("");
  const [roleName, setRoleName] = useState<keyof RolesState>("ADMIN");

  // Allow/Deny lists (local-only demo)
  const [lists, setLists] = useLocalStorageState<ListState>(
    STORAGE_KEYS.LISTS,
    DEFAULT_LISTS,
  );
  const [listAddress, setListAddress] = useState<string>("");
  const [listType, setListType] = useState<keyof ListState>("allow");

  // CSV upload state
  const [csvText, setCsvText] = useState<string>("");
  const [csvParseSummary, setCsvParseSummary] = useState<{
    total: number;
    valid: number;
    invalid: number;
  } | null>(null);
  const [csvInvalidRows, setCsvInvalidRows] = useState<string[]>([]);
  const [csvParsedAddresses, setCsvParsedAddresses] = useState<HexAddress[]>([]);
  const [csvTarget, setCsvTarget] = useState<keyof ListState>("allow");

  // KYC admin
  const { records, loading, error, refresh, initPending, setStatus, remove } =
    useKycAdmin();
  const [kycSearch, setKycSearch] = useState<string>("");
  const [kycInitAddress, setKycInitAddress] = useState<string>("");
  const [kycInitNotes, setKycInitNotes] = useState<string>("");

  // Toast-like messages (inline alerts)
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showMessage = useCallback((kind: "success" | "error", text: string) => {
    setMessage({ kind, text });
    if (messageTimer.current) clearTimeout(messageTimer.current);
    messageTimer.current = setTimeout(() => setMessage(null), 3500);
  }, []);
  useEffect(() => {
    return () => {
      if (messageTimer.current) {
        clearTimeout(messageTimer.current);
        messageTimer.current = null;
      }
    };
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filteredKyc = useMemo(() => {
    const q = kycSearch.trim().toLowerCase();
    if (!q) return records;
    return records.filter(
      (r) =>
        r.address.includes(q) ||
        r.status.toLowerCase().includes(q) ||
        (r.notes ?? "").toLowerCase().includes(q),
    );
  }, [records, kycSearch]);

  /* ============================
   * Roles handlers
   * ============================ */
  const onAddRole = useCallback(() => {
    if (!isHexAddress(roleAddress)) {
      showMessage("error", "Invalid address.");
      return;
    }
    const addr = normalizeAddress(roleAddress);
    setRoles((prev) => {
      const next = { ...prev };
      next[roleName] = dedupe([...(next[roleName] ?? []), addr]);
      return next;
    });
    setRoleAddress("");
    showMessage("success", `Added to ${roleName}`);
  }, [roleAddress, roleName, setRoles, showMessage]);

  const onRemoveRole = useCallback(
    (name: keyof RolesState, addr: HexAddress) => {
      setRoles((prev) => {
        const next = { ...prev };
        next[name] = (next[name] ?? []).filter((a) => a !== addr);
        return next;
      });
      showMessage("success", `Removed from ${name}`);
    },
    [setRoles, showMessage],
  );

  /* ============================
   * Allow/Deny handlers
   * ============================ */
  const onAddList = useCallback(() => {
    if (!isHexAddress(listAddress)) {
      showMessage("error", "Invalid address.");
      return;
    }
    const addr = normalizeAddress(listAddress);
    setLists((prev) => {
      const next = { ...prev };
      next[listType] = dedupe([...(next[listType] ?? []), addr]);
      return next;
    });
    setListAddress("");
    showMessage("success", `Added to ${listType} list`);
  }, [listAddress, listType, setLists, showMessage]);

  const onRemoveList = useCallback(
    (type: keyof ListState, addr: HexAddress) => {
      setLists((prev) => {
        const next = { ...prev };
        next[type] = (next[type] ?? []).filter((a) => a !== addr);
        return next;
      });
      showMessage("success", `Removed from ${type} list`);
    },
    [setLists, showMessage],
  );

  const onDownloadList = useCallback(
    (type: keyof ListState) => {
      const rows = (lists[type] ?? []).join("\n");
      downloadText(`${type}-list.csv`, `address\n${rows}\n`);
    },
    [lists],
  );

  const onCopyList = useCallback(
    async (type: keyof ListState) => {
      const ok = await copyToClipboard((lists[type] ?? []).join("\n"));
      showMessage(ok ? "success" : "error", ok ? "Copied!" : "Copy failed");
    },
    [lists, showMessage],
  );

  /* ============================
   * CSV upload handlers
   * ============================ */
  const onCsvFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setCsvText(text);
      const res = parseCsvAddresses(text);
      setCsvParsedAddresses(res.addresses);
      setCsvInvalidRows(res.invalid);
      setCsvParseSummary({
        total: text.split(/\r?\n/).filter(Boolean).length,
        valid: res.addresses.length,
        invalid: res.invalid.length,
      });
    };
    reader.readAsText(file);
  }, []);

  const onCsvApply = useCallback(() => {
    if (csvParsedAddresses.length === 0) {
      showMessage("error", "No valid addresses parsed.");
      return;
    }
    setLists((prev) => {
      const next = { ...prev };
      next[csvTarget] = dedupe([...(next[csvTarget] ?? []), ...csvParsedAddresses]);
      return next;
    });
    showMessage("success", `Imported ${csvParsedAddresses.length} to ${csvTarget} list`);
    // Reset parse state
    setCsvText("");
    setCsvParsedAddresses([]);
    setCsvInvalidRows([]);
    setCsvParseSummary(null);
  }, [csvParsedAddresses, csvTarget, setLists, showMessage]);

  /* ============================
   * KYC handlers
   * ============================ */
  const onKycInit = useCallback(async () => {
    if (!isHexAddress(kycInitAddress)) {
      showMessage("error", "Invalid address.");
      return;
    }
    try {
      await initPending(normalizeAddress(kycInitAddress), kycInitNotes || undefined);
      setKycInitAddress("");
      setKycInitNotes("");
      showMessage("success", "KYC record initialized.");
    } catch (e) {
      showMessage("error", (e as Error).message);
    }
  }, [kycInitAddress, kycInitNotes, initPending, showMessage]);

  const onKycStatusChange = useCallback(
    async (addr: HexAddress, status: KYCStatus) => {
      try {
        await setStatus(addr, status);
        showMessage("success", `KYC updated to ${status}`);
      } catch (e) {
        showMessage("error", (e as Error).message);
      }
    },
    [setStatus, showMessage],
  );

  const onKycDelete = useCallback(
    async (addr: HexAddress) => {
      try {
        await remove(addr);
        showMessage("success", "KYC record deleted.");
      } catch (e) {
        showMessage("error", (e as Error).message);
      }
    },
    [remove, showMessage],
  );

  /* ============================
   * Render helpers
   * ============================ */
  const RoleList = ({
    name,
    items,
  }: {
    name: keyof RolesState;
    items: HexAddress[];
  }) => (
    <div className="mt-3">
      <div className="text-sm font-medium">{name}</div>
      {items.length === 0 ? (
        <div className="mt-1 text-xs text-foreground/60">No addresses</div>
      ) : (
        <ul className="mt-2 space-y-1">
          {items.map((addr) => (
            <li
              key={`${name}-${addr}`}
              className="flex items-center justify-between rounded border px-2 py-1 text-xs"
            >
              <span className="truncate">{addr}</span>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => onRemoveRole(name, addr)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const ListBox = ({
    title,
    type,
    items,
  }: {
    title: string;
    type: keyof ListState;
    items: HexAddress[];
  }) => (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Local demo list (not on-chain).</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            value={listAddress}
            onChange={(e) => setListAddress(e.target.value)}
            placeholder="0x..."
            label="Add address"
          />
          <div className="flex items-end gap-2">
            <select
              className="h-10 rounded-md border px-3 text-sm bg-transparent"
              value={listType}
              onChange={(e) => setListType(e.target.value as keyof ListState)}
              aria-label="List type"
            >
              <option value="allow">allow</option>
              <option value="deny">deny</option>
            </select>
            <Button type="button" onClick={onAddList}>
              Add
            </Button>
          </div>
        </div>

        <div className="mt-4 text-xs text-foreground/60">
          Count: <span className="font-medium text-foreground">{items.length}</span>
        </div>
        {items.length ? (
          <ul className="mt-2 space-y-1">
            {items.map((addr) => (
              <li
                key={`${type}-${addr}`}
                className="flex items-center justify-between rounded border px-2 py-1 text-xs"
              >
                <span className="truncate">{addr}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => onRemoveList(type, addr)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-2 text-xs text-foreground/60">No addresses</div>
        )}
      </CardContent>
      <CardFooter className="justify-between">
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={() => onDownloadList(type)}>
            Download CSV
          </Button>
          <Button type="button" variant="secondary" onClick={() => onCopyList(type)}>
            Copy
          </Button>
        </div>
        <Badge variant="neutral" dot>
          {type}
        </Badge>
      </CardFooter>
    </Card>
  );

  return (
    <div className="min-h-screen p-6 sm:p-10">
      <header className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
        {message && (
          <div className="w-full sm:w-auto">
            <Alert
              variant={message.kind === "success" ? "success" : "error"}
              title={message.kind === "success" ? "Success" : "Error"}
            >
              {message.text}
            </Alert>
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Roles Management */}
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Roles</CardTitle>
            <CardDescription>Local demo roles. Persisted in your browser.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={roleAddress}
                onChange={(e) => setRoleAddress(e.target.value)}
                placeholder="0x..."
                label="Role address"
              />
              <div className="flex items-end gap-2">
                <select
                  className="h-10 rounded-md border px-3 text-sm bg-transparent"
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value as keyof RolesState)}
                  aria-label="Role"
                >
                  <option value="ADMIN">ADMIN</option>
                  <option value="MINTER">MINTER</option>
                  <option value="BURNER">BURNER</option>
                  <option value="PAUSER">PAUSER</option>
                </select>
                <Button type="button" onClick={onAddRole}>
                  Add
                </Button>
              </div>
            </div>

            <RoleList name="ADMIN" items={roles.ADMIN} />
            <RoleList name="MINTER" items={roles.MINTER} />
            <RoleList name="BURNER" items={roles.BURNER} />
            <RoleList name="PAUSER" items={roles.PAUSER} />
          </CardContent>
        </Card>

        {/* Lists + CSV */}
        <div className="col-span-1 flex flex-col gap-6">
          <ListBox title="Allow List" type="allow" items={lists.allow} />
          <ListBox title="Deny List" type="deny" items={lists.deny} />
        </div>

        {/* KYC Management */}
        <Card className="col-span-1 lg:col-span-1">
          <CardHeader>
            <CardTitle>KYC Management</CardTitle>
            <CardDescription>
              Uses an in-memory API (/api/kyc). Initialize, update, and delete KYC records.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={kycInitAddress}
                onChange={(e) => setKycInitAddress(e.target.value)}
                placeholder="0x..."
                label="Initialize KYC (pending)"
              />
              <Input
                value={kycInitNotes}
                onChange={(e) => setKycInitNotes(e.target.value)}
                placeholder="Optional notes"
              />
              <div className="flex items-end">
                <Button type="button" onClick={onKycInit}>
                  Init
                </Button>
              </div>
            </div>

            <div className="mt-4 flex items-end gap-2">
              <Input
                value={kycSearch}
                onChange={(e) => setKycSearch(e.target.value)}
                placeholder="Search address, status, notes"
                label="Search"
              />
              <Button type="button" variant="secondary" onClick={() => void refresh()}>
                Refresh
              </Button>
            </div>

            {loading ? (
              <div className="mt-4 inline-flex items-center gap-2 text-sm">
                <Spinner />
                Loading KYC...
              </div>
            ) : error ? (
              <Alert className="mt-4" variant="error" title="KYC error">
                {error}
              </Alert>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="py-2 pr-3 font-medium">Address</th>
                      <th className="py-2 pr-3 font-medium">Status</th>
                      <th className="py-2 pr-3 font-medium">Updated</th>
                      <th className="py-2 pr-3 font-medium">Notes</th>
                      <th className="py-2 pr-3 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredKyc.length === 0 ? (
                      <tr>
                        <td className="py-3 text-foreground/60" colSpan={5}>
                          No KYC records found.
                        </td>
                      </tr>
                    ) : (
                      filteredKyc.map((rec) => (
                        <tr key={rec.address} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-mono">{rec.address}</td>
                          <td className="py-2 pr-3">
                            <div className="inline-flex items-center gap-2">
                              <select
                                className="rounded-md border px-2 py-1 text-xs bg-transparent"
                                value={rec.status}
                                onChange={(e) =>
                                  void onKycStatusChange(
                                    rec.address,
                                    e.target.value as KYCStatus,
                                  )
                                }
                                aria-label="KYC status"
                              >
                                <option value="pending">pending</option>
                                <option value="approved">approved</option>
                                <option value="rejected">rejected</option>
                              </select>
                              <Badge
                                variant={
                                  rec.status === "approved"
                                    ? "success"
                                    : rec.status === "pending"
                                      ? "warning"
                                      : "error"
                                }
                              >
                                {rec.status}
                              </Badge>
                            </div>
                          </td>
                          <td className="py-2 pr-3">
                            <time className="text-foreground/60 text-xs">
                              {new Date(rec.updatedAt).toLocaleString()}
                            </time>
                          </td>
                          <td className="py-2 pr-3 text-xs">
                            {rec.notes ? (
                              <span className="text-foreground/80">{rec.notes}</span>
                            ) : (
                              <span className="text-foreground/40">—</span>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-right">
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => void onKycDelete(rec.address)}
                            >
                              Delete
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* CSV Upload Panel */}
      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>CSV Upload</CardTitle>
            <CardDescription>
              Import addresses into allow/deny lists. CSV may contain header "address", or lines of addresses.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onCsvFile(f);
                    }}
                    aria-label="CSV File"
                  />
                  <select
                    className="h-10 rounded-md border px-3 text-sm bg-transparent"
                    value={csvTarget}
                    onChange={(e) => setCsvTarget(e.target.value as keyof ListState)}
                    aria-label="Import Target"
                  >
                    <option value="allow">allow</option>
                    <option value="deny">deny</option>
                  </select>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      if (!csvText) {
                        showMessage("error", "No CSV text to parse.");
                        return;
                      }
                      const res = parseCsvAddresses(csvText);
                      setCsvParsedAddresses(res.addresses);
                      setCsvInvalidRows(res.invalid);
                      setCsvParseSummary({
                        total: csvText.split(/\r?\n/).filter(Boolean).length,
                        valid: res.addresses.length,
                        invalid: res.invalid.length,
                      });
                    }}
                  >
                    Parse
                  </Button>
                  <Button type="button" onClick={onCsvApply}>
                    Apply
                  </Button>
                </div>
                <div className="mt-2">
                  <textarea
                    className={cn(
                      "w-full min-h-[160px] rounded-md border bg-transparent p-2 text-sm",
                      "border-black/10 dark:border-white/15",
                    )}
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                    placeholder="Paste CSV here or choose file..."
                    aria-label="CSV Content"
                  />
                </div>
              </div>

              <div className="w-full md:w-[360px]">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Parse Summary</CardTitle>
                    <CardDescription>
                      Results of the latest parse operation.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {csvParseSummary ? (
                      <div className="text-sm space-y-1">
                        <div>
                          Total lines:{" "}
                          <span className="font-medium">{csvParseSummary.total}</span>
                        </div>
                        <div>
                          Valid addresses:{" "}
                          <span className="font-medium">{csvParseSummary.valid}</span>
                        </div>
                        <div>
                          Invalid rows:{" "}
                          <span className="font-medium">{csvParseSummary.invalid}</span>
                        </div>

                        <div className="mt-3">
                          <div className="font-medium mb-1">Preview ({csvParsedAddresses.length})</div>
                          <div className="max-h-[140px] overflow-auto rounded border p-2 font-mono text-xs">
                            {csvParsedAddresses.length ? (
                              <ul className="space-y-1">
                                {csvParsedAddresses.slice(0, 50).map((a) => (
                                  <li key={`parsed-${a}`}>{a}</li>
                                ))}
                                {csvParsedAddresses.length > 50 && (
                                  <li className="text-foreground/60">
                                    +{csvParsedAddresses.length - 50} more...
                                  </li>
                                )}
                              </ul>
                            ) : (
                              <span className="text-foreground/60">No addresses parsed.</span>
                            )}
                          </div>
                        </div>

                        {csvInvalidRows.length > 0 && (
                          <div className="mt-3">
                            <div className="font-medium mb-1">Invalid Rows ({csvInvalidRows.length})</div>
                            <div className="max-h-[100px] overflow-auto rounded border p-2 font-mono text-xs text-red-600">
                              <ul className="space-y-1">
                                {csvInvalidRows.slice(0, 50).map((r) => (
                                  <li key={`invalid-${r}`}>{r}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-sm text-foreground/60">
                        Parse a CSV to see results here.
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
