import { chunkDocument, type Chunk } from "../../../lib/retrieval/chunk";
import { LocalTrigramBackend, Retriever } from "../../../lib/retrieval/retrieve";
import { work } from "../../../lib/content";

/**
 * Grounded chat.
 *
 * Guardrails are deliberate and each one closes a specific abuse or failure:
 *
 * - The model is told to emit `[[cite:docId|passage]]` and never a URL. It has no
 *   mechanism to produce a link, so it cannot produce a wrong one.
 * - `maxOutputTokens` is capped so the endpoint cannot be farmed as a free LLM
 *   proxy. A portfolio chat has no legitimate need for long generations.
 * - The system prompt is set server-side only. A client-supplied system message is
 *   rejected rather than merged, which is the injection vector on this shape of
 *   endpoint.
 * - Refusal is instructed explicitly: out-of-corpus questions get a pointer, not
 *   an answer. Criterion 6 is zero hallucinated answers.
 * - Message count and length are bounded before any model call, so an oversized
 *   request costs nothing.
 */

export const runtime = "nodejs";

const MAX_MESSAGES = 12;
const MAX_CHARS_PER_MESSAGE = 1200;
const MAX_OUTPUT_TOKENS = 700;
const RETRIEVE_LIMIT = 6;
const TOKEN_BUDGET = 2600;

let retriever: Retriever | null = null;

function getRetriever(): Retriever {
  if (retriever !== null) return retriever;
  // Source comes from Velite's build output, never from the filesystem. A
  // serverless function does not ship the content/ directory, so readFileSync
  // fails in production while working locally — verified by an ENOENT on the first
  // deploy. Velite already carries the raw MDX, so the read was never necessary.
  const chunks: Chunk[] = [];
  for (const w of work) {
    chunks.push(
      ...chunkDocument({ docId: w.id, docTitle: w.title, path: w.path, body: w.raw }),
    );
  }
  retriever = new Retriever(chunks, new LocalTrigramBackend(chunks));
  return retriever;
}

function systemPrompt(context: string): string {
  return `You answer questions about Raghuram P's engineering work, using only the context below.

CITATIONS — the most important rule:
When you state a fact drawn from the context, cite it by emitting a token in exactly
this form, quoting the source text VERBATIM:

  [[cite:<docId>|<exact sentence from the context>]]

The quoted text must appear character-for-character in the context. Never paraphrase
inside a citation. Never write a URL, link, or markdown link — you cannot produce
links, and any URL you write will be discarded.

SCOPE:
If the context does not answer the question, say so plainly and point the reader to
the relevant section or suggest what to ask instead. Never guess, never extrapolate
from general knowledge, and never invent metrics. An honest "that is not covered
here" is a correct answer.

TONE:
Plain, factual, first person. Short paragraphs. No marketing language, no emoji, no
bullet-point padding.

CONTEXT:
${context}`;
}

interface IncomingMessage {
  role: string;
  content: string;
}

export async function POST(request: Request): Promise<Response> {
  let body: { messages?: unknown };
  try {
    body = (await request.json()) as { messages?: unknown };
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  const raw = body.messages;
  if (!Array.isArray(raw) || raw.length === 0) {
    return json({ error: "messages must be a non-empty array" }, 400);
  }
  if (raw.length > MAX_MESSAGES) {
    return json({ error: `at most ${MAX_MESSAGES} messages` }, 400);
  }

  const messages: IncomingMessage[] = [];
  for (const m of raw as IncomingMessage[]) {
    if (typeof m?.role !== "string" || typeof m?.content !== "string") {
      return json({ error: "each message needs a string role and content" }, 400);
    }
    // Reject rather than strip. Silently dropping a system message would let a
    // caller believe their instruction was accepted.
    if (m.role === "system") {
      return json({ error: "system messages are not accepted" }, 400);
    }
    if (m.content.length > MAX_CHARS_PER_MESSAGE) {
      return json({ error: `messages are limited to ${MAX_CHARS_PER_MESSAGE} characters` }, 400);
    }
    messages.push({ role: m.role, content: m.content });
  }

  const question = messages.filter((m) => m.role === "user").at(-1)?.content ?? "";
  if (question.trim().length === 0) {
    return json({ error: "no user message" }, 400);
  }

  const hits = await getRetriever().retrieve(question, {
    limit: RETRIEVE_LIMIT,
    tokenBudget: TOKEN_BUDGET,
  });

  const context = hits
    .map(
      (h) =>
        `--- docId: ${h.chunk.docId} (${h.chunk.docTitle}${
          h.chunk.headings.length > 0 ? ` › ${h.chunk.headings.join(" › ")}` : ""
        })\n${h.chunk.text}`,
    )
    .join("\n\n");

  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) {
    // No credentials configured: return the retrieval result rather than failing.
    // This keeps the endpoint honest in development and makes the retrieval layer
    // independently inspectable.
    return json({
      mode: "retrieval-only",
      note: "AI_GATEWAY_API_KEY is not set, so no model was called. Retrieved context is returned for inspection.",
      question,
      retrieved: hits.map((h) => ({
        docId: h.chunk.docId,
        headings: h.chunk.headings,
        score: Number(h.score.toFixed(6)),
        provenance: h.provenance,
        text: h.chunk.text,
      })),
    });
  }

  const upstream = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.AI_GATEWAY_MODEL ?? "anthropic/claude-haiku-4.5",
      max_tokens: MAX_OUTPUT_TOKENS,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt(context) },
        ...messages.map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        })),
      ],
    }),
  });

  if (!upstream.ok || upstream.body === null) {
    return json({ error: "model gateway unavailable", status: upstream.status }, 502);
  }

  return new Response(upstream.body, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      // Proxies buffer SSE by default, which defeats streaming entirely.
      "x-accel-buffering": "no",
    },
  });
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
