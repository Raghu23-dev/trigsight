import { chunkDocument, type Chunk } from "../../../lib/retrieval/chunk";
import { LocalTrigramBackend, Retriever } from "../../../lib/retrieval/retrieve";
import { upstashFromEnv } from "../../../lib/retrieval/upstash";
import { projects, work } from "../../../lib/content";

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
  // Projects and work share one corpus. Omitting projects would leave the chat unable to answer
  // about the only work on the site a reader can independently verify — and it would answer
  // anyway, from the employer pages, which is worse than saying nothing.
  for (const d of [...projects, ...work]) {
    chunks.push(
      ...chunkDocument({ docId: d.id, docTitle: d.title, path: d.path, body: d.raw }),
    );
  }
  // Real embeddings when configured, the deterministic stand-in otherwise. The stand-in
  // is not a semantic model, so this is a genuine downgrade rather than a fallback of
  // equal quality — but lexical-only retrieval still answers, which beats failing.
  const vector = upstashFromEnv() ?? new LocalTrigramBackend(chunks);
  retriever = new Retriever(chunks, vector);
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

  // Any OpenAI-compatible endpoint. Hardcoding Vercel's gateway made the chat unusable the
  // moment that gateway started requiring a card on file to release its free credits — the
  // deployment could not be pointed at a free alternative without a code change.
  //
  // Groq, Together, OpenRouter and a local Ollama all speak this shape, so the endpoint is
  // configuration. The default is unchanged, so nothing that works today breaks.
  const baseUrl = process.env.CHAT_BASE_URL ?? "https://ai-gateway.vercel.sh/v1";
  const apiKey = process.env.AI_GATEWAY_API_KEY ?? process.env.CHAT_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) {
    // No credentials configured: return the retrieval result rather than failing.
    // This keeps the endpoint honest in development and makes the retrieval layer
    // independently inspectable.
    return json({
      mode: "retrieval-only",
      note:
        "No model credential is set (CHAT_API_KEY or AI_GATEWAY_API_KEY), so no model was " +
        "called. Retrieved context is returned for inspection — the retrieval layer is the " +
        "part this endpoint can prove without one.",
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

  const upstream = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.CHAT_MODEL ?? process.env.AI_GATEWAY_MODEL ?? "anthropic/claude-haiku-4.5",
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

  return new Response(stripReasoning(upstream.body), {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      // Proxies buffer SSE by default, which defeats streaming entirely.
      "x-accel-buffering": "no",
    },
  });
}

/**
 * Drop `delta.reasoning` from the upstream SSE stream.
 *
 * Reasoning models (gpt-oss, Qwen thinking variants) emit their chain of thought in a `reasoning`
 * field alongside `content`. The client only ever reads `delta.content`, so none of it renders —
 * but it was measured at **42% of the response payload**, shipped to every visitor's browser and
 * counted against a free-tier rate limit for text nobody sees.
 *
 * Stripped here rather than in the client, for two reasons. The bytes never leave the server, and
 * a model's private reasoning about how to answer is not something to broadcast: it can restate
 * context the answer deliberately omitted.
 */
function stripReasoning(body: ReadableStream<Uint8Array> | null): ReadableStream<Uint8Array> | null {
  if (body === null) return null;

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  // SSE frames can split across chunk boundaries, so a partial line is held over rather than
  // parsed — dropping it would silently truncate an answer mid-sentence.
  let carry = "";

  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        carry += decoder.decode(chunk, { stream: true });
        const lines = carry.split("\n");
        carry = lines.pop() ?? "";

        let out = "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) {
            out += `${line}\n`;
            continue;
          }
          const payload = line.slice(6).trim();
          if (payload === "[DONE]" || payload.length === 0) {
            out += `${line}\n`;
            continue;
          }
          try {
            const parsed = JSON.parse(payload) as {
              choices?: Array<{ delta?: { content?: string; reasoning?: string } }>;
            };
            const delta = parsed.choices?.[0]?.delta;
            if (delta?.reasoning !== undefined) {
              delete delta.reasoning;
              // A frame carrying only reasoning has nothing left worth sending.
              if (delta.content === undefined) continue;
            }
            out += `data: ${JSON.stringify(parsed)}\n`;
          } catch {
            // Unparseable frames pass through untouched: mangling one is worse than forwarding it.
            out += `${line}\n`;
          }
        }
        if (out.length > 0) controller.enqueue(encoder.encode(out));
      },
      flush(controller) {
        if (carry.length > 0) controller.enqueue(encoder.encode(carry));
      },
    }),
  );
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
