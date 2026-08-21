# Citation-integrity baseline — measured 2026-08-21

Probed the reference implementation's live chat API directly (POST /api/chat, n=5 queries).

## What HOLDS (my initial assumption was wrong)

| Test | Result |
|---|---|
| Out-of-corpus question (Monty Python) | **Refused correctly**, offered scope. No hallucination. |
| False premise ("worked at Google as VP?") | **Explicitly denied**, corrected with real role. No hallucination. |
| Card token resolution (`[[card:work:pensieve]]`) | `/work/pensieve` returns **HTTP 200** — resolves. |
| Internal reasoning leak | Appeared on 2 of 5 probes ("The visitor is asking…" prefix) — inconsistent, not systematic. |

**Conclusion: grounding and refusal behaviour are genuinely solid.** The structural
allowlist approach (model emits only `[[card:type:slug]]`, client resolves against a
build-time list) works — an unknown slug cannot render a broken link.

## What is actually WEAK (the real, measurable gap)

1. **Citations are prose, not addresses.** Asked to cite a source, it answered:
   *"Source: My résumé / portfolio context — reach out at <email>."* That is not a
   verifiable citation. A reader cannot check the claim; they can only email the author.
2. **No passage-level anchoring.** The card token links to a whole page
   (`/work/pensieve`), not to the sentence supporting the claim. The specific assertion
   ("2K+ daily users") is unanchored — you must read the page and hope to find it.
3. **No build-time validation of claim→source.** Slugs are allowlisted, but nothing
   verifies the *claim text* is actually supported by the cited document.
4. **Reasoning-prefix leak** on 2/5 probes — a prompt-hygiene defect, minor.

## Revised thesis for trigsight

Original assumption — "general AI search miscites, so make citations correct" — **does not
survive contact with this baseline.** The nearest comparable implementation already refuses
and denies correctly. Claiming to fix hallucination would be attacking a solved problem.

The honest, measurable gap is **citation granularity and verifiability**:
- theirs: page-level, prose-attributed, unvalidated
- target: **passage-level** (`#:~:text=` deep link to the exact highlighted sentence),
  **machine-validated at build time** (a citation cannot render unless its target text
  exists in the source), and **0% broken** as an enforced CI gate.

That is a real delta, measurable, and not a straw man.
