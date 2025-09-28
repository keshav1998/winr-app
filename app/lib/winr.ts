/**
 * wINR contract utilities for thirdweb v5
 *
 * Provides:
 * - Contract getter for wINR (ERC-20 compatible)
 * - Read helpers (name, symbol, decimals, balanceOf, allowance, totalSupply)
 * - Write helpers that return prepared transactions (approve, transfer, mint, burn)
 * - Allowance helper to prepare approval when needed
 * - Amount parsing utilities (parseUnits / formatUnits)
 *
 * Usage (non-React):
 *  import { createThirdwebClient } from "thirdweb";
 *  import { sepolia } from "thirdweb/chains";
 *  import {
 *    getWinrContract,
 *    readSymbol,
 *    prepareApprove,
 *    ensureAllowance,
 *    parseUnits,
 *  } from "@/app/lib/winr";
 *
 *  const client = createThirdwebClient({ clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID! });
 *  const contract = getWinrContract({ client, chain: sepolia });
 *
 *  const symbol = await readSymbol({ contract });
 *  const amount = parseUnits("100", 18n);
 *  const approvalTx = await ensureAllowance({
 *    contract,
 *    owner: "0x...",
 *    spender: "0xSpender",
 *    requiredAmount: amount,
 *  });
 *  if (approvalTx) {
 *    // sendTransaction(approvalTx) via useSendTransaction in React
 *  }
 */

import type { ThirdwebClient } from "thirdweb";
import { getContract, prepareContractCall, readContract } from "thirdweb";

import { sepolia } from "thirdweb/chains";

/* ============================
 * Constants Over Magic Numbers
 * ============================ */

const ENV_WINR_ADDRESS = "NEXT_PUBLIC_WINR_TOKEN_ADDRESS" as const;

// ERC-20 ABI method signatures (human-readable signatures)
const ERC20 = {
  name: "function name() view returns (string)",
  symbol: "function symbol() view returns (string)",
  decimals: "function decimals() view returns (uint8)",
  totalSupply: "function totalSupply() view returns (uint256)",
  balanceOf: "function balanceOf(address owner) view returns (uint256)",
  allowance: "function allowance(address owner, address spender) view returns (uint256)",
  approve: "function approve(address spender, uint256 amount) returns (bool)",
  transfer: "function transfer(address to, uint256 amount) returns (bool)",

  // Optional extensions (comment out if your contract doesn't support them)
  mint: "function mint(address to, uint256 amount)",
  burn: "function burn(uint256 amount)",
  burnFrom: "function burnFrom(address from, uint256 amount)",
} as const;

/* ============================
 * Types
 * ============================ */

export type HexAddress = `0x${string}`;

export type WinrContractConfig = {
  client: ThirdwebClient;
  chain?: typeof sepolia; // restrict to chain config type (e.g., sepolia)
  address?: HexAddress;
};

export type WinrReadParams = {
  contract: ReturnType<typeof getContract>;
};

export type WinrWriteParams<TParams extends unknown[]> = {
  contract: ReturnType<typeof getContract>;
  params: TParams;
};

/* ============================
 * Helpers: Env & Address
 * ============================ */

export function getWinrAddressFromEnv(): HexAddress {
  const addr = (process.env[ENV_WINR_ADDRESS] ?? "").trim();
  if (!addr) {
    throw new Error(
      `Missing ${ENV_WINR_ADDRESS} environment variable.\n` +
      "Set it in your .env.local to the deployed wINR contract address.",
    );
  }
  if (!addr.startsWith("0x") || addr.length !== 42) {
    throw new Error(`Invalid wINR address in ${ENV_WINR_ADDRESS}: ${addr}`);
  }
  return addr as HexAddress;
}

/* ============================
 * Contract Getter
 * ============================ */

export function getWinrContract({
  client,
  chain = sepolia,
  address,
}: WinrContractConfig) {
  const resolved = (address ?? getWinrAddressFromEnv()) as HexAddress;
  return getContract({
    client,
    address: resolved,
    chain,
  });
}

/* ============================
 * Amount Utilities
 * ============================ */

/**
 * Parse an amount string/number into bigint units based on decimals.
 * - Examples:
 *   parseUnits("1.5", 18n) => 1500000000000000000n
 *   parseUnits(2, 6n) => 2000000n
 */
export function parseUnits(amount: string | number, decimals: bigint): bigint {
  if (typeof amount === "number") {
    // Convert to string to handle decimals consistently
    // Note: users should generally input strings to avoid FP precision issues.
    amount = amount.toString();
  }

  const [intPart, fracPartRaw] = amount.split(".");
  const fracPart = (fracPartRaw ?? "").slice(0, Number(decimals)); // trim extra decimals

  const paddedFrac = fracPart.padEnd(Number(decimals), "0");
  const raw = `${intPart}${paddedFrac}`.replace(/^0+(\d)/, "$1"); // avoid "01" => "1"
  const sanitized = raw === "" ? "0" : raw;

  // Validate characters
  if (!/^\d+$/.test(sanitized)) {
    throw new Error(`Invalid numeric amount: ${amount}`);
  }
  return BigInt(sanitized);
}

/**
 * Format units to a string with a fixed number of decimals
 * - Example: formatUnits(1500000000000000000n, 18n) => "1.5"
 */
export function formatUnits(value: bigint, decimals: bigint): string {
  const negative = value < 0n ? "-" : "";
  const abs = value < 0n ? -value : value;

  const base = 10n ** decimals;
  const int = abs / base;
  const frac = abs % base;

  if (frac === 0n) return `${negative}${int.toString()}`;

  const fracStr = frac.toString().padStart(Number(decimals), "0").replace(/0+$/, "");
  return `${negative}${int.toString()}.${fracStr}`;
}

/* ============================
 * Read Helpers
 * ============================ */

export async function readName({ contract }: WinrReadParams): Promise<string> {
  return readContract({ contract, method: ERC20.name });
}

export async function readSymbol({ contract }: WinrReadParams): Promise<string> {
  return readContract({ contract, method: ERC20.symbol });
}

export async function readDecimals({ contract }: WinrReadParams): Promise<number> {
  const dec = await readContract({ contract, method: ERC20.decimals });
  // Return as number for UI convenience (safe for typical ERC20 decimals)
  return Number(dec);
}

export async function readTotalSupply({ contract }: WinrReadParams): Promise<bigint> {
  return readContract({ contract, method: ERC20.totalSupply });
}

export async function readBalanceOf({
  contract,
  owner,
}: WinrReadParams & { owner: HexAddress }): Promise<bigint> {
  return readContract({
    contract,
    method: ERC20.balanceOf,
    params: [owner],
  });
}

export async function readAllowance({
  contract,
  owner,
  spender,
}: WinrReadParams & { owner: HexAddress; spender: HexAddress }): Promise<bigint> {
  return readContract({
    contract,
    method: ERC20.allowance,
    params: [owner, spender],
  });
}

/* ============================
 * Write Helpers (Prepared Tx)
 * ============================ */

/**
 * Approve spender for amount.
 * Caller must be the token owner (msg.sender).
 */
export function prepareApprove({
  contract,
  spender,
  amount,
}: WinrReadParams & { spender: HexAddress; amount: bigint }) {
  return prepareContractCall({
    contract,
    method: ERC20.approve,
    params: [spender, amount],
  });
}

/**
 * Transfer amount to recipient.
 * Caller must be token owner (msg.sender).
 */
export function prepareTransfer({
  contract,
  to,
  amount,
}: WinrReadParams & { to: HexAddress; amount: bigint }) {
  return prepareContractCall({
    contract,
    method: ERC20.transfer,
    params: [to, amount],
  });
}

/**
 * Mint tokens to a recipient (restricted to minters).
 * Ensure your connected account has the MINTER role (if enforced).
 */
export function prepareMint({
  contract,
  to,
  amount,
}: WinrReadParams & { to: HexAddress; amount: bigint }) {
  return prepareContractCall({
    contract,
    method: ERC20.mint,
    params: [to, amount],
  });
}

/**
 * Burn tokens from msg.sender (if supported by the contract).
 */
export function prepareBurn({
  contract,
  amount,
}: WinrReadParams & { amount: bigint }) {
  return prepareContractCall({
    contract,
    method: ERC20.burn,
    params: [amount],
  });
}

/**
 * Burn tokens from a specific address (if supported).
 * Requires allowance for msg.sender to burn from 'from'.
 */
export function prepareBurnFrom({
  contract,
  from,
  amount,
}: WinrReadParams & { from: HexAddress; amount: bigint }) {
  return prepareContractCall({
    contract,
    method: ERC20.burnFrom,
    params: [from, amount],
  });
}

/* ============================
 * Allowance Utility
 * ============================ */

/**
 * Ensure 'spender' has at least 'requiredAmount' allowance from 'owner'.
 * Returns:
 * - a prepared approval transaction if current allowance is insufficient
 * - null if current allowance is already sufficient
 */
export async function ensureAllowance({
  contract,
  owner,
  spender,
  requiredAmount,
}: WinrReadParams & {
  owner: HexAddress;
  spender: HexAddress;
  requiredAmount: bigint;
}) {
  const current = await readAllowance({ contract, owner, spender });
  if (current >= requiredAmount) return null;

  // Approve exactly the required amount by default.
  // Optionally, you can approve a larger "max" to reduce future transactions.
  return prepareApprove({ contract, spender, amount: requiredAmount });
}

/* ============================
 * High-level Helpers for UI
 * ============================ */

/**
 * Fetch basic token info in one call bundle.
 */
export async function getTokenInfo({ contract }: WinrReadParams) {
  const [name, symbol, decimals, totalSupply] = await Promise.all([
    readName({ contract }),
    readSymbol({ contract }),
    readDecimals({ contract }),
    readTotalSupply({ contract }),
  ]);

  return {
    name,
    symbol,
    decimals,
    totalSupply,
  };
}

/**
 * Resolve a human-readable amount to bigint for this token by reading decimals first.
 */
export async function toTokenUnits({
  contract,
  value,
}: WinrReadParams & { value: string | number }): Promise<bigint> {
  const decimals = BigInt(await readDecimals({ contract }));
  return parseUnits(value, decimals);
}
