/**
 * Uniswap v4 Swap Module (Lazy-loadable Stub)
 *
 * Purpose:
 * - Provide a placeholder-safe quote and swap flow interface that you can lazy-load in the UI.
 * - Avoids bringing in viem or Uniswap SDK v4 until you are ready (keeps initial bundle smaller).
 * - Computes min received from slippage, checks basic env config, and returns stubbed results with clear TODOs.
 *
 * How to use:
 * - Dynamically import this module from your Swap section (e.g., next/dynamic or import() on click).
 * - Call getQuote(...) to get a placeholder result; render it to the user.
 * - Call prepareSwap(...) to get a structured "steps" response. This stub does NOT build a real transaction.
 * - When integrating, replace stubbed sections with actual viem/Uniswap SDK v4 logic.
 *
 * Compliance (thirdweb v5.108.3):
 * - This file does not import any thirdweb or viem APIs directly.
 * - Contract reads/writes for approvals can be implemented by callers using existing wINR utils
 *   (e.g., ensureAllowance/prepareApprove from app/lib/winr.ts) before executing a real swap.
 *
 * Doc links used for planning:
 * - ThirdwebProvider (v5; no props): https://portal.thirdweb.com/react/v5/migrate/installation
 * - ConnectButton: https://portal.thirdweb.com/react/v5/components/ConnectButton
 * - useActiveAccount: https://portal.thirdweb.com/react/v5/useActiveAccount
 * - useReadContract: https://portal.thirdweb.com/react/v5/useReadContract
 * - useSendTransaction: https://portal.thirdweb.com/react/v5/useSendTransaction
 * - getContract: https://portal.thirdweb.com/references/typescript/v5/getContract
 * - Uniswap v4 quoting: https://docs.uniswap.org/sdk/v4/guides/swaps/quoting
 * - Uniswap v4 single-hop swapping: https://docs.uniswap.org/sdk/v4/guides/swaps/single-hop-swapping
 */
import { ensureAllowance as _ensureAllowance } from "../lib/winr";

/* ============================
 * Types
 * ============================ */

export type Address = `0x${string}`;

export type Token = {
  address: Address;
  symbol: string;
  decimals: number;
};

export type QuoteRequest = {
  inputToken: Token;
  outputToken: Token;
  amountIn: bigint; // in smallest units of inputToken
  // Optional pool information if you have deployed a dedicated pool
  poolAddress?: Address | null;
};

export type QuoteResult = {
  ok: boolean;
  isMock: boolean;
  reason?: string;
  inputToken: Token;
  outputToken: Token;
  amountIn: bigint;
  amountOut: bigint; // placeholder value; replace with real quote
  minAmountOut: bigint; // computed using slippage bps
  slippageBps: number;
  // For transparency/debug:
  poolManagerAddress?: Address | null;
  poolAddress?: Address | null;
  hookAddress?: Address | null;
  warnings?: string[];
};

export type PrepareSwapRequest = {
  inputToken: Token;
  outputToken: Token;
  amountIn: bigint;
  minAmountOut?: bigint; // If omitted, we recompute from the quote result with current slippage.
  account: Address; // User EOA/account initiating the swap
};

export type Step =
  | {
    type: "allowance";
    description: string;
    token: Token;
    spender: Address;
    requiredAmount: bigint;
    recommended: boolean;
  }
  | {
    type: "swap";
    description: string;
    poolManager: Address;
    poolAddress?: Address | null;
    hookAddress?: Address | null;
    // In the real integration, attach prepared transaction data here.
    // Example: transaction?: PreparedTransaction
  };

export type PrepareSwapResult = {
  ok: boolean;
  canExecute: boolean;
  reason?: string;
  steps: Step[];
  // In the real integration, expose transaction objects to pass into useSendTransaction
  // For example:
  // approvalTx?: PreparedTransaction | null;
  // swapTx?: PreparedTransaction | null;
  notes?: string[];
};

/* ============================
 * Errors
 * ============================ */

export class NotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotConfiguredError";
  }
}

export class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotImplementedError";
  }
}

/* ============================
 * Env & Config
 * ============================ */

/**
 * Read and validate NEXT_PUBLIC_* envs.
 */
function getEnvAddress(name: string): Address | null {
  // NOTE: In Next.js, NEXT_PUBLIC_* envs are replaced at build time
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return null;
  if (!raw.startsWith("0x") || raw.length !== 42) return null;
  return raw as Address;
}

function getSlippageBps(): number {
  const raw = (process.env.NEXT_PUBLIC_SWAP_DEFAULT_SLIPPAGE_BPS ?? "").trim();
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 50; // default 0.50%
  return Math.min(5000, Math.max(0, Math.floor(n))); // clamp: 0%..50%
}

export function getSwapConfig() {
  return {
    poolManagerAddress: getEnvAddress("NEXT_PUBLIC_UNISWAP_V4_POOLMANAGER_ADDRESS"),
    poolAddress: getEnvAddress("NEXT_PUBLIC_UNISWAP_V4_POOL_ADDRESS"),
    hookAddress: getEnvAddress("NEXT_PUBLIC_UNISWAP_V4_HOOK_ADDRESS"),
    slippageBps: getSlippageBps(),
  };
}

export function isSwapConfigured(): boolean {
  const cfg = getSwapConfig();
  // The PoolManager address is essential to perform swaps.
  return Boolean(cfg.poolManagerAddress);
}

/* ============================
 * Math helpers
 * ============================ */

function mulDiv(a: bigint, b: bigint, c: bigint): bigint {
  // (a*b)/c using integer math
  return (a * b) / c;
}

function computeMinOut(amountOut: bigint, slippageBps: number): bigint {
  const bps = BigInt(slippageBps);
  const denom = 10_000n;
  // minOut = amountOut * (1 - bps/10000)
  const penalty = mulDiv(amountOut, bps, denom);
  const result = amountOut - penalty;
  return result < 0n ? 0n : result;
}

/* ============================
 * Quote (Stub)
 * ============================ */

/**
 * getQuote (Stub)
 *
 * Returns a placeholder 1:1 amountOut for demonstration and computes minAmountOut
 * using the configured slippage. It also reports the PoolManager/pool addresses
 * so you can confirm wiring, but does not query on-chain state.
 *
 * TODO (real integration):
 * - Use Uniswap v4 SDK v4 + viem or a dedicated quoter to fetch a real quote.
 * - Support routes (single-hop/multi-hop), tick spacing, fees, and hook data.
 * - Estimate gas for the swap path.
 */
export async function getQuote(req: QuoteRequest): Promise<QuoteResult> {
  const cfg = getSwapConfig();
  const warnings: string[] = [];
  let reason: string | undefined;

  if (!cfg.poolManagerAddress) {
    reason =
      "Uniswap v4 PoolManager is not configured. Set NEXT_PUBLIC_UNISWAP_V4_POOLMANAGER_ADDRESS.";
  }

  if (!cfg.poolAddress) {
    warnings.push(
      "Pool address is not set. If your app relies on a specific pool, set NEXT_PUBLIC_UNISWAP_V4_POOL_ADDRESS.",
    );
  }

  if (!cfg.hookAddress) {
    warnings.push(
      "Hook address is not set. If your pool uses a custom hook, set NEXT_PUBLIC_UNISWAP_V4_HOOK_ADDRESS.",
    );
  }

  // Placeholder: assume 1:1 for demo only
  const mockAmountOut = req.amountIn;
  const slippageBps = cfg.slippageBps;
  const minAmountOut = computeMinOut(mockAmountOut, slippageBps);

  return {
    ok: Boolean(cfg.poolManagerAddress),
    isMock: true,
    reason,
    inputToken: req.inputToken,
    outputToken: req.outputToken,
    amountIn: req.amountIn,
    amountOut: mockAmountOut,
    minAmountOut,
    slippageBps,
    poolManagerAddress: cfg.poolManagerAddress,
    poolAddress: cfg.poolAddress,
    hookAddress: cfg.hookAddress,
    warnings,
  };
}

/* ============================
 * Prepare Swap (Stub)
 * ============================ */

/**
 * prepareSwap (Stub)
 *
 * Returns a list of recommended steps for the UI:
 *  - Allowance check & approval for the input token to the PoolManager
 *  - Swap execution via PoolManager
 *
 * This does NOT build a real transaction. Use this output to guide your UI:
 *  - If you already have allowance info in your app, you can decide to show an "Approve" button
 *    and use your existing wINR utils to prepare & send the approval transaction.
 *  - After integrating Uniswap v4 SDK/viem, build the actual swap transaction and attach it here.
 *
 * TODO (real integration):
 * - Read current allowance with your existing helpers (or via a read hook).
 * - If insufficient, prepare an approval transaction (prepareApprove).
 * - Use Uniswap v4 PoolManager ABI & viem to prepare the swap transaction, including hook data.
 * - Send with useSendTransaction from thirdweb/react.
 */
export async function prepareSwap(req: PrepareSwapRequest): Promise<PrepareSwapResult> {
  const cfg = getSwapConfig();
  const steps: Step[] = [];
  const notes: string[] = [];

  if (!cfg.poolManagerAddress) {
    return {
      ok: false,
      canExecute: false,
      reason:
        "Uniswap v4 PoolManager is not configured. Set NEXT_PUBLIC_UNISWAP_V4_POOLMANAGER_ADDRESS.",
      steps,
      notes,
    };
  }

  // Suggest Allowance step (UI should check actual allowance before showing approve)
  steps.push({
    type: "allowance",
    description:
      "Ensure allowance for the PoolManager to spend the input token. If insufficient, approve at least the input amount.",
    token: req.inputToken,
    spender: cfg.poolManagerAddress,
    requiredAmount: req.amountIn,
    recommended: true,
  });

  steps.push({
    type: "swap",
    description:
      "Execute swap via Uniswap v4 PoolManager. This stub does not create a transaction; integrate viem & v4 SDK.",
    poolManager: cfg.poolManagerAddress,
    poolAddress: cfg.poolAddress ?? undefined,
    hookAddress: cfg.hookAddress ?? undefined,
  });

  notes.push(
    "This is a stubbed implementation: add viem + Uniswap v4 SDK integration to create actual transactions.",
  );
  notes.push(
    "Use your existing approve helpers (e.g., prepareApprove/ensureAllowance) before executing the swap.",
  );
  notes.push(
    "Compute minAmountOut using the current quote + slippage and pass it into the swap to enforce slippage limits.",
  );

  return {
    ok: true,
    canExecute: false, // still false in stub
    steps,
    notes,
  };
}

/* ============================
 * Utilities for UI
 * ============================ */

/**
 * Derive a minAmountOut for the UI given an amountOut (e.g., from quote) and slippage bps.
 */
export function getMinAmountOutForUI(amountOut: bigint, overrideSlippageBps?: number): bigint {
  const bps = typeof overrideSlippageBps === "number" ? overrideSlippageBps : getSlippageBps();
  return computeMinOut(amountOut, bps);
}

/**
 * Quick helper to format a bigint token amount to a fixed-point string using token decimals.
 * This is for UI only. Do not use for exact math or on-chain constraints.
 */
export function formatToken(amount: bigint, decimals: number): string {
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const base = 10n ** BigInt(decimals);
  const int = abs / base;
  const frac = abs % base;
  if (frac === 0n) return `${negative ? "-" : ""}${int.toString()}`;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${int.toString()}.${fracStr}`;
}

/**
 * A small guard to ensure addresses are hex-strings with 0x prefix.
 */
export function isAddress(addr: string | null | undefined): addr is Address {
  if (!addr) return false;
  const a = addr.trim();
  return a.startsWith("0x") && a.length === 42;
}

/* ============================
 * Allowance Bridge (calls app/lib/winr.ensureAllowance)
 * ============================ */

/**
 * Ensure 'spender' has at least 'requiredAmount' allowance from 'owner' for the given ERC-20 token contract.
 * Note:
 * - Pass the token contract instance you already use in your app (e.g., wINR or selected token).
 * - This wrapper defers to app/lib/winr.ensureAllowance to compute and prepare an approval tx if needed.
 * - It returns either a prepared approval transaction (caller should send with useSendTransaction) or null if sufficient.
 */
export type EnsureAllowanceBridgeParams = {
  contract: unknown;     // Thirdweb contract instance for the ERC-20 token (getContract(...))
  owner: Address;
  spender: Address;
  requiredAmount: bigint;
};

export async function ensureAllowanceBridge(params: EnsureAllowanceBridgeParams) {
  // Delegate to the shared helper; the concrete contract type is resolved at runtime in the app.
  // If approval is required, a prepared transaction object will be returned; otherwise null.
  // Caller is responsible to send the returned tx using thirdweb/react's useSendTransaction hook.
  return _ensureAllowance(params as any);
}

/* ============================
 * Integration Notes (TODO)
 * ============================ */

/**
 * TODO checklist for a full integration:
 * 1) Quoting:
 *    - Use Uniswap v4 SDK + viem to compute quotes (exact input/output).
 *    - Consider dynamic fees, hooks, and tick-spacing for your pool.
 *    - Optionally add a price impact calculation for UI.
 *
 * 2) Allowance:
 *    - Use your existing wINR helpers (ensureAllowance) to prepare ERC-20 approvals when needed.
 *    - Present a clear Approve flow with toasts and tx links.
 *
 * 3) Swap Execution:
 *    - Import PoolManager ABI and prepare a transaction (single-hop or route, with hookData).
 *    - Enforce slippage via limit parameters (minAmountOut).
 *    - Send the prepared transaction using useSendTransaction from thirdweb/react.
 *    - Show transaction hash, final amounts, and errors with toasts.
 *
 * 4) Performance:
 *    - Lazy-load this module and any heavy Uniswap SDK dependencies to keep initial bundle small.
 *    - Use React Suspense/dynamic import or manual import() to load only when Swap UI is engaged.
 *
 * 5) Safety:
 *    - Validate token addresses, prevent zero amounts, and sanitize numeric inputs.
 *    - Handle chain mismatches and unsupported networks gracefully.
 */
