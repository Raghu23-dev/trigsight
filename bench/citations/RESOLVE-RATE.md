# Live citation resolve rate

**Measured against production**, not against a local reimplementation.

```bash
npx tsx bench/citations/resolve-rate.mts
```

| Change | Rate |
|---|---|
| Groq wired, prompt unchanged | **0 / 3 — 0%** |
| Allowlist shown to the model, scoped to retrieved docs | 1 / 3 — 33% |
| Trailing sentence punctuation tolerated in the resolver | 1 / 5 — 20% |
| Prose-inside-token forbidden explicitly, with examples | **3 / 6 — 50%** |

## Why 0% was structural, not a tuning problem

The model was told "quote verbatim from the context" and then judged against a build-time
allowlist **it had never been shown**. It quoted real sentences from the retrieved chunks —
correctly, by the instruction it was given — and every one failed to resolve, because only the
hand-verified passages are citable.

`segment()` drops unresolvable tokens silently, so the prose stayed true and no chip rendered. The
site's central mechanism was inert while looking like it worked.

## Two measurement mistakes worth recording

**The first harness reimplemented the resolver.** It did its own exact-match lookup against the
allowlist JSON, so it never called `resolveToken()` — and reported the pre-fix behaviour after the
fix was deployed. A harness that reimplements the thing it measures is measuring itself.

**A 95-character diff hid the real difference.** Two passages looked identical when truncated for
display. Byte-level comparison showed the model appending `, then reranked.` — sixteen characters
of its own prose inside the token. Diagnosis by eye at a truncation boundary is not diagnosis.

## What is still failing, and why it is left failing

Half the attempted citations still do not resolve. The remaining failures are the model quoting a
passage that is genuinely in the retrieved chunk but **not in the verified allowlist** — the
retriever surfaces more text than has been hand-verified as citable.

Two ways to close it, neither taken yet:

- **Verify more passages.** Raises the ceiling, costs an hour per document, and every added
  passage must still bind at build time.
- **Relax the match.** Rejected. A citation resolving to a paraphrase is worse than one that fails,
  because it renders a chip that misquotes the source. The one-character punctuation tolerance is
  as far as this goes, and a test pins that paraphrase is still refused.

**50% is published rather than rounded up.** A chip that renders is always a verbatim quote of a
verified passage — that property holds at any rate. What 50% measures is how often the model can
find something in the verified set worth citing, not how often it cites correctly.
