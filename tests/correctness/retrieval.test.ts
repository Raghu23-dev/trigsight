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


describe("a document is findable by its own name", () => {
  // WHY THIS EXISTS: no project on this site names itself in its body prose. `projects/fusegrid`
  // is titled "A Spend Ceiling That Holds Under Concurrency" and the text says "the ledger", "the
  // reservation" — never "fusegrid". Retrieval indexed `chunk.text` only, so the single most
  // likely visitor question, "what is fusegrid", matched nothing and the chat replied "not in the
  // provided material" about the site's own flagship.
  //
  // The retrieval eval caught none of it: 30 golden queries and NOT ONE named a product, because
  // every question was phrased the way the content is written. Recall read 0.900 while the
  // homepage's primary call to action was broken.
  //
  // These are unit tests rather than golden queries because `npm test` runs in CI and the eval
  // does not.
  const named = chunkDocument({
    docId: "projects/fusegrid",
    docTitle: "A Spend Ceiling That Holds Under Concurrency",
    path: "/projects/fusegrid",
    body: `---
title: A Spend Ceiling That Holds Under Concurrency
---

## The problem

Concurrent callers each read the remaining budget, each decide there is room, and
together they overrun it. The ledger has to reserve before the call, not account
after it.
`,
  });

  it("indexes the slug, which appears nowhere in the prose", () => {
    const chunk = named[0];
    expect(chunk).toBeDefined();
    if (chunk === undefined) return;
    expect(chunk.text.toLowerCase()).not.toContain("fusegrid");
    expect(chunk.searchText.toLowerCase()).toContain("fusegrid");
  });

  it("keeps searchText out of text, so citations still quote real prose", () => {
    // A citation must quote `text` character-for-character. If the name were prepended to `text`
    // instead, every passage would carry a preamble that appears nowhere in the document.
    for (const chunk of named) {
      expect(chunk.text).not.toContain("projects/fusegrid");
      expect(chunk.text.startsWith("fusegrid")).toBe(false);
    }
  });

  it("ranks the named document FIRST against competitors", async () => {
    // A single-document index returns that document for any query, so it cannot tell a working
    // retriever from a broken one. This test previously did exactly that and passed with the fix
    // reverted — a test that cannot fail is worse than no test, because it is trusted.
    //
    // So: three documents, none of which names itself, and a query naming one of them. The
    // assertion is on RANK, not mere presence.
    const others = [
      ...chunkDocument({
        docId: "projects/onewayglass",
        docTitle: "Count-Stable Permission-Aware Retrieval",
        path: "/projects/onewayglass",
        body: `## The problem\n\nFiltering by permission after ranking changes how many results come back, and the count itself tells the caller that something exists which they may not read.\n`,
      }),
      ...chunkDocument({
        docId: "projects/mcpgantlet",
        docTitle: "MCP Protocol Conformance Auditing",
        path: "/projects/mcpgantlet",
        body: `## The problem\n\nServers ship claiming to implement a revision of the protocol, and nothing checks the claim. An invalid Origin header must be rejected, and four of five public servers accepted it.\n`,
      }),
    ];
    const corpus = [...named, ...others];
    const retriever = new Retriever(corpus, new LocalTrigramBackend(corpus));

    const results = await retriever.retrieve("fusegrid", { limit: 3 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.chunk.docId).toBe("projects/fusegrid");

    // Rank alone does not prove the fix, and finding that out took three attempts.
    //
    // Reverted, BM25 returns an EMPTY list for "fusegrid" — the name is in no prose — and the
    // trigram stand-in then decides the order on its own. It happens to put fusegrid first,
    // because "grid" is a character-gram of its own name and of nothing else here. So the rank
    // assertion above passed against the broken build, twice, with two different queries.
    //
    // What actually separates fixed from broken is that the LEXICAL leg contributes at all. A
    // hybrid whose lexical half is silent on a proper noun is one backend outage away from
    // answering nothing, which is what production would have done had Upstash been configured.
    const legs = results.flatMap((r) => r.provenance.map((p) => p.leg));
    expect(legs).toContain("bm25");
  });

  it("the lexical leg alone finds it, not just the vector leg", () => {
    // Both legs were blind to the same thing. Fixing only one would leave the production path
    // dependent on whichever backend happened to be configured.
    const index = buildBm25(named.map((c) => ({ id: c.id, text: c.searchText })));
    expect(searchBm25(index, "fusegrid", 5).length).toBeGreaterThan(0);
  });

  it("a folded-in tail chunk keeps its name, rather than losing it on rebuild", () => {
    // Undersized tails are merged into the previous chunk via `rebuild`. Carrying the old
    // searchText forward would index pre-merge content against post-merge text.
    const withTail = chunkDocument({
      docId: "projects/onewayglass",
      docTitle: "Count-Stable Permission-Aware Retrieval",
      path: "/projects/onewayglass",
      body: `## One

${"Permission filtering after ranking changes the result count, which leaks the existence of documents the caller may not see. ".repeat(4)}

## Two

Short.
`,
    });
    for (const chunk of withTail) {
      expect(chunk.searchText.toLowerCase()).toContain("onewayglass");
    }
  });
});
