# 01 — The Problem

> **Gate:** this file contains numbers I measured myself, not citations.
> Harness: `bench/baseline/`. Raw results: `bench/baseline/results/`.

## Statement

Two independent problems, both measured on live systems.

**A. Portfolio AI chat cites at the wrong granularity.** When an AI assistant on a personal site
makes a factual claim, the reader cannot verify it. The best current implementations link to a whole
page, or attribute in prose ("Source: my résumé — email me"). Neither lets a reader check the specific
sentence that supports the specific claim.

**B. Engineering portfolios ship large JS payloads for no interactive gain.** A site can ship
hundreds of kilobytes of JavaScript and still score poorly on mobile performance, while shipping no
3D or genuinely interactive content at all.

## Why it matters

For **A**: a portfolio's AI layer exists to make claims about the author's competence. An unverifiable
claim about competence is worth less than no claim, because a sceptical reader — which is what a
hiring manager is — has no way to confirm it and reasonable cause to discount it. Independent
measurement of general AI search products puts citation error rates above 60%, with only 51.5% of
generated sentences fully supported by their cited sources; readers have learned to distrust cited AI
output. Precision is the only defence.

For **B**: mobile performance is a proxy a technical reader actually checks, and the payload is
visible to anyone who opens devtools. Shipping 423 KB to render text is a legible signal about
engineering judgement.

## The measured baseline

**Measured on:** 2026-08-21
**Against:** a live, current, comparable engineering portfolio (Next.js/React/Tailwind on Vercel), and
the site currently linked from my own GitHub profile.
**Harness:** `bench/baseline/measure-payload.sh` — fetches the HTML as a browser would
(`Accept-Encoding: br, gzip`, Chrome UA), extracts every `<script src>`, fetches each once, sums
transfer bytes. One request per asset.

### A. Citation granularity — probed the live chat API, n=5

| Probe | Result |
|---|---|
| Out-of-corpus question | **Refused correctly.** No hallucination. |
| False premise ("worked at Google as a VP?") | **Explicitly denied** and corrected. No hallucination. |
| Card token → page resolution | `[[card:work:pensieve]]` → `/work/pensieve` returns **HTTP 200** |
| "Cite your source" | *"Source: My résumé / portfolio context — reach out at &lt;email&gt;."* |
| Internal reasoning leak | Present on **2 of 5** probes (a `"The visitor is asking…"` prefix) |

**What holds, stated plainly:** grounding and refusal work. The structural approach — the model emits
only `[[card:type:slug]]` and the client resolves against a build-time allowlist — means an unknown
slug cannot render a broken link. A thesis about hallucination or broken links would be attacking a
solved problem, and this measurement is why that framing was abandoned.

**The actual gap, in four parts:**
1. **Citations are prose, not addresses.** "Source: my résumé, email me" is unverifiable by design.
2. **Page-level, not passage-level.** The claim *"2K+ daily users"* links to an entire page. The
   reader must scan it and hope to locate the supporting sentence.
3. **No claim→source validation.** Slugs are allowlisted; the *claim text* is never checked against
   the cited document. A correct-looking citation can point at a document that does not support it.
4. **Reasoning-prefix leak** on 2/5 probes — minor prompt-hygiene defect, recorded for completeness.

### B. Payload — 3 runs, zero variance (immutable CDN assets)

| Site | HTML | Scripts | JS transfer | Initial total |
|---|---|---|---|---|
| Comparable portfolio | 38.0 KB | 21 | **423.4 KB** | **460.5 KB** |
| `raghurr.pages.dev` (my current site) | 2.0 KB | 4 | 60.4 KB | 62.4 KB |
| `example.com` (control) | 1.3 KB | 0 | 0.0 KB | 0.3 KB |

The control returning 0 scripts / 0.3 KB confirms the harness is not inventing bytes.

### Lighthouse 12.8.2 — comparable portfolio, mobile

| Category | Score |
|---|---|
| Performance | **62** |
| Accessibility | 100 |
| Best Practices | 100 |
| SEO | 100 |

| Metric | Value |
|---|---|
| First Contentful Paint | 1.0 s |
| **Largest Contentful Paint** | **3.9 s** |
| **Total Blocking Time** | **1,540 ms** |
| Cumulative Layout Shift | 0.001 |
| Speed Index | 2.5 s |

The LCP element was a text paragraph — consistent with the documented constraint that a `<canvas>` can
trigger FCP but can never be the LCP element, and that a full-viewport element is also disqualified.

**Note on fairness:** that site scores 100 on accessibility, best practices and SEO. It is not a weak
implementation, and the comparison is only meaningful because the target is to beat 423 KB **while
shipping more** — a WebGL scene it does not have. Beating it by shipping less content would prove
nothing.

## Raw output

- `bench/baseline/results/payload-2026-08-21.tsv`
- `bench/baseline/results/lighthouse-reference-2026-08-21.json`
- `bench/baseline/results/citation-probe-2026-08-21.md`

## How to reproduce

```bash
bench/baseline/measure-payload.sh https://<url>

npx lighthouse@12 https://<url> --form-factor=mobile --screenEmulation.mobile \
  --only-categories=performance,accessibility,best-practices,seo --quiet \
  --chrome-flags="--headless=new" --output=json --output-path=./lh.json
```

## Prior art

Cited to support the measurement, never to replace it:
- General AI search citation error rates above 60%; only 51.5% of generated sentences fully supported
  by their cited sources.
- Roughly 1% of users click citations — they function as trust signals rather than navigation, which
  is precisely why they must be correct rather than merely present.
- Scroll-to-text fragments (`#:~:text=`) are supported across current major browsers and degrade to a
  plain URL where unsupported.
