# Making a portfolio chatbot that cannot lie about me

Live: [trigsight.vercel.app](https://trigsight.vercel.app) · Source: this repository

---

## 1. Problem

I wanted an AI assistant on my portfolio that answers questions about my engineering
work. The obvious version of that feature is worthless, and it is worth being precise
about why.

A portfolio chatbot makes claims about its author's competence. A reader has no way to
check them. And readers have learned not to try: measured citation error rates for
general AI search products sit above 60%, and only 51.5% of generated sentences are
fully supported by the sources they cite. So the claims get discounted, and the feature
becomes decoration that signals "I can wire up an API".

Before designing anything I measured the nearest good implementation of this idea — a
comparable engineering portfolio with a grounded chat — by probing its live endpoint
with five queries.

**What I found contradicted my assumption, and I abandoned my original thesis because
of it.** Its grounding works. Out-of-corpus questions are refused. A false premise
("did he work at Google as a VP?") is explicitly denied and corrected. The model emits
only slug tokens which the client resolves against a build-time allowlist, so it
structurally cannot render a broken link.

My planned thesis had been "general AI search miscites, so make citations correct,
target 0% broken links." That was attacking a solved problem. Any reviewer probing the
same endpoint for five minutes would have seen it.

The gap that *is* real, and that the same probe established:

| Probe | Result |
|---|---|
| Out-of-corpus question | Refused correctly |
| False premise | Denied and corrected |
| Card token resolution | Resolves, HTTP 200 |
| **"Cite your source"** | **"Source: My résumé / portfolio context — reach out at ‹email›."** |

That last row is the problem. It is prose attribution, not an address. The reader cannot
verify the claim; they can only email the author. And where a link does exist it points
at a whole page, so the specific assertion — "2K+ daily users" — is unanchored. Nothing
validates that the cited document supports the claim text at all.

The second, independent problem was measured with my own harness: that site ships
**380.9 KB** of JavaScript (modern-browser brotli transfer) and scores **62** on
Lighthouse mobile performance, with LCP 3.9 s and TBT 1,540 ms — while shipping no 3D
or genuinely interactive content.

## 2. Architecture

One idea, everything else conventional:

> **A citation cannot render unless its quoted passage provably exists in the cited
> document, verified against the same normalised text the browser will match.**

The model is never trusted to produce a URL. It names a passage; the build produces the
URL, or the build fails.

```
BUILD                                    REQUEST
content/*.mdx                            question
  ↓ normalise (collapse ws, casefold)      ↓ hybrid retrieve (BM25 + vector → RRF)
passage index                              ↓ model
  ↓                                        ↓ emits [[cite:doc|passage]]
verify: present exactly once?            resolve against allowlist
  no  → EXIT 1, build fails                ↓ in allowlist → chip with #:~:text= link
  yes → allowlist.json ─────────────────→  ↓ unknown      → dropped silently
```

The model has no mechanism for producing a link, so it cannot produce a wrong one.
Prompt instructions are a request; an absent capability is an invariant.

**Rejected alternatives**, with reasons:

| Considered | Rejected because |
|---|---|
| Model emits URLs, validated at runtime | Too late — the claim already rendered. Build-time makes an unverifiable claim unshippable. |
| Page-anchor citations (`#section`) | This is the measured gap. It is retained as the documented fallback if fragments prove impractical. |
| Reject ambiguous passages | Loses the citation entirely. Disambiguating with a prefix keeps the information. |
| pgvector on a managed Postgres | Free tiers auto-suspend and delete idle databases. |
| WebGPU | Firefox support is Windows-only. Shaders written in TSL compile to both, so this is a later swap not a rewrite. |
| Native CSS scroll-driven animation | Chrome and Safari only; Firefox still preview. |

## 3. Decisions

**Verify against rendered text, not source.** A browser matching `#:~:text=` compares
against what the page *displays*. I probed seven cases before writing the verifier:
comparing against raw MDX fails **3 of 7** passages the browser matches fine — passages
crossing a newline, containing collapsed whitespace, or differing only in case. A
verifier that produces false failures trains you to disable the gate, which defeats the
entire thesis.

**Require each passage to appear exactly once.** The specification warns that a repeated
passage scrolls to the *first* match. For a citation that is a silent correctness bug:
the reader is shown a different sentence than the one supporting the claim. Where a
passage repeats, the verifier emits the `prefix-,text` form to pin the intended
occurrence.

**Fuse retrieval by rank, never by score.** Cosine similarity lands in a narrow high
band while BM25 is unbounded and spreads low. Comparing them numerically lets the vector
leg win every tie regardless of which signal was more relevant. Reciprocal rank fusion
(k=60) sidesteps calibration entirely.

**Implement BM25 rather than import a search service.** The corpus is six documents in
the repository. The index is a few kilobytes built at compile time. A search service
would be infrastructure with no measurable benefit.

**Keep the tokeniser's hyphens.** `human-in-the-loop` and `snake_case_name` are single
terms in this domain. Splitting them destroys the exact-match advantage BM25 exists to
provide.

**Chunk on heading boundaries, not fixed windows.** Two reasons. A chunk split
mid-paragraph produces passages the citation gate would reject, so chunking and
citation share one boundary discipline. And a heading trail is free context.

**Gate the WebGL scene behind five checks** — reduced-motion, save-data, a WebGL2
capability probe on a throwaway canvas (R3F context failures surface as async rejections
an error boundary cannot catch), a device-memory heuristic, and `requestIdleCallback`.
Reduced-motion *skips* the scene rather than slowing it: a calmer animation is still
animation, and the preference asked for none.

## 4. Benchmarks

Four harnesses, all committed under `bench/`, all runnable with one command. `bench/` is
never gitignored — an uncommitted harness turns a real result into an unverifiable
claim, which is a mistake I have watched cost a genuinely good system its credibility.

| Harness | Measures | Gate |
|---|---|---|
| `bench/citations/verify.ts` | Every claim binds to a real passage | exit 1 on any miss |
| `bench/retrieval/eval.ts` | recall@5, MRR over 30 golden queries | exit 1 below 0.85 |
| `bench/payload/measure.sh` | Initial JS, brotli, modern browsers only | exit 1 over budget |
| `bench/lighthouse/` | Four categories, mobile | recorded, 3 runs |

The golden set was written by **reading the content**, not by running the retriever.
Writing questions from retriever output measures the retriever against itself and always
scores well.

All four run in CI on every push.

## 5. Results

Against the pre-registered criteria in `docs/02-thesis.md`, committed before the first
feature commit — git history proves the ordering:

| # | Criterion | Threshold | Result |
|---|---|---|---|
| 1 | Passage-level binding | 100% | **34/34**, verified against rendered HTML *and* the live site |
| 2 | Unbound claim fails build | exit ≠ 0 | **verified** — `next build` never runs |
| 3 | Retrieval recall@5 | ≥ 0.85 | **0.967**, MRR 0.831 |
| 4 | Initial JS | ≤ 150 KB | **110.4 KB** with WebGL shipping |
| 5 | Lighthouse mobile | ≥ 95 ×4 | **100 / 100 / 100 / 100** |
| 6 | Hallucinated answers | 0 | **0** across the adversarial suite |

Against the measured baseline:

| | Comparable portfolio | trigsight |
|---|---|---|
| Performance (mobile) | 62 | **100** |
| LCP | 3.9 s | **1.5 s** (production) |
| TBT | 1,540 ms | **20–80 ms** |
| Initial JS | 380.9 KB | **110.4 KB** |
| WebGL scene | none | **shipping** |

3.4× less JavaScript while shipping more. Retrieval, 30 queries at k=5: hybrid 0.967
recall / 0.831 MRR versus lexical-only 0.933 / 0.729 — the MRR gain matters more, since
only the top six chunks reach the model.

### What came out worse than expected

**My verifier was green and wrong.** Two of 34 citations bound successfully but were
unmatchable by a browser. A passage spanning inline markup renders as separate DOM
nodes, and the specification requires each part of a directive to sit inside one
element. Flattened text said "present"; the browser disagreed. This was exactly the
silent failure the project exists to prevent, sitting inside the gate itself, and I
found it only by fetching every built page and searching its rendered text.

**My MCP server confirmed a fabricated credential.** `find_evidence` reported
`supported: true` for "quantum cryptography research on ion traps". A vector leg is
nearest-neighbour search — it always returns its closest chunks however unrelated. An
agent consuming that output would have repeated a fabricated credential downstream,
which is precisely the harm the server was built to prevent.

**Substring matching made a verification tool lie.** `check_stack` reported Rust as
present because "trust" contains it, and Go because "category" does.

**A contrast failure survived my own review.** My `--color-fg-subtle` token measured
3.78:1 against a required 4.5:1. I had judged it by eye and it looked fine.

**The site returned HTTP 500 in production on its first deploy** while every static page
worked. `readFileSync("content/…")` — a serverless bundle does not include the content
directory. Works locally, throws `ENOENT` deployed. The worst shape of bug: invisible to
local testing, and it disabled exactly the two routes that make the site more than
static.

Every one of these was caught by measurement rather than review. That is the argument
for the harnesses, and it is the most useful thing I learned building this.

## 6. Limitations

- **The vector leg is a deterministic hashed-trigram stand-in, not a semantic embedding
  model.** It exists so fusion and budgeting are testable offline with no credentials.
  The eval harness prints this warning on every run and names the backend in its results
  table, so a number from it can never be quoted as embedding-model performance. Real
  embeddings are the next measurement — and if they do not beat 0.967 on a 34-chunk
  corpus, that is a publishable finding about whether small corpora need a vector leg at
  all, not a failure.
- **Text fragments are fragile by design.** Rewording a cited sentence breaks its link.
  The build gate means you cannot ship the breakage, but editing prose sometimes means
  updating a citation.
- **Citations must sit inside one block element.** A claim best supported by text
  spanning a table row and a paragraph cannot be cited as a single passage.
- **The corpus is small** — 6 documents, 34 chunks. Retrieval numbers here should not be
  read as predictions for a large corpus.
- **No streaming citation resolution.** Chips render after a message completes rather
  than mid-stream.
- **Lighthouse is a lab measurement.** Real-user metrics from real devices on real
  networks will be worse, and I have not collected them.
- **The citation gate verifies that a passage exists, not that it supports the claim.**
  A model could cite a real sentence that does not actually back what it said. Detecting
  that requires entailment checking, which I have not built.

That last one is the honest ceiling of the current design, and worth stating plainly
rather than leaving for a reader to notice.
