# 05 — Benchmarks and Results

> No number is claimed anywhere unless it comes from `bench/` and is reproducible with
> one command.

## Harnesses

| Harness | Measures | Gate |
|---|---|---|
| `bench/citations/verify.ts` | Every claim binds to a real passage | exit 1 on any miss |
| `bench/retrieval/eval.ts` | recall@5, MRR over 30 golden queries | exit 1 below 0.85 |
| `bench/payload/measure.sh` | Initial JS, brotli, modern browsers only | exit 1 over 150 KB |
| `bench/lighthouse/` | Four categories, mobile, 3 runs | recorded |
| `bench/mcp/calibrate-overlap.ts` | Relevance floor true/false positives | recorded |

All four gating harnesses run in CI on every push.

## Against the pre-registered criteria

| # | Criterion | Threshold | Result | Pass |
|---|---|---|---|---|
| 1 | Passage-level binding | 100% | 34/34, verified on the live site | yes |
| 2 | Unbound claim fails build | exit ≠ 0 | verified, `next build` never runs | yes |
| 3 | Retrieval recall@5 | ≥ 0.85 | 0.967 (MRR 0.831) | yes |
| 4 | Initial JS | ≤ 150 KB | 133.9 KB with WebGL shipping | yes |
| 5 | Lighthouse mobile ×4 | ≥ 95 | 99–100 / 100 / 100 / 100 | yes |
| 6 | Hallucinated answers | 0 | 0 across the adversarial suite — **suite only, see below** | yes (locally) |

**Criterion 6 is unexercised on the deployed site.** `AI_GATEWAY_API_KEY` is not set in
production, so `/api/chat` returns `mode: "retrieval-only"` and never calls a model. That
degradation is deliberate and documented in `docs/DEPLOYMENT.md` — a missing key returns
retrieved context rather than a 500 — but it has a consequence worth stating plainly:
**the criterion is met by the test suite and cannot currently be checked by a visitor**,
because nothing generates an answer that could be hallucinated or refused.

Verified 2026-08-21 against `https://trigsight.vercel.app/api/chat` with three probes
(out-of-corpus, false-premise, prompt-injection): all three returned `retrieval-only` with
6 retrieved chunks and no `answer` field. Retrieval itself works in production — both legs
report (`bm25` and `upstash-vector`), so the hybrid path is live.

So the honest statement of criterion 6 is: **refusal behaviour is proven by
`tests/adversarial/`, not by the deployment.** Setting the key would make it checkable by
a stranger; until then the live `/ask` page demonstrates retrieval, not grounding.

## Payload — modern-browser brotli transfer

| Site | Initial JS | Scripts | WebGL |
|---|---|---|---|
| Comparable portfolio | 380.9 KB | 20 | none |
| trigsight | **133.9 KB** | 6 | shipping |

Three runs each, zero variance (immutable CDN assets). `example.com` as a control
returns 0 scripts / 0.3 KB, confirming the harness does not invent bytes.

**Correction recorded:** the first measurement reported 423.4 KB and 145.4 KB
respectively because it counted Next's legacy polyfill bundle, which carries `noModule`
and is deliberately never fetched by browsers supporting ES modules. Both sides were
inflated. Symptom that exposed it: an almost-empty page measuring 145.4 KB against a
150 KB budget — 4.6 KB of headroom for one heading is implausible.

**Second correction, 2026-08-21 (QE pass): two harnesses, two methods, one table.**

This section recorded **110.4 KB** while `bench/baseline/measure-payload.sh` — the script
criterion 4 explicitly names — reported **174.3 KB** against the same deployment. Both
numbers were real. The repo has two payload harnesses that measure different things:

| Harness | Method | Result |
|---|---|---|
| `bench/payload/measure.sh` | local `next start`, assets re-compressed locally at brotli quality 11 | 110.4 KB |
| `bench/baseline/measure-payload.sh` | fetches the **deployed** site, counts real on-the-wire bytes | 133.9 KB |

Two separate defects were tangled here:

1. **The baseline harness never implemented the `noModule` exclusion** described in the
   correction above. Its regex was `<script[^>]+src="..."`, which matches a tag whose
   `src` attribute precedes `noModule`, so the flag was invisible and Next's 40.4 KB legacy
   polyfill chunk was counted. Fixed: it now matches whole tags, filters `noModule`, and
   prints `nomodule_scripts_excluded` so a silent zero is visible. With the exclusion
   working it reports **133.9 KB**, stable across three runs, control still 0.3 KB.
2. **The published figure came from the other harness.** 110.4 KB is a correct measurement
   of a *local build with locally-applied brotli*, not of what Vercel serves. Vercel's
   brotli is not quality 11, so the local figure understates real transfer by ~23.5 KB.

The table above compares against 380.9 KB for the comparable portfolio, which was measured
**on its deployed site with real transfer bytes**. So 110.4 KB was the wrong number for
this comparison — not because it was wrong, but because it was measured a different way
than the thing it was being compared to. Method-mixed comparisons flatter whoever picked
the methods.

The figures are now **133.9 KB vs 380.9 KB**, both deployed-transfer, both from the same
harness: a **2.8×** difference rather than the 3.4× previously claimed. Criterion 4 still
passes, with 16.1 KB of headroom instead of 39.6. `bench/payload/measure.sh` is kept — a
local pre-deploy budget check is useful — but it is no longer the source of a published
number, and `src/generated/payload.json` now names the harness that produced its value.

`tests/adversarial/payload-claim-is-reproducible.test.ts` pins the mechanism rather than
the value: the harness must implement the exclusion it documents, and the published claim
must name a regeneration command that exists. The value itself needs a network fetch and
stays in the bench, where it belongs.

## Lighthouse — mobile

| Environment | Runs | Perf | A11y | BP | SEO | LCP | TBT |
|---|---|---|---|---|---|---|---|
| Local (`next start`) | 3 | 100 | 100 | 100 | 100 | 1.9 s | 10–20 ms |
| **Production** | 2 | **100** | **100** | **100** | **100** | **1.5–1.6 s** | 20–80 ms |
| Comparable portfolio | 1 | 62 | 100 | 100 | 100 | 3.9 s | 1,540 ms |

Production LCP beats local because Vercel serves brotli from an edge location.

## Retrieval — 30 golden queries, k=5

| Config | Backend | recall@5 | MRR |
|---|---|---|---|
| Lexical only | BM25 | 0.933 | 0.729 |
| **Hybrid** | BM25 + local trigram, RRF k=60 | **0.967** | **0.831** |

The vector leg is a deterministic stand-in, not a semantic model — see
`bench/retrieval/results/2026-08-21.md` for why that caveat is printed on every run.

One query misses: *"what happens when two compactions run at once"*. The answer is in
the corpus but phrased as "concurrent attempts". A real embedding model should close
this, which is a concrete falsifiable prediction to test.

## MCP relevance floor

At the shipped threshold: **8/10** true positives, **0/6** false positives against
hand-written supported and fabricated claim sets.

## What came out worse than expected

Six defects found by measurement rather than review, each recorded in
`docs/09-writeup.md` §5. The two that matter most: the verifier bound two citations a
browser cannot match, and the MCP server confirmed a fabricated credential. Both were
failures of exactly the guarantee the project exists to provide.
