"use client";
import { useState } from "react";
import { ConnectButton, useActiveAccount, useWalletBalance, useSendTransaction } from "thirdweb/react";
import { client, DEFAULT_CHAIN } from "./thirdweb/client";
import { parseUnits, getWinrContract, prepareMint, prepareBurn, toTokenUnits } from "./lib/winr";
import { useKyc, useDeposits, useMintGate } from "./hooks/useKyc";
import { useToast } from "./(components)/feedback";

export default function Home() {
  const { addToast } = useToast();
  const account = useActiveAccount();
  const native = useWalletBalance({ client, chain: DEFAULT_CHAIN, address: account?.address });
  const { mutate: sendTx, isPending: isSending } = useSendTransaction();
  const [fiatAmount, setFiatAmount] = useState<string>("");
  const [depositId, setDepositId] = useState<string | null>(null);
  const [fromToken, setFromToken] = useState<string>("wINR");
  const [toToken, setToToken] = useState<string>("ETH");
  const [swapAmount, setSwapAmount] = useState<string>("");
  const [redeemAmount, setRedeemAmount] = useState<string>("");

  const { kycApproved, kycStatus } = useKyc();
  const { create } = useDeposits();
  const { mintEnabled, readyToMint, startDepositPolling } = useMintGate({ depositId });

  const onConfirmDeposit = async () => {
    if (!kycApproved) {
      addToast({ kind: "warning", title: "KYC required", description: "Complete KYC before depositing." });
      return;
    }
    if (!fiatAmount || Number(fiatAmount) <= 0) {
      addToast({ kind: "error", title: "Invalid amount", description: "Enter a positive deposit amount." });
      return;
    }
    try {
      const dep = await create({ amount: fiatAmount, currency: "INR" });
      setDepositId(dep.id);
      addToast({ kind: "info", title: "Deposit pending", description: "We are confirming your deposit..." });
      startDepositPolling(dep.id, (d) => {
        if (d.readyToMint) {
          addToast({ kind: "success", title: "Deposit confirmed", description: "You can now mint wINR." });
        }
      });
    } catch (e) {
      addToast({ kind: "error", title: "Deposit failed", description: String((e as Error).message) });
    }
  };

  const onMint = async () => {
    if (!mintEnabled) {
      addToast({ kind: "warning", title: "Mint not ready", description: "Wait for deposit confirmation and KYC approval." });
      return;
    }
    try {
      const to = account?.address as `0x${string}` | undefined;
      if (!to) {
        addToast({ kind: "warning", title: "No wallet", description: "Connect a wallet to mint." });
        return;
      }
      const winrAddr = (process.env.NEXT_PUBLIC_WINR_TOKEN_ADDRESS ?? "").trim();
      if (!winrAddr || !winrAddr.startsWith("0x") || winrAddr.length !== 42) {
        addToast({ kind: "error", title: "Mint not configured", description: "Set NEXT_PUBLIC_WINR_TOKEN_ADDRESS in .env.local." });
        return;
      }
      const contract = getWinrContract({ client, chain: DEFAULT_CHAIN, address: winrAddr as `0x${string}` });
      const amount = await toTokenUnits({ contract, value: fiatAmount || "0" });
      if (amount <= 0n) {
        addToast({ kind: "error", title: "Invalid amount", description: "Enter a positive amount to mint." });
        return;
      }
      const tx = prepareMint({ contract, to, amount });
      sendTx(tx as any, {
        onSuccess: (res) => {
          addToast({
            kind: "success",
            title: "Mint sent",
            description: `Tx submitted: ${res?.transactionHash ?? "check your wallet/tx list"}`,
          });
        },
        onError: (err) => {
          addToast({
            kind: "error",
            title: "Mint failed",
            description: String((err as Error)?.message ?? err),
          });
        },
      });
    } catch (e) {
      addToast({ kind: "error", title: "Mint error", description: String((e as Error).message) });
    }
  };

  const onSwap = async () => {
    if (!kycApproved) {
      addToast({ kind: "warning", title: "KYC required", description: "Complete KYC to swap." });
      return;
    }
    if (!swapAmount || Number(swapAmount) <= 0) {
      addToast({ kind: "error", title: "Invalid amount", description: "Enter a positive swap amount." });
      return;
    }
    try {
      const { getQuote, prepareSwap, formatToken } = await import("./swap/module");
      const winrAddr = (process.env.NEXT_PUBLIC_WINR_TOKEN_ADDRESS ?? "").trim();
      if (!winrAddr || !winrAddr.startsWith("0x") || winrAddr.length !== 42) {
        addToast({
          kind: "error",
          title: "Swap not configured",
          description: "Set NEXT_PUBLIC_WINR_TOKEN_ADDRESS and Uniswap v4 envs in .env.local.",
        });
        return;
      }
      const inputToken = {
        address: winrAddr as `0x${string}`,
        symbol: fromToken || "wINR",
        decimals: 18,
      };
      const outputToken = {
        address: winrAddr as `0x${string}`,
        symbol: toToken || "wINR",
        decimals: 18,
      };
      const amountIn = parseUnits(swapAmount, 18n);
      const quote = await getQuote({
        inputToken,
        outputToken,
        amountIn,
        poolAddress: null,
      });
      if (!quote.ok) {
        addToast({
          kind: "error",
          title: "Quote failed",
          description: quote.reason ?? "Unknown error while fetching quote.",
        });
        return;
      }
      addToast({
        kind: "info",
        title: "Quote",
        description: `${formatToken(quote.amountIn, inputToken.decimals)} ${inputToken.symbol} -> ~${formatToken(
          quote.amountOut,
          outputToken.decimals,
        )} ${outputToken.symbol} (min ${formatToken(quote.minAmountOut, outputToken.decimals)} @ ${quote.slippageBps / 100
          }% slippage)`,
      });
      const acct = account?.address as `0x${string}` | undefined;
      if (!acct) {
        addToast({
          kind: "warning",
          title: "No wallet",
          description: "Connect a wallet to proceed.",
        });
        return;
      }
      const prep = await prepareSwap({
        inputToken,
        outputToken,
        amountIn,
        account: acct,
      });
      if (!prep.ok) {
        addToast({
          kind: "error",
          title: "Swap prep failed",
          description: prep.reason ?? "Unknown error during preparation.",
        });
        return;
      }
      if (prep.steps.length) {
        addToast({
          kind: "info",
          title: "Swap Steps",
          description: `Steps: ${prep.steps.map((s) => s.type).join(" → ")}`,
        });
      }
      addToast({
        kind: "warning",
        title: "Stub",
        description:
          "Swap execution is not wired yet. Integrate Uniswap v4 transactions (viem + PoolManager) to execute.",
      });
    } catch (e) {
      addToast({
        kind: "error",
        title: "Swap error",
        description: String((e as Error).message),
      });
    }
  };

  const onRedeem = async () => {
    if (!kycApproved) {
      addToast({ kind: "warning", title: "KYC required", description: "Complete KYC to redeem." });
      return;
    }
    try {
      const winrAddr = (process.env.NEXT_PUBLIC_WINR_TOKEN_ADDRESS ?? "").trim();
      if (!winrAddr || !winrAddr.startsWith("0x") || winrAddr.length !== 42) {
        addToast({ kind: "error", title: "Redeem not configured", description: "Set NEXT_PUBLIC_WINR_TOKEN_ADDRESS in .env.local." });
        return;
      }
      const contract = getWinrContract({ client, chain: DEFAULT_CHAIN, address: winrAddr as `0x${string}` });
      const amount = await toTokenUnits({ contract, value: redeemAmount || "0" });
      if (amount <= 0n) {
        addToast({ kind: "error", title: "Invalid amount", description: "Enter a positive amount to redeem." });
        return;
      }
      const tx = prepareBurn({ contract, amount });
      sendTx(tx as any, {
        onSuccess: (res) => {
          addToast({
            kind: "success",
            title: "Burn sent",
            description: `Tx submitted: ${res?.transactionHash ?? "check your wallet/tx list"}`,
          });
        },
        onError: (err) => {
          addToast({
            kind: "error",
            title: "Burn failed",
            description: String((err as Error)?.message ?? err),
          });
        },
      });
    } catch (e) {
      addToast({ kind: "error", title: "Redeem error", description: String((e as Error).message) });
    }
  };

  return (
    <div className="min-h-screen p-6 sm:p-10">
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <h1 className="text-2xl font-semibold">wINR + Uniswap v4</h1>
        <ConnectButton client={client} />
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="col-span-1 rounded-xl border border-black/10 dark:border-white/10 p-4">
          <h2 className="font-medium mb-3">Wallet / Identity</h2>
          {account?.address ? (
            <div className="text-sm space-y-1">
              <div className="font-mono break-all">{account.address}</div>
              <div className="text-foreground/70">
                Native balance: {native.data ? `${native.data.displayValue} ${native.data.symbol}` : "—"}
              </div>
            </div>
          ) : (
            <p className="text-sm text-foreground/70">
              Connect your wallet to view account info, balances, and chain.
            </p>
          )}

        </section>

        <section className="col-span-1 rounded-xl border border-black/10 dark:border-white/10 p-4">
          <h2 className="font-medium mb-3">KYC / Status</h2>
          {kycStatus === "approved" ? (
            <div className="inline-flex items-center gap-2 rounded-full bg-green-500/10 text-green-700 dark:text-green-300 px-3 py-1 text-xs">
              <span className="size-2 rounded-full bg-green-500" />
              KYC Approved
            </div>
          ) : kycStatus === "rejected" ? (
            <div className="inline-flex items-center gap-2 rounded-full bg-red-500/10 text-red-700 dark:text-red-300 px-3 py-1 text-xs">
              <span className="size-2 rounded-full bg-red-500" />
              KYC Rejected
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 rounded-full bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 px-3 py-1 text-xs">
              <span className="size-2 rounded-full bg-yellow-500" />
              KYC Pending
            </div>
          )}
          <p className="text-xs mt-2 text-foreground/60">
            {kycApproved ? "You can proceed with minting and swapping." : "You’ll be able to mint and swap once KYC is approved."}
          </p>
        </section>

        <section className="col-span-1 rounded-xl border border-black/10 dark:border-white/10 p-4">
          <h2 className="font-medium mb-3">Admin</h2>
          <div className="flex gap-2">
            <button type="button" className="rounded-md bg-foreground text-background px-3 py-2 text-sm">
              View Roles
            </button>
            <button type="button" className="rounded-md border px-3 py-2 text-sm">
              Manage Lists
            </button>
          </div>
          <p className="text-xs mt-2 text-foreground/60">
            Admin actions: roles, allow/deny lists, airdrop CSV, logs.
          </p>
        </section>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="col-span-1 rounded-xl border border-black/10 dark:border-white/10 p-4">
          <h2 className="font-medium mb-3">Deposit / Mint</h2>
          <div className="space-y-3">
            <input
              type="number"
              placeholder="Amount (INR)"
              className="w-full rounded-md border px-3 py-2 text-sm bg-transparent"
              value={fiatAmount}
              onChange={(e) => setFiatAmount(e.target.value)}
              disabled={!kycApproved}
            />
            <div className="flex gap-2">
              <button type="button" className="rounded-md border px-3 py-2 text-sm" disabled={!kycApproved || !fiatAmount} onClick={onConfirmDeposit}>
                Confirm Deposit
              </button>
              <button type="button" className="rounded-md bg-foreground text-background px-3 py-2 text-sm" disabled={!mintEnabled || isSending} onClick={onMint}>
                Mint wINR
              </button>
            </div>
            <p className="text-xs text-foreground/60">
              {kycApproved ? (readyToMint ? "Deposit confirmed. You can mint now." : "Waiting for deposit confirmation...") : "Disabled until KYC is approved and deposit is confirmed."}
            </p>
          </div>
        </section>

        <section className="col-span-1 rounded-xl border border-black/10 dark:border-white/10 p-4">
          <h2 className="font-medium mb-3">Swap / Trade</h2>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="From (e.g. wINR)"
                className="w-full rounded-md border px-3 py-2 text-sm bg-transparent"
                value={fromToken}
                onChange={(e) => setFromToken(e.target.value)}
              />
              <input
                type="text"
                placeholder="To (e.g. ETH)"
                className="w-full rounded-md border px-3 py-2 text-sm bg-transparent"
                value={toToken}
                onChange={(e) => setToToken(e.target.value)}
              />
            </div>
            <input
              type="number"
              placeholder="Amount"
              className="w-full rounded-md border px-3 py-2 text-sm bg-transparent"
              value={swapAmount}
              onChange={(e) => setSwapAmount(e.target.value)}
            />
            <button type="button" className="rounded-md bg-foreground text-background px-3 py-2 text-sm" disabled={!kycApproved} onClick={onSwap}>
              Get Quote & Swap
            </button>
            <p className="text-xs text-foreground/60">
              On swap: check allowance, fetch quote, and execute via v4 pool.
            </p>
          </div>
        </section>

        <section className="col-span-1 rounded-xl border border-black/10 dark:border-white/10 p-4">
          <h2 className="font-medium mb-3">Redeem</h2>
          <div className="space-y-3">
            <input
              type="number"
              placeholder="Amount (wINR)"
              className="w-full rounded-md border px-3 py-2 text-sm bg-transparent"
              value={redeemAmount}
              onChange={(e) => setRedeemAmount(e.target.value)}
            />
            <button type="button" className="rounded-md bg-foreground text-background px-3 py-2 text-sm" disabled={!kycApproved || !redeemAmount || isSending} onClick={onRedeem}>
              Burn & Redeem e₹
            </button>
            <p className="text-xs text-foreground/60">
              After burning, backend sends CBDC to your linked account.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
