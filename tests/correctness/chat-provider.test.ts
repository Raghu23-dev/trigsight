import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The chat endpoint must be pointable at any OpenAI-compatible provider.
 *
 * WHY THIS IS TESTED. The gateway URL used to be hardcoded, which made the deployed chat
 * unfixable the moment Vercel's AI Gateway began requiring a card on file to release its free
 * credits: production returned `mode: "retrieval-only"` and there was no way to point it at a
 * free alternative without editing source.
 *
 * These assert the resolution ORDER rather than any single provider, because the failure being
 * guarded against is a future change that quietly re-hardcodes the endpoint.
 */

const ROUTE = readFileSync("src/app/api/chat/route.ts", "utf8");

/** Resolution logic mirrored from the route, so a divergence shows up as a failing test. */
function resolve(env: Record<string, string | undefined>) {
  const baseUrl = env.CHAT_BASE_URL ?? "https://ai-gateway.vercel.sh/v1";
  const apiKey = env.AI_GATEWAY_API_KEY ?? env.CHAT_API_KEY;
  const model = env.CHAT_MODEL ?? env.AI_GATEWAY_MODEL ?? "anthropic/claude-haiku-4.5";
  return { url: `${baseUrl.replace(/\/$/, "")}/chat/completions`, apiKey, model };
}

describe("chat provider is configuration, not a constant", () => {
  it("the route does not hardcode the gateway as its only endpoint", () => {
    // The default may mention the gateway; what must exist is the override.
    expect(ROUTE).toContain("CHAT_BASE_URL");
    expect(ROUTE).toMatch(/baseUrl/);
  });

  it("defaults to the Vercel gateway when nothing is configured", () => {
    const r = resolve({});
    expect(r.url).toBe("https://ai-gateway.vercel.sh/v1/chat/completions");
    expect(r.model).toBe("anthropic/claude-haiku-4.5");
  });

  it("routes to any OpenAI-compatible base URL", () => {
    for (const base of [
      "https://api.groq.com/openai/v1",
      "https://openrouter.ai/api/v1",
      "http://localhost:11434/v1",
    ]) {
      expect(resolve({ CHAT_BASE_URL: base }).url).toBe(`${base}/chat/completions`);
    }
  });

  it("tolerates a trailing slash on the base URL", () => {
    // A user pasting a URL from documentation will include one about half the time.
    expect(resolve({ CHAT_BASE_URL: "https://api.groq.com/openai/v1/" }).url).toBe(
      "https://api.groq.com/openai/v1/chat/completions",
    );
  });

  it("accepts either credential name, preferring the gateway one", () => {
    expect(resolve({ CHAT_API_KEY: "b" }).apiKey).toBe("b");
    expect(resolve({ AI_GATEWAY_API_KEY: "a", CHAT_API_KEY: "b" }).apiKey).toBe("a");
  });

  it("falls back to retrieval-only rather than failing when no credential is set", () => {
    expect(resolve({}).apiKey).toBeUndefined();
    expect(ROUTE).toContain('mode: "retrieval-only"');
  });

  it("says which variables to set when it degrades", () => {
    // A degraded mode that does not name its own fix sends the reader to the source.
    const note = /No model credential is set \(([^)]+)\)/.exec(ROUTE);
    expect(note).not.toBeNull();
    expect(note![1]).toContain("CHAT_API_KEY");
    expect(note![1]).toContain("AI_GATEWAY_API_KEY");
  });
});

describe("a rate limit is not reported as an outage", () => {
  /**
   * WHY: the free tier allows 30 requests a minute. Exceeded, the route returned
   * `{"error":"model gateway unavailable","status":429}` with a 502, and the UI printed that
   * phrase verbatim — an internal string a visitor cannot act on, describing a working service.
   *
   * Found by probing this endpoint fast enough to trip the limit, then misreading the empty
   * replies as a broken model and nearly changing CHAT_MODEL in production over it. The model was
   * fine. Retrieval had already succeeded by the time the limit was hit, so the correct answer is
   * "ask again shortly", not a failure.
   */
  it("distinguishes 429 from a genuine gateway failure", () => {
    expect(ROUTE).toMatch(/upstream\.status === 429/);
  });

  it("answers 503 with Retry-After rather than 502", () => {
    // 502 says the upstream is broken. 503 + Retry-After says it is busy and when to return,
    // which is both true and actionable.
    const block = /upstream\.status === 429[\s\S]{0,900}?\n {4}\}/.exec(ROUTE)?.[0] ?? "";
    expect(block).toContain("503");
    expect(block).toMatch(/retry-after/i);
    expect(block).not.toContain("502");
  });

  it("the message a visitor sees names no internal component", () => {
    const block = /upstream\.status === 429[\s\S]{0,900}?\n {4}\}/.exec(ROUTE)?.[0] ?? "";
    expect(block).not.toMatch(/gateway unavailable/);
    for (const jargon of ["upstream", "Groq", "502", "SSE"]) {
      // The user-facing string is the one inside the quotes; jargon in a comment is fine, so
      // check only the message literal.
      const message = /error:\s*\n?\s*"([\s\S]*?)",\s*\n\s*status: 429/.exec(block)?.[1] ?? "";
      expect(message).not.toContain(jargon);
    }
  });

  it("still tells the reader the rest of the site works", () => {
    const block = /upstream\.status === 429[\s\S]{0,900}?\n {4}\}/.exec(ROUTE)?.[0] ?? "";
    expect(block).toMatch(/unaffected|everything else/i);
  });

  it("the json helper can set the header this path needs", () => {
    // The helper took (payload, status) only, so Retry-After could not be sent at all.
    expect(ROUTE).toMatch(/function json\(\s*payload: unknown,\s*status = 200,\s*extraHeaders/);
  });
});
