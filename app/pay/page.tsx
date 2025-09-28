"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Badge,
  Alert,
  cn,
} from "../components/ui";
import { useToast } from "../(components)/feedback";

type SplitSource = "erupee" | "winr";

function formatINR(n: number | bigint) {
  const num = typeof n === "bigint" ? Number(n) : n;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(
    num,
  );
}

export default function PayPage() {
  const { addToast } = useToast();

  // Wallet & KYC
  const [walletConnected, setWalletConnected] = useState(false);
  const [account, setAccount] = useState<`0x${string}` | null>(null);
  const [kycApproved, setKycApproved] = useState(true); // assume approved for smoother demo

  // Scanned QR & invoice
  const [scanned, setScanned] = useState(false);
  const [merchant, setMerchant] = useState("Coffee Collective Pvt Ltd");
  const [invoiceId, setInvoiceId] = useState("INV-ERUP-000122");
  const [note, setNote] = useState("Flat White x2 + Croissant");
  const [amountINR, setAmountINR] = useState<number>(100_000);

  // Balances
  const [eRupeeBalance, setERupeeBalance] = useState<number>(70_000);
  const [winrBalance, setWinrBalance] = useState<number>(50_000);

  // Split & payment
  const [erupeePart, setERupeePart] = useState<number>(70_000);
  const [winrPart, setWinrPart] = useState<number>(30_000);
  const [activeField, setActiveField] = useState<SplitSource>("erupee");
  const [isPaying, setIsPaying] = useState(false);
  const [receipt, setReceipt] = useState<null | {
    paidAt: string;
    paidTo: string;
    invoiceId: string;
    erupee: number;
    winr: number;
    total: number;
    txApproval?: string;
    txSwap?: string;
    txPayment?: string;
  }>(null);

  // AI
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");

  // Derived
  const remaining = useMemo(() => amountINR - erupeePart - winrPart, [amountINR, erupeePart, winrPart]);

  useEffect(() => {
    // Initialize default split when amount/balance changes or after scan
    const maxFromERupee = Math.min(eRupeeBalance, amountINR);
    const rest = Math.max(0, amountINR - maxFromERupee);
    setERupeePart(maxFromERupee);
    setWinrPart(rest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amountINR, eRupeeBalance, scanned]);

  // Handlers
  const onMockConnect = () => {
    if (walletConnected) {
      setWalletConnected(false);
      setAccount(null);
      addToast({ kind: "info", title: "Disconnected", description: "Wallet disconnected." });
    } else {
      setWalletConnected(true);
      setAccount("0x1234abcd5678ef901234abcd5678ef901234abcd");
      addToast({
        kind: "success",
        title: "Connected",
        description: "Wallet connected to Sepolia.",
      });
    }
  };

  const onScanQR = () => {
    // In a real app, decode QR and fill merchant/amount/invoice/note.
    setScanned(true);
    addToast({
      kind: "success",
      title: "QR scanned",
      description: `Invoice ${invoiceId} from ${merchant} for ${formatINR(amountINR)}.`,
    });
  };

  const onUseMaxERupee = () => {
    const max = Math.min(eRupeeBalance, amountINR);
    setERupeePart(max);
    setWinrPart(Math.max(0, amountINR - max));
    setActiveField("erupee");
  };

  const onUseMaxWINR = () => {
    const max = Math.min(winrBalance, amountINR);
    setWinrPart(max);
    setERupeePart(Math.max(0, amountINR - max));
    setActiveField("winr");
  };

  const onChangeERupee = (val: string) => {
    setActiveField("erupee");
    const v = Number(val) || 0;
    const clipped = Math.max(0, Math.min(v, Math.min(eRupeeBalance, amountINR)));
    setERupeePart(clipped);
    setWinrPart(Math.max(0, amountINR - clipped));
  };

  const onChangeWINR = (val: string) => {
    setActiveField("winr");
    const v = Number(val) || 0;
    const clipped = Math.max(0, Math.min(v, Math.min(winrBalance, amountINR)));
    setWinrPart(clipped);
    setERupeePart(Math.max(0, amountINR - clipped));
  };

  const splitValid =
    erupeePart >= 0 &&
    winrPart >= 0 &&
    erupeePart <= eRupeeBalance &&
    winrPart <= winrBalance &&
    erupeePart + winrPart === amountINR;

  const canPay = walletConnected && kycApproved && scanned && splitValid && !isPaying;

  const simulateDelay = (ms: number) => new Promise((res) => setTimeout(res, ms));

  const onPay = async () => {
    if (!canPay) {
      addToast({
        kind: "warning",
        title: "Cannot proceed",
        description: "Check wallet connection, KYC status, QR scan, and split amounts.",
      });
      return;
    }
    setIsPaying(true);
    setReceipt(null);

    try {
      // 1) If winrPart > 0, simulate approval and swap to e₹
      let txApproval: string | undefined;
      let txSwap: string | undefined;
      if (winrPart > 0) {
        addToast({
          kind: "info",
          title: "Approval",
          description: "Approving PoolManager to spend wINR...",
        });
        await simulateDelay(800);
        txApproval = "0xappr0val";
        addToast({
          kind: "success",
          title: "Approval complete",
          description: `Approval tx: ${txApproval}`,
        });

        addToast({
          kind: "info",
          title: "Swapping",
          description: `Swapping ${formatINR(winrPart)} from wINR → e₹...`,
        });
        await simulateDelay(1200);
        txSwap = "0xswa9p";
        addToast({
          kind: "success",
          title: "Swap complete",
          description: `Swap tx: ${txSwap}`,
        });
      }

      // 2) Simulate CBDC e₹ payment to merchant
      addToast({
        kind: "info",
        title: "Paying merchant",
        description: `Sending ${formatINR(erupeePart + winrPart)} to ${merchant}...`,
      });
      await simulateDelay(900);
      const txPayment = "0xpaym3nt";
      addToast({
        kind: "success",
        title: "Payment success",
        description: `Payment tx: ${txPayment}`,
      });

      // 3) Update mock balances
      setERupeeBalance((b) => Math.max(0, b - erupeePart - (winrPart > 0 ? 0 : 0)));
      setWinrBalance((b) => Math.max(0, b - (winrPart > 0 ? winrPart : 0)));

      setReceipt({
        paidAt: new Date().toLocaleString(),
        paidTo: merchant,
        invoiceId,
        erupee: erupeePart,
        winr: winrPart,
        total: amountINR,
        txApproval,
        txSwap,
        txPayment,
      });
    } catch (e) {
      addToast({
        kind: "error",
        title: "Payment failed",
        description: String((e as Error)?.message ?? e),
      });
    } finally {
      setIsPaying(false);
    }
  };

  const onAIMock = async () => {
    const prompt = aiPrompt.trim();
    if (!prompt) {
      addToast({ kind: "warning", title: "Empty prompt", description: "Type something to ask the AI." });
      return;
    }
    addToast({ kind: "info", title: "AI", description: "Thinking..." });
    await simulateDelay(700);
    setAiAnswer(
      "Based on your balances, paying ₹70,000 via e₹ and swapping ₹30,000 from wINR is optimal. " +
      "Estimated slippage is minimal for this amount. Proceed when ready.",
    );
    addToast({ kind: "success", title: "AI", description: "Advice generated." });
  };

  return (
    <div className="min-h-screen p-6 sm:p-10 space-y-6">
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Scan & Pay (e₹ + wINR split)</h1>
          <p className="text-sm text-foreground/70">
            Payment via eRupee QR. Split partial amount from wINR by swapping on-chain.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={kycApproved ? "success" : "warning"}>{kycApproved ? "KYC Approved" : "KYC Pending"}</Badge>
          <Button type="button" variant={walletConnected ? "secondary" : "primary"} onClick={onMockConnect}>
            {walletConnected ? "Disconnect" : "Connect Wallet"}
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left column: Flow */}
        <div className="xl:col-span-2 space-y-6">
          {/* Step 1: QR Scan */}
          <Card>
            <CardHeader>
              <CardTitle>1) Scan QR (mock)</CardTitle>
              <CardDescription>Simulate scanning an e₹ QR code to load merchant invoice details.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <Input label="Merchant" value={merchant} onChange={(e) => setMerchant(e.target.value)} />
                <Input label="Invoice ID" value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} />
                <Input
                  label="Amount (INR)"
                  type="number"
                  value={amountINR}
                  onChange={(e) => setAmountINR(Math.max(0, Number(e.target.value) || 0))}
                />
                <Input label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>

              <div className="flex items-center gap-2">
                <Button type="button" onClick={onScanQR}>
                  {scanned ? "Re-scan" : "Scan"}
                </Button>
                <div className="text-sm text-foreground/70">
                  {scanned ? (
                    <span>
                      Scanned: <span className="font-medium">{merchant}</span> •{" "}
                      <span className="font-mono">{invoiceId}</span> • {formatINR(amountINR)}
                    </span>
                  ) : (
                    "No QR scanned yet."
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Step 2: Split */}
          <Card>
            <CardHeader>
              <CardTitle>2) Split payment</CardTitle>
              <CardDescription>
                You have {formatINR(eRupeeBalance)} in e₹ and {formatINR(winrBalance)} in wINR. Adjust split as needed.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-end gap-2">
                    <Input
                      label="Pay from e₹"
                      type="number"
                      value={erupeePart}
                      onFocus={() => setActiveField("erupee")}
                      onChange={(e) => onChangeERupee(e.target.value)}
                    />
                    <Button type="button" variant="secondary" onClick={onUseMaxERupee}>
                      Use Max e₹
                    </Button>
                  </div>
                  <div className="mt-1 text-xs text-foreground/60">Balance: {formatINR(eRupeeBalance)}</div>
                </div>

                <div>
                  <div className="flex items-end gap-2">
                    <Input
                      label="Pay from wINR (swap to e₹)"
                      type="number"
                      value={winrPart}
                      onFocus={() => setActiveField("winr")}
                      onChange={(e) => onChangeWINR(e.target.value)}
                    />
                    <Button type="button" variant="secondary" onClick={onUseMaxWINR}>
                      Use Max wINR
                    </Button>
                  </div>
                  <div className="mt-1 text-xs text-foreground/60">Balance: {formatINR(winrBalance)}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-foreground/60">Invoice</div>
                  <div className="text-base font-medium">{formatINR(amountINR)}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-foreground/60">Remaining</div>
                  <div
                    className={cn(
                      "text-base font-medium",
                      remaining === 0 ? "text-foreground" : "text-red-600",
                    )}
                  >
                    {formatINR(remaining)}
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-foreground/60">Active Field</div>
                  <div className="text-base font-medium">{activeField === "erupee" ? "e₹" : "wINR"}</div>
                </div>
              </div>

              {!splitValid && (
                <Alert variant="warning" title="Invalid split">
                  Ensure amounts are within balances and sum equals invoice total.
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Step 3: Confirm */}
          <Card>
            <CardHeader>
              <CardTitle>3) Confirm & Pay</CardTitle>
              <CardDescription>
                We’ll swap any wINR portion to e₹ first, then finalize e₹ payment to the merchant.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Button type="button" onClick={onPay} disabled={!canPay}>
                  {isPaying ? "Processing..." : `Pay ${formatINR(amountINR)}`}
                </Button>
                {!walletConnected && <span className="text-xs text-foreground/60">Connect wallet to proceed.</span>}
                {!scanned && <span className="text-xs text-foreground/60">Scan the QR to proceed.</span>}
                {!kycApproved && <span className="text-xs text-foreground/60">KYC must be approved.</span>}
              </div>

              {receipt && (
                <div className="mt-2 rounded-lg border p-3">
                  <div className="text-sm font-medium mb-2">Receipt</div>
                  <div className="text-sm grid sm:grid-cols-2 gap-x-4 gap-y-1">
                    <div>
                      <span className="text-foreground/60">Paid To:</span> {receipt.paidTo}
                    </div>
                    <div>
                      <span className="text-foreground/60">Invoice:</span> {receipt.invoiceId}
                    </div>
                    <div>
                      <span className="text-foreground/60">When:</span> {receipt.paidAt}
                    </div>
                    <div>
                      <span className="text-foreground/60">e₹ Part:</span> {formatINR(receipt.erupee)}
                    </div>
                    <div>
                      <span className="text-foreground/60">wINR Part:</span> {formatINR(receipt.winr)}
                    </div>
                    <div>
                      <span className="text-foreground/60">Total:</span> {formatINR(receipt.total)}
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-foreground/70">
                    {receipt.txApproval && (
                      <div>
                        Approval Tx: <span className="font-mono">{receipt.txApproval}</span>
                      </div>
                    )}
                    {receipt.txSwap && (
                      <div>
                        Swap Tx: <span className="font-mono">{receipt.txSwap}</span>
                      </div>
                    )}
                    {receipt.txPayment && (
                      <div>
                        Payment Tx: <span className="font-mono">{receipt.txPayment}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column: Assistant & Summary */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>AI Assistant</CardTitle>
              <CardDescription>Ask for guidance on split, slippage, or fees.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <textarea
                className="w-full min-h-[140px] rounded-md border bg-transparent p-2 text-sm"
                placeholder="e.g., Is it safe to swap ₹30,000 wINR to e₹ right now? What are the fees?"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
              />
              <div className="flex gap-2">
                <Button type="button" onClick={onAIMock}>
                  Ask
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setAiPrompt("");
                    setAiAnswer("");
                  }}
                >
                  Clear
                </Button>
              </div>
              <div className="rounded-md border p-3 text-sm min-h-[100px]">
                {aiAnswer ? (
                  <p>{aiAnswer}</p>
                ) : (
                  <span className="text-foreground/60">The AI response will appear here.</span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
              <CardDescription>Final check before paying.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground/70">Invoice</span>
                <span className="text-sm font-medium">{formatINR(amountINR)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground/70">From e₹</span>
                <span className="text-sm font-medium">{formatINR(erupeePart)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground/70">From wINR (to e₹)</span>
                <span className="text-sm font-medium">{formatINR(winrPart)}</span>
              </div>
              <div className="pt-2 border-t">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Total</span>
                  <span className="text-sm font-semibold">{formatINR(erupeePart + winrPart)}</span>
                </div>
              </div>

              {!walletConnected && (
                <Alert variant="warning" title="Wallet not connected" className="mt-3">
                  Connect your wallet (mock) to proceed with payment.
                </Alert>
              )}
              {!scanned && (
                <Alert variant="warning" title="QR not scanned" className="mt-2">
                  Please scan the QR to load merchant details.
                </Alert>
              )}
              {!kycApproved && (
                <Alert variant="warning" title="KYC pending" className="mt-2">
                  Please complete KYC to proceed with payments and swaps.
                </Alert>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
