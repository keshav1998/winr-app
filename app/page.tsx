"use client";
import { useState } from "react";
import { ConnectButton } from "thirdweb/react";
import { client } from "./thirdweb/client";
import { useKyc, useDeposits, useMintGate } from "./hooks/useKyc";
import { useToast } from "./(components)/feedback";

export default function Home() {
  const { addToast } = useToast();
  const [fiatAmount, setFiatAmount] = useState<string>("");
  const [depositId, setDepositId] = useState<string | null>(null);

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
    addToast({ kind: "success", title: "Mint", description: "Mint transaction would be executed here." });
  };

  const onSwap = () => {
    if (!kycApproved) {
      addToast({ kind: "warning", title: "KYC required", description: "Complete KYC to swap." });
      return;
    }
    addToast({ kind: "info", title: "Swap", description: "Swap flow will be integrated with Uniswap v4." });
  };

  const onRedeem = () => {
    if (!kycApproved) {
      addToast({ kind: "warning", title: "KYC required", description: "Complete KYC to redeem." });
      return;
    }
    addToast({ kind: "info", title: "Redeem", description: "Redeem will burn wINR then trigger CBDC payout." });
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
          <p className="text-sm text-foreground/70">
            Connect your wallet to view account info, balances, and chain.
          </p>

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
              <button type="button" className="rounded-md bg-foreground text-background px-3 py-2 text-sm" disabled={!mintEnabled} onClick={onMint}>
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
              />
              <input
                type="text"
                placeholder="To (e.g. ETH)"
                className="w-full rounded-md border px-3 py-2 text-sm bg-transparent"
              />
            </div>
            <input
              type="number"
              placeholder="Amount"
              className="w-full rounded-md border px-3 py-2 text-sm bg-transparent"
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
            />
            <button type="button" className="rounded-md bg-foreground text-background px-3 py-2 text-sm" disabled={!kycApproved} onClick={onRedeem}>
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
