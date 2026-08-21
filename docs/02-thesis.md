# 02 — Thesis and Success Criteria

> **Gate:** this file is committed **before the first feature commit**.
> Git history is the proof these criteria were not retrofitted to the results.

## Thesis

**Every factual claim an AI assistant makes about my work can be bound at build time to the exact
sentence that supports it, such that an unverifiable claim cannot ship — and this can be delivered
inside a smaller JavaScript payload than a comparable portfolio that ships no 3D at all.**

Falsifiable in two independent ways: either a claim renders whose cited passage does not exist in the
source (the binding fails), or the payload target cannot be met with a WebGL scene shipping (the
performance half fails).

### Why this thesis and not the previous one

The original framing was "general AI search miscites, so make citations correct," targeting 0% broken
citations. **Measurement killed it** (see `01-problem.md` §A): the comparable implementation already
refuses out-of-corpus questions, denies false premises, and cannot render an unknown slug because the
client resolves against a build-time allowlist. Broken links were already solved. Claiming to fix them
would have been a straw man that any reviewer could disprove in five minutes on the same endpoint.

The surviving gap is **granularity and verifiability**, which that measurement did establish:
page-level, prose-attributed, and never validated against the source text.

## Success criteria

Numeric and pre-registered. Every feature must trace to one of these (pipeline step 4); anything that
does not goes in `NON-GOALS.md`.

| # | Criterion | Threshold | How measured |
|---|---|---|---|
| 1 | **Passage-level binding.** Every rendered citation resolves to a `#:~:text=` fragment whose quoted text exists verbatim in the cited source document. | **100%** of citations; **0** unbound claims shippable | `bench/citations/` verifier runs over the full corpus at build time; CI fails the build on any miss |
| 2 | **Unverifiable claims cannot ship.** A citation whose passage is absent from its source fails the build rather than degrading silently. | Build **fails**, exit ≠ 0 | Adversarial test: inject a citation with a fabricated passage; assert non-zero exit |
| 3 | **Retrieval grounding.** On a hand-built golden set, the answer's cited passages contain the supporting text. | **recall@5 ≥ 0.85**, groundedness **≥ 0.90** | `bench/retrieval/` over ~30 hand-written Q&A pairs with known correct sources; ≥3 runs, variance reported |
| 4 | **Payload.** Initial JS transfer, with a WebGL scene shipping. | **≤ 150 KB** (vs measured 423.4 KB) | `bench/baseline/measure-payload.sh` against the deployed site; ≥3 runs |
| 5 | **Mobile performance.** Lighthouse mobile, all four categories. | **≥ 95** each (vs measured Performance 62) | Lighthouse 12.x, `--form-factor=mobile`, enforced in CI |
| 6 | **Refusal.** Out-of-corpus questions are refused with a pointer, never answered. | **0** hallucinated answers across the adversarial suite | `tests/adversarial/` — out-of-corpus, false-premise, and injection probes |

Criteria 1–3 are the novel contribution. Criteria 4–6 are table stakes the baseline proves are not
universally met.

## Kill conditions

Named now so an honest negative result is publishable rather than buried.

- **If passage-level binding proves impractical** — e.g. `#:~:text=` fragments break on a meaningful
  share of real content (long passages, whitespace normalisation, dynamic text) — publish the failure
  modes and the percentage, and fall back to section-anchor citations. The measured limitation is
  itself a useful result.
- **If ≤150 KB is unreachable with WebGL shipping**, cut the 3D scene, not the budget. Publish the
  payload cost of the scene as the finding.
- **If retrieval grounding cannot clear 0.85 recall@5** on a portfolio-sized corpus (~25 documents),
  report that hybrid retrieval is unnecessary at this scale and that direct context-stuffing wins —
  which would be a genuinely useful negative result about small-corpus RAG.

## Explicitly not claimed

- Not claiming the comparable implementation hallucinates or produces broken links. **It does not**,
  and `01-problem.md` says so.
- Not claiming novelty for grounded chat, RAG, or MCP on a portfolio. Prior art exists.
- The novel part is narrow and specific: **build-time claim→passage binding as an enforced gate.**

## Out of scope

See `NON-GOALS.md`.
