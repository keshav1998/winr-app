import { ConnectButton } from "thirdweb/react";
import { client } from "./thirdweb/client";

export default function Home() {
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
          <div className="inline-flex items-center gap-2 rounded-full bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 px-3 py-1 text-xs">
            <span className="size-2 rounded-full bg-yellow-500" />
            KYC Pending
          </div>
          <p className="text-xs mt-2 text-foreground/60">
            You’ll be able to mint and swap once KYC is approved.
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
              disabled
            />
            <div className="flex gap-2">
              <button type="button" className="rounded-md border px-3 py-2 text-sm" disabled>
                Confirm Deposit
              </button>
              <button type="button" className="rounded-md bg-foreground text-background px-3 py-2 text-sm" disabled>
                Mint wINR
              </button>
            </div>
            <p className="text-xs text-foreground/60">
              Disabled until KYC is approved and deposit is confirmed.
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
            <button type="button" className="rounded-md bg-foreground text-background px-3 py-2 text-sm">
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
            <button type="button" className="rounded-md bg-foreground text-background px-3 py-2 text-sm">
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
