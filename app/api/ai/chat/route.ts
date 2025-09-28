import { NextResponse } from "next/server";

/**
 * Proxy route to thirdweb Blockchain LLM (OpenAI-compatible) with streaming support.
 *
 * This replaces the Vercel AI SDK adapter to avoid type conflicts at build time
 * by directly forwarding requests to thirdweb's AI endpoint.
 *
 * Docs:
 * - thirdweb AI Chat: https://portal.thirdweb.com/ai/chat
 *
 * Security:
 * - Uses THIRDWEB_SECRET_KEY (server-only). Never expose this value client-side.
 * - Optionally forwards Authorization header from the client (e.g. bearer JWT) when present.
 */

// Ensure Node.js runtime (needed for secrets + streaming)
export const runtime = "nodejs";

type ChatRequestBody = {
  messages: Array<
    | { role: "system" | "user" | "assistant"; content: string }
    | { role: "system" | "user" | "assistant"; content: Array<{ type: "text"; text: string }> }
  >;
  context?: {
    chain_ids?: number[];
    from?: `0x${string}`;
  };
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

/**
 * Validates minimal message schema to avoid forwarding malformed payloads upstream.
 */
function validateMessages(messages: unknown): messages is ChatRequestBody["messages"] {
  if (!Array.isArray(messages) || messages.length === 0) return false;
  return messages.every((m) => {
    if (!m || typeof m !== "object") return false;
    const role = (m as any).role;
    const content = (m as any).content;
    if (!["system", "user", "assistant"].includes(role)) return false;
    if (typeof content === "string") return true;
    if (Array.isArray(content)) {
      return content.every(
        (c) =>
          c &&
          typeof c === "object" &&
          c.type === "text" &&
          typeof (c as any).text === "string",
      );
    }
    return false;
  });
}

export async function POST(req: Request) {
  try {
    const {
      messages,
      context,
      model,
      temperature,
      maxTokens,
      stream: wantStream,
    } = (await req.json()) as ChatRequestBody;

    if (!validateMessages(messages)) {
      return NextResponse.json(
        { ok: false, error: "Invalid 'messages' payload. Provide an array of chat messages." },
        { status: 400 },
      );
    }

    const upstreamUrl = "https://api.thirdweb.com/ai/chat";
    const secretKey = requireEnv("THIRDWEB_SECRET_KEY");
    const defaultStream = true; // stream by default for better UX
    const stream = typeof wantStream === "boolean" ? wantStream : defaultStream;

    // Forward client Authorization header if present (for user auth), but always include server-side secret.
    const clientAuth = req.headers.get("authorization") || undefined;

    const upstreamHeaders: HeadersInit = {
      "Content-Type": "application/json",
      "x-secret-key": secretKey,
    };
    if (clientAuth) {
      upstreamHeaders["Authorization"] = clientAuth;
    }

    const upstreamBody: Record<string, unknown> = {
      messages,
      stream,
    };
    if (context) upstreamBody.context = context;
    if (model) upstreamBody.model = model;
    if (typeof temperature === "number") upstreamBody.temperature = temperature;
    if (typeof maxTokens === "number") upstreamBody.max_tokens = maxTokens;

    const upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers: upstreamHeaders,
      body: JSON.stringify(upstreamBody),
    });

    // Non-streaming response
    if (!stream) {
      const data = await upstream
        .json()
        .catch(() => ({ ok: false, error: "Upstream returned non-JSON body." }));
      return NextResponse.json(data, { status: upstream.status });
    }

    // Streaming response passthrough
    const contentType = upstream.headers.get("content-type") || "text/event-stream; charset=utf-8";
    const headers: HeadersInit = {
      "Content-Type": contentType,
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
      // Some hosts/proxies buffer SSE by default; this header helps disable it
      "X-Accel-Buffering": "no",
    };

    if (!upstream.ok || !upstream.body) {
      // Attempt to surface upstream error details when stream requested
      let errorPayload: unknown = null;
      try {
        errorPayload = await upstream.json();
      } catch {
        errorPayload = { error: "Upstream streaming request failed." };
      }
      return NextResponse.json(errorPayload, { status: upstream.status });
    }

    // Return a streamed response directly
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// Optional: restrict other methods
export async function GET() {
  return NextResponse.json({ ok: false, error: "Method Not Allowed" }, { status: 405 });
}
