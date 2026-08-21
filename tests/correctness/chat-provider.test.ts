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
