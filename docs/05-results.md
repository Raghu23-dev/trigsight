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
| 4 | Initial JS | ≤ 150 KB | 110.4 KB with WebGL shipping | yes |
| 5 | Lighthouse mobile ×4 | ≥ 95 | 100 / 100 / 100 / 100 | yes |
| 6 | Hallucinated answers | 0 | 0 across the adversarial suite | yes |

## Payload — modern-browser brotli transfer

| Site | Initial JS | Scripts | WebGL |
|---|---|---|---|
| Comparable portfolio | 380.9 KB | 20 | none |
| trigsight | **110.4 KB** | 6 | shipping |

Three runs each, zero variance (immutable CDN assets). `example.com` as a control
returns 0 scripts / 0.3 KB, confirming the harness does not invent bytes.

**Correction recorded:** the first measurement reported 423.4 KB and 145.4 KB
respectively because it counted Next's legacy polyfill bundle, which carries `noModule`
and is deliberately never fetched by browsers supporting ES modules. Both sides were
inflated. Symptom that exposed it: an almost-empty page measuring 145.4 KB against a
150 KB budget — 4.6 KB of headroom for one heading is implausible.

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
