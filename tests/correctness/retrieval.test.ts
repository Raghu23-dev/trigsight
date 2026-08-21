import { describe, expect, it } from "vitest";
import { chunkDocument, estimateTokens } from "../../src/lib/retrieval/chunk.ts";
import { buildBm25, searchBm25, tokenise } from "../../src/lib/retrieval/bm25.ts";
import { fuse, RRF_K } from "../../src/lib/retrieval/fuse.ts";
import { LocalTrigramBackend, Retriever } from "../../src/lib/retrieval/retrieve.ts";

const DOC = `---
title: Streaming
---

## The problem

Polling meant the browser asked whether generation had finished on a timer and
learned nothing in between. It also scaled badly under load.

## What I built

### Reconnection

The client tracks the last event id it processed and persists it, so a refresh
resumes from that point rather than replaying from zero. Replayed events are
de-duplicated against a set of already-seen ids.

### Incremental rendering

Batch generation emits one event per screen, so progress runs against a known
total rather than an indeterminate spinner.
`;

const chunks = chunkDocument({
  docId: "work/streaming",
  docTitle: "Streaming",
  path: "/work/streaming",
  body: DOC,
});

describe("chunking", () => {
  it("produces chunks", () => {
    expect(chunks.length).toBeGreaterThan(0);
  });

  it("attaches the heading trail so a chunk knows where it sits", () => {
    const recon = chunks.find((c) => c.text.includes("last event id"));
    expect(recon?.headings).toContain("What I built");
    expect(recon?.headings).toContain("Reconnection");
  });

  it("strips frontmatter from chunk text", () => {
    expect(chunks.every((c) => !c.text.includes("title:"))).toBe(true);
  });

  it("gives every chunk a stable unique id", () => {
    const ids = chunks.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((i) => i.startsWith("work/streaming#"))).toBe(true);
  });

  it("estimates tokens", () => {
    expect(estimateTokens("abcd")).toBe(1);
  });
});

describe("bm25 tokenisation", () => {
  it("keeps intra-word hyphens, which are single terms in this domain", () => {
    expect(tokenise("human-in-the-loop gates")).toContain("human-in-the-loop");
  });

  it("keeps snake_case identifiers whole", () => {
    expect(tokenise("call render_page now")).toContain("render_page");
  });

  it("drops stop words and single characters", () => {
    const t = tokenise("the a of x it");
    expect(t).not.toContain("the");
    expect(t).not.toContain("x");
  });
});

describe("bm25 ranking", () => {
  const index = buildBm25(chunks.map((c) => ({ id: c.id, text: c.text })));

  it("finds an exact phrase the vector leg would paraphrase away", () => {
    const hits = searchBm25(index, "last event id persists", 5);
    expect(hits.length).toBeGreaterThan(0);
    const top = chunks.find((c) => c.id === hits[0]?.id);
    expect(top?.text).toContain("last event id");
  });

  it("returns nothing for terms absent from the corpus", () => {
    expect(searchBm25(index, "kubernetes helm istio", 5)).toHaveLength(0);
  });

  it("keeps IDF positive for terms in most documents", () => {
    // On a small corpus a term can appear in >half the chunks. The unsmoothed
    // IDF form goes negative there and would penalise a match.
    const hits = searchBm25(index, "generation", 10);
    expect(hits.every((h) => h.score > 0)).toBe(true);
  });

  it("is deterministic across calls", () => {
    const a = searchBm25(index, "reconnect events", 5).map((h) => h.id);
    const b = searchBm25(index, "reconnect events", 5).map((h) => h.id);
    expect(a).toEqual(b);
  });
});

describe("rrf fusion", () => {
  it("ranks a document appearing in both legs above one appearing once at rank 1", () => {
    const fused = fuse([
      { leg: "a", ids: ["solo", "both", "x"] },
      { leg: "b", ids: ["y", "both", "z"] },
    ]);
    expect(fused[0]?.id).toBe("both");
  });

  it("uses k=60 per Cormack et al.", () => {
    expect(RRF_K).toBe(60);
    const fused = fuse([{ leg: "a", ids: ["first"] }]);
    expect(fused[0]?.score).toBeCloseTo(1 / 61, 10);
  });

  it("records provenance so a result can be traced to its leg", () => {
    const fused = fuse([
      { leg: "bm25", ids: ["c1"] },
      { leg: "vector", ids: ["c1"] },
    ]);
    expect(fused[0]?.provenance.map((p) => p.leg).sort()).toEqual(["bm25", "vector"]);
  });

  it("breaks ties deterministically by id, so evals do not see phantom variance", () => {
    const a = fuse([{ leg: "x", ids: ["b", "a"] }, { leg: "y", ids: ["a", "b"] }]);
    const b = fuse([{ leg: "x", ids: ["b", "a"] }, { leg: "y", ids: ["a", "b"] }]);
    expect(a.map((r) => r.id)).toEqual(b.map((r) => r.id));
  });
});

describe("hybrid retriever", () => {
  it("retrieves with both legs", async () => {
    const r = new Retriever(chunks, new LocalTrigramBackend(chunks));
    const hits = await r.retrieve("how does reconnection avoid duplicate events", { limit: 3 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.provenance.length).toBeGreaterThan(0);
  });

  it("works lexical-only when no vector backend is configured", async () => {
    const r = new Retriever(chunks, null);
    const hits = await r.retrieve("last event id", { limit: 3 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.provenance.every((p) => p.leg === "bm25")).toBe(true);
  });

  it("degrades to lexical when the vector backend throws", async () => {
    const broken = {
      name: "broken",
      search: () => Promise.reject(new Error("vector store down")),
    };
    const r = new Retriever(chunks, broken);
    const hits = await r.retrieve("last event id", { limit: 3 });
    expect(hits.length).toBeGreaterThan(0);
  });

  it("respects the token budget", async () => {
    const r = new Retriever(chunks, new LocalTrigramBackend(chunks));
    const hits = await r.retrieve("streaming", { limit: 10, tokenBudget: 60 });
    const total = hits.reduce((n, h) => n + h.chunk.tokenEstimate, 0);
    // Always returns at least one chunk even if it alone exceeds the budget —
    // an empty answer is worse than a slightly over-budget one.
    expect(hits.length).toBeGreaterThanOrEqual(1);
    if (hits.length > 1) expect(total).toBeLessThanOrEqual(60);
  });
});

describe("paragraph-aware chunking", () => {
  /**
   * These pin a bug that was invisible for the worst possible reason: the function was NAMED
   * splitLong and DOCUMENTED as splitting "on paragraph boundaries", while `renderToText`
   * collapsed every run of whitespace to a single space before it ran. The blank lines marking
   * paragraphs were already gone, so it could only ever pack sentences to a character limit.
   *
   * It made no difference to recall@5 — see bench/retrieval/results/2026-08-21-chunking.md — so
   * these tests exist to stop the behaviour silently reverting, not to defend a metric.
   */
  const doc = (body: string) =>
    chunkDocument({ docId: "t/doc", docTitle: "Doc", path: "/t/doc", body });

  it("cuts on a blank line rather than mid-paragraph", () => {
    const a = "Alpha ".repeat(70).trim();
    const b = "Bravo ".repeat(70).trim();
    const chunks = doc(`## Section\n\n${a}\n\n${b}\n`);

    expect(chunks.length).toBeGreaterThan(1);
    // No chunk may contain words from both paragraphs: that is the whole point.
    const mixed = chunks.filter((c) => c.text.includes("Alpha") && c.text.includes("Bravo"));
    expect(mixed).toEqual([]);
  });

  it("keeps a short paragraph whole instead of merging it into an over-budget chunk", () => {
    const long = "Sentence about one thing. ".repeat(30).trim();
    const short = "A distinct final point.";
    const chunks = doc(`## Section\n\n${long}\n\n${short}\n`);

    const holder = chunks.find((c) => c.text.includes("A distinct final point"));
    expect(holder).toBeDefined();
    expect(holder!.text.length).toBeLessThan(900);
  });

  it("still splits a single paragraph that exceeds the budget on its own", () => {
    // A paragraph over budget has to be cut somewhere. Sentences are the least bad boundary,
    // and refusing to cut at all would let one paragraph dominate the context budget.
    const runOn = "This is a sentence that carries some weight. ".repeat(40).trim();
    const chunks = doc(`## Section\n\n${runOn}\n`);

    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(800);
  });

  it("does not emit a chunk per paragraph when they fit together", () => {
    // The opposite failure: chunks so small they carry no signal. Three short paragraphs under
    // one heading belong in one chunk.
    const chunks = doc("## Section\n\nFirst short point here.\n\nSecond one.\n\nThird one.\n");
    expect(chunks).toHaveLength(1);
  });

  it("carries the heading trail onto every chunk of a split section", () => {
    const body = `## Outer\n\n### Inner\n\n${"Filler sentence here. ".repeat(60).trim()}\n`;
    const chunks = doc(body);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.headings).toEqual(["Outer", "Inner"]);
  });
});

