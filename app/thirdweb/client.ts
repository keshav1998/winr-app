/* eslint-disable no-console */
/**
 * Thirdweb client helper (v5 API)
 *
 * - Exposes a single, shared client for the app
 * - Centralizes chain configuration (defaults to Sepolia)
 *
 * Requirements:
 * - Define NEXT_PUBLIC_THIRDWEB_CLIENT_ID in your environment (.env.local)
 *   This value must be public (NEXT_PUBLIC_) for usage on the client.
 *
 * Usage:
 *  import { client, DEFAULT_CHAIN } from "@/app/thirdweb/client";
 *  <ThirdwebProvider client={client} activeChain={DEFAULT_CHAIN}>...</ThirdwebProvider>
 */

import { createThirdwebClient } from "thirdweb";
import { sepolia } from "thirdweb/chains";

// Constants Over Magic Numbers
export const DEFAULT_CHAIN = sepolia;
const THIRDWEB_CLIENT_ID_ENV = "NEXT_PUBLIC_THIRDWEB_CLIENT_ID" as const;

// Smart helper to retrieve env var with clearer error in development
function getRequiredClientId(): string {
  const clientId = process.env[THIRDWEB_CLIENT_ID_ENV];

  if (!clientId) {
    const message = `Missing ${THIRDWEB_CLIENT_ID_ENV}. Create a thirdweb project and set the Client ID in your environment.
- Dashboard: https://thirdweb.com/dashboard
- Add to .env.local: ${THIRDWEB_CLIENT_ID_ENV}=your_client_id`;

    // Provide actionable feedback in dev without exposing secrets
    if (process.env.NODE_ENV !== "production") {
      console.warn(message);
    }
  }

  // Even if undefined in production, pass-through to let thirdweb throw a meaningful error.
  // This avoids masking issues and keeps a single source of truth.
  return (process.env[THIRDWEB_CLIENT_ID_ENV] ?? "") as string;
}

export const client = createThirdwebClient({
  clientId: getRequiredClientId(),
});
