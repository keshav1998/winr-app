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
  const [aiPrompt, setAiPrompt] = useState<string>("");
  const [aiResponse, setAiResponse] = useState<string>("");
  const [aiLoading, setAiLoading] = useState<boolean>(false);

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
      const { getQuote, prepareSwapTransaction, ensureAllowanceBridge, formatToken, getMinAmountOutForUI } = await import("./swap/module");
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
      // Compute min received using current slippage preference for UI transparency
      const minOut = getMinAmountOutForUI(quote.amountOut, quote.slippageBps);
      addToast({
        kind: "info",
        title: "Quote",
        description: `${formatToken(quote.amountIn, inputToken.decimals)} ${inputToken.symbol} -> ~${formatToken(
          quote.amountOut,
          outputToken.decimals,
        )} ${outputToken.symbol} (min ${formatToken(minOut, outputToken.decimals)} @ ${quote.slippageBps / 100}%)`,
      });

      // Load PoolManager config
      const poolManager = (process.env.NEXT_PUBLIC_UNISWAP_V4_POOLMANAGER_ADDRESS ?? "").trim();
      if (!poolManager || !poolManager.startsWith("0x") || poolManager.length !== 42) {
        addToast({
          kind: "error",
          title: "Swap not configured",
          description: "Set NEXT_PUBLIC_UNISWAP_V4_POOLMANAGER_ADDRESS in .env.local.",
        });
        return;
      }
      const hookAddress = (process.env.NEXT_PUBLIC_UNISWAP_V4_HOOK_ADDRESS ?? "0x0000000000000000000000000000000000000000").trim() as `0x${string}`;

      // Assumptions for single-hop:
      // - currency0 = input token, currency1 = output token (ensure your real pool ordering matches)
      // - fee: 3000 (0.30%), tickSpacing: 60 (example). Adjust to your pool config.
      const fee = 3000;
      const tickSpacing = 60;

      const zeroForOne = true; // exact input with inputToken -> outputToken direction (adjust if your currency ordering differs)

      // 1) Ensure allowance if input is ERC-20 (skip if native)
      if (fromToken.toUpperCase() !== "ETH") {
        const inputErc20 = getWinrContract({ client, chain: DEFAULT_CHAIN, address: inputToken.address });
        const approveTx = await ensureAllowanceBridge({
          contract: inputErc20 as any,
          owner: acct,
          spender: poolManager as `0x${string}`,
          requiredAmount: amountIn,
        });
        if (approveTx) {
          addToast({
            kind: "info",
            title: "Approving",
            description: "Sending approval for PoolManager to spend input token...",
          });
          // send approval then proceed to swap
          sendTx(approveTx as any, {
            onSuccess: () => {
              addToast({ kind: "success", title: "Approved", description: "Allowance updated. Proceeding to swap..." });
              const prepared = prepareSwapTransaction({
                client,
                chain: DEFAULT_CHAIN,
                poolManager: poolManager as `0x${string}`,
                key: {
                  currency0: inputToken.address,
                  currency1: outputToken.address,
                  fee,
                  tickSpacing,
                  hooks: hookAddress,
                },
                params: {
                  zeroForOne,
                  amountSpecified: amountIn,      // exact input (positive)
                  // NOTE: choose an appropriate sqrtPriceLimitX96 for safety; 0 is not recommended, but used here as placeholder.
                  sqrtPriceLimitX96: 0n,
                },
                hookData: "0x",
              });
              sendTx(prepared as any, {
                onSuccess: (res) => {
                  addToast({
                    kind: "success",
                    title: "Swap sent",
                    description: `Tx submitted: ${res?.transactionHash ?? "check your wallet/tx list"}`,
                  });
                },
                onError: (err) => {
                  addToast({
                    kind: "error",
                    title: "Swap failed",
                    description: String((err as Error)?.message ?? err),
                  });
                },
              });
            },
            onError: (err) => {
              addToast({
                kind: "error",
                title: "Approval failed",
                description: String((err as Error)?.message ?? err),
              });
            },
          });
          return; // wait for approval callback flow to continue swap
        }
      }

      // 2) No approval needed or already sufficient — prepare and send the swap
      const prepared = prepareSwapTransaction({
        client,
        chain: DEFAULT_CHAIN,
        poolManager: poolManager as `0x${string}`,
        key: {
          currency0: inputToken.address,
          currency1: outputToken.address,
          fee,
          tickSpacing,
          hooks: hookAddress,
        },
        params: {
          zeroForOne,
          amountSpecified: amountIn,      // exact input
          sqrtPriceLimitX96: 0n,
        },
        hookData: "0x",
      });
      sendTx(prepared as any, {
        onSuccess: (res) => {
          addToast({
            kind: "success",
            title: "Swap sent",
            description: `Tx submitted: ${res?.transactionHash ?? "check your wallet/tx list"}`,
          });
        },
        onError: (err) => {
          addToast({
            kind: "error",
            title: "Swap failed",
            description: String((err as Error)?.message ?? err),
          });
        },
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

  // Simple client for the Blockchain LLM route
  const onAskAI = async () => {
    if (!aiPrompt.trim()) {
      addToast({
        kind: "warning",
        title: "Empty prompt",
        description: "Type a question or instruction for the Blockchain LLM.",
      });
      return;
    }
    setAiLoading(true);
    setAiResponse("");
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: aiPrompt }],
          model: "thirdweb",
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`Chat request failed (${res.status})`);
      }

      // Consume streaming response (text/event or chunked plain text)
      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        // Append raw chunk; for SSE you could parse "data:" lines for finer control.
        setAiResponse((prev) => prev + chunk);
      }
    } catch (err) {
      addToast({
        kind: "error",
        title: "AI request failed",
        description: String((err as Error)?.message ?? err),
      });
    } finally {
      setAiLoading(false);
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

      {/* AI Assistant (Blockchain LLM) */}
      <div className="mt-6 grid grid-cols-1">
        <section className="rounded-xl border border-black/10 dark:border-white/10 p-4">
          <h2 className="font-medium mb-3">AI Assistant (Blockchain LLM)</h2>
          <div className="space-y-3">
            <textarea
              placeholder="Ask to prepare a transfer, quote a swap, or analyze a tx..."
              className="w-full min-h-[100px] rounded-md border px-3 py-2 text-sm bg-transparent"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-md bg-foreground text-background px-3 py-2 text-sm"
                onClick={onAskAI}
                disabled={aiLoading || !aiPrompt.trim()}
              >
                {aiLoading ? "Asking..." : "Ask"}
              </button>
              <button
                type="button"
                className="rounded-md border px-3 py-2 text-sm"
                onClick={() => {
                  setAiPrompt("");
                  setAiResponse("");
                }}
                disabled={aiLoading}
              >
                Clear
              </button>
            </div>

            <div className="rounded-md border border-black/10 dark:border-white/10 p-3 text-sm">
              {aiResponse ? (
                <pre className="whitespace-pre-wrap break-words">{aiResponse}</pre>
              ) : (
                <span className="text-foreground/60">
                  The response will appear here. Connect your wallet for authenticated flows.
                </span>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
