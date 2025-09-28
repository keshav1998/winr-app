import { NextResponse } from "next/server";
import { streamText, type CoreMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

/**
 * Blockchain LLM (thirdweb) Chat Route
 *
 * This route proxies chat requests to thirdweb's OpenAI-compatible Blockchain LLM,
 * using the Vercel AI SDK to stream responses.
 *
 * Security:
 * - Uses THIRDWEB_SECRET_KEY (server-only) with Authorization: Bearer semantics via the OpenAI adapter.
 * - Do NOT expose your secret key in NEXT_PUBLIC_* env vars.
 *
 * Docs:
 * - thirdweb AI Chat: https://portal.thirdweb.com/ai/chat
 * - thirdweb MCP:     https://portal.thirdweb.com/ai/mcp
 * - Vercel AI SDK:    https://sdk.vercel.ai
 */

// Force Node.js runtime (secrets and streaming supported)
export const runtime = "nodejs";

type ChatRequestBody = {
  // OpenAI-style messages
  messages: CoreMessage[];
  // Optional contextual info for the model (chain / caller)
  context?: {
    chain_ids?: number[];
    from?: `0x${string}`;
  };
  // Optional model name (the thirdweb adapter is OpenAI-compatible; a model string is required by the adapter)
  model?: string;
  // Optional generation controls
  temperature?: number;
  maxTokens?: number;
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

/**
 * Builds a synthetic system message embedding blockchain context when provided.
 * This keeps the payload OpenAI-compatible even if the upstream endpoint expects a `context` object.
 */
function buildContextSystemMessage(ctx?: ChatRequestBody["context"]): CoreMessage | null {
  if (!ctx) return null;

  const parts: string[] = [];
  if (ctx.chain_ids?.length) {
    parts.push(`chain_ids=${JSON.stringify(ctx.chain_ids)}`);
  }
  if (ctx.from) {
    parts.push(`from=${ctx.from}`);
  }
  if (parts.length === 0) return null;

  return {
    role: "system",
    content: [
      {
        type: "text",
        text:
          `Blockchain context provided.\n` +
          `Use this for transaction prep/execution, quoting, and contract interactions.\n` +
          parts.join(" | "),
      },
    ],
  };
}

export async function POST(req: Request) {
  try {
    const {
      messages,
      context,
      model = "thirdweb", // thirdweb OpenAI-compatible API accepts a model value; "thirdweb" is a sensible default
      temperature = 0.2,
      maxTokens = 800,
    } = (await req.json()) as ChatRequestBody;

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Invalid 'messages' payload. Provide an array of chat messages." },
        { status: 400 },
      );
    }

    // Configure OpenAI-compatible client for thirdweb AI
    // Assumption: thirdweb also supports Authorization: Bearer for OpenAI compatibility.
    // If your project requires custom headers instead, migrate to a direct fetch stream.
    const openai = createOpenAI({
      apiKey: requireEnv("THIRDWEB_SECRET_KEY"),
      baseURL: process.env.THIRDWEB_AI_BASE_URL || "https://api.thirdweb.com",
      compatibility: "strict",
    });

    // Prepend a system message containing context if provided
    const maybeSystem = buildContextSystemMessage(context);
    const augmented: CoreMessage[] = maybeSystem ? [maybeSystem, ...messages] : messages;

    // Stream the model's response
    const result = await streamText({
      model: openai(model),
      messages: augmented,
      temperature,
      maxTokens,
    });

    // Return a streaming response
    return result.toAIStreamResponse();
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unexpected error while processing the request.";
    // Avoid leaking secrets or internals
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
