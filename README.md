# wINR Frontend (Next.js + thirdweb v5)

A modern, modular frontend for wINR + Uniswap v4 built on Next.js (App Router), Tailwind CSS, and the latest thirdweb SDK v5. This README covers how to set up thirdweb v5, environment variables, app structure, and development workflows.

## Tech Stack

- Next.js 15 (App Router)
- React 19
- Tailwind CSS v4
- thirdweb v5 (React + TypeScript APIs)
- TypeScript
- Biome (lint/format)

---

## Quick Start

1) Install dependencies
```
npm install
```

2) Create your env file
- Copy `.env.example` to `.env.local`
- Fill in your thirdweb `NEXT_PUBLIC_THIRDWEB_CLIENT_ID`

```
cp .env.example .env.local
```

3) Run the dev server
```
npm run dev
```

Open http://localhost:3000

---

## Environment Variables

The app uses a public thirdweb client ID to initialize the v5 SDK.

- Create a thirdweb project in the Dashboard: https://thirdweb.com/dashboard
- Add your local and production domains to Allowed Origins
- Paste your Client ID into `.env.local`

`.env.local`
```
NEXT_PUBLIC_THIRDWEB_CLIENT_ID=replace_with_your_client_id
```

Never commit your real `.env.local`.

---

## thirdweb v5 Setup

This project uses the v5 sdk (package name: `thirdweb`) and the new React Provider and hooks from `thirdweb/react`.

1) Client singleton
- A single client is created and shared app-wide.
- Default chain is Sepolia (you can change this if needed).

`app/thirdweb/client.ts`
```
import { createThirdwebClient } from "thirdweb";
import { sepolia } from "thirdweb/chains";

export const DEFAULT_CHAIN = sepolia;

export const client = createThirdwebClient({
  clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID ?? "",
});
```

2) Provider at the root
- Wrap the entire app with `ThirdwebProvider` so hooks work anywhere.

`app/layout.tsx`
```
import { ThirdwebProvider } from "thirdweb/react";
import { client, DEFAULT_CHAIN } from "./thirdweb/client";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThirdwebProvider client={client} activeChain={DEFAULT_CHAIN}>
          {children}
        </ThirdwebProvider>
      </body>
    </html>
  );
}
```

3) Connect UI
- Use `ConnectButton` for prebuilt wallet onboarding.

`app/page.tsx`
```
import { ConnectButton } from "thirdweb/react";
import { client } from "./thirdweb/client";

export default function Home() {
  return (
    <div>
      <ConnectButton client={client} />
      {/* ... */}
    </div>
  );
}
```

4) Read & write examples (v5 patterns)
- Read:
```
import { getContract } from "thirdweb";
import { useReadContract } from "thirdweb/react";
import { client } from "@/app/thirdweb/client";
import { sepolia } from "thirdweb/chains";

const contract = getContract({
  client,
  chain: sepolia,
  address: "0xYourWINRContract",
});

export function ReadSymbol() {
  const { data, isLoading, error } = useReadContract({
    contract,
    method: "function symbol() view returns (string)",
  });

  if (isLoading) return <p>Loading...</p>;
  if (error) return <p>Error reading: {String(error)}</p>;
  return <p>Token Symbol: {data}</p>;
}
```

- Write:
```
import { getContract, prepareContractCall } from "thirdweb";
import { useSendTransaction } from "thirdweb/react";
import { client } from "@/app/thirdweb/client";
import { sepolia } from "thirdweb/chains";

const contract = getContract({
  client,
  chain: sepolia,
  address: "0xYourWINRContract",
});

export function MintButton({ to, amount }: { to: string; amount: bigint }) {
  const { mutate: sendTx, isPending, data, error } = useSendTransaction();
  const onClick = () => {
    const tx = prepareContractCall({
      contract,
      method: "function mint(address to, uint256 amount)",
      params: [to, amount],
    });
    sendTx(tx);
  };

  return (
    <div>
      <button onClick={onClick} disabled={isPending}>
        {isPending ? "Minting..." : "Mint wINR"}
      </button>
      {data && <p>Tx Hash: {data.transactionHash}</p>}
      {error && <p>Error: {String(error)}</p>}
    </div>
  );
}
```

- Docs
  - Getting Started: https://portal.thirdweb.com/react/v5/getting-started
  - Cheatsheet: https://portal.thirdweb.com/react/v5/migrate/cheatsheet
  - API Reference: https://portal.thirdweb.com/react/v5

---

## App Structure

```
winr-app/
├─ app/
│  ├─ components/
│  │  └─ ui.tsx                # Reusable UI primitives (Button, Input, Card, etc.)
│  ├─ thirdweb/
│  │  └─ client.ts             # thirdweb v5 client singleton + default chain
│  ├─ globals.css              # Tailwind CSS v4 base + theme tokens
│  ├─ layout.tsx               # Root layout: wraps with ThirdwebProvider
│  └─ page.tsx                 # Landing page with ConnectButton and core sections
├─ public/
├─ .env.example                # Example env file
├─ package.json
├─ postcss.config.mjs
├─ tailwind (via postcss plugin)
└─ tsconfig.json
```

High-level UI sections to expand:
- Wallet / Identity Area
- KYC / Status Banner
- Deposit / Mint
- Swap / Trade (Uniswap v4)
- Redeem
- Admin / Dashboard (roles, lists, airdrops, logs)

Each section should:
- Guard actions by prerequisites (e.g., KYC approved)
- Show loading/disabled states during transactions
- Provide clear error messages and instructions
- Offer success notifications and transaction links

---

## Styling & Theming

- Tailwind CSS v4 is set up via PostCSS plugin.
- Theme tokens are configured in `app/globals.css` for background/foreground and fonts.
- Use semantic classes and maintain consistent spacing and responsive patterns.
- Favor headless logic (thirdweb hooks + your own components) to keep styling flexible.

---

## UX Patterns

- Guarded flows (disable/hide until ready)
- Optimistic UI and loading states
- Input validation and debounced numeric fields
- Notifications for success/failure/tx hash
- Polling or subscription patterns after deposits or status updates
- Accessibility: proper labels, focus rings, keyboard navigation

---

## Security & Best Practices

- Never expose private keys in the frontend.
- Keep sensitive actions (e.g., mint after fiat deposit confirmation) on trusted server or through thirdweb Functions.
- Validate amounts and sanitize inputs.
- Prompt chain switching if user is on an unsupported network.
- Lazy load heavier modules (e.g., charts, swap SDK) for better performance.

---

## Scripts

- `npm run dev` — Start the dev server
- `npm run build` — Build production bundle
- `npm run start` — Start production server
- `npm run lint` — Run Biome checks
- `npm run format` — Format with Biome

---

## Contributing & Git

- Maintain a linear git history.
- Use small, focused commits with clear messages.
- Follow a branch naming convention, e.g., `feature/winr-swap-ui`, `fix/kyc-badge-state`.

---

## Next Steps

- Hook up real KYC state and guard the Mint/Swap/Redeem paths.
- Integrate Uniswap v4 for quotes and swaps (check allowance, slippage, gas).
- Add token metadata UI via headless patterns (icons/symbol/name).
- Build Admin controls (roles, block/allow lists, CSV airdrop, event logs).
- Add toasts, analytics, and error reporting for production.

---

## Notes

- Default chain is Sepolia. Update `DEFAULT_CHAIN` in `app/thirdweb/client.ts` if you need a different network.
- For contract interactions, prefer the v5 patterns: `getContract`, `useReadContract`, `prepareContractCall`, and `useSendTransaction`.
