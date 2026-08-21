# Payload baseline — corrected 2026-08-21

## What was wrong with the first measurement

The initial harness summed **every** `<script src>` in the HTML. Next.js emits a
legacy polyfill bundle carrying the `noModule` attribute, which browsers
supporting ES modules deliberately **do not fetch**. Counting it inflated both
sides of the comparison.

Discovered while investigating why an almost-empty page measured 145.4 KB against
a 150 KB budget — 4.6 KB of headroom for a single heading was implausible, so the
number was wrong rather than the budget being tight.

A second bug in the same pass: a `grep -oE '<script[^>]+>'` pattern silently
missed multi-line script tags, reporting 1 script instead of 21. Fixed by parsing
with a newline-aware regex in Node.

## Corrected figures — modern browsers only, brotli transfer

| Site | Modern JS | Legacy (`noModule`, not fetched) | Scripts |
|---|---|---|---|
| Comparable portfolio | **380.9 KB** | 40.4 KB | 20 modern + 1 legacy |
| `trigsight` (foundation only) | **106.6 KB** | 35.2 KB | 4 modern + 1 legacy |

Delta at this stage: **274.3 KB**. `trigsight` has content, retrieval, chat, MCP
and a WebGL scene still to add, so this gap will narrow — the budget of 150 KB is
the commitment, not 106.6 KB.

## Bundler comparison, measured not assumed

| Build | Modern JS (brotli) |
|---|---|
| Turbopack (Next 16 default) | 110.2 KB |
| webpack (`--webpack`) | **106.6 KB** |

webpack is marginally smaller at this size, so it is the current choice. This is a
4 KB difference and may invert once real dependencies land — worth re-measuring
before the payload writeup rather than treating as settled.

## What did not work

Adding `.browserslistrc` with modern targets produced a **byte-identical** polyfill
bundle. Next does not derive that bundle from browserslist, so the file was kept
for documentation value only; it changes nothing measurable. Recorded because a
plausible-looking optimisation that does nothing is worth knowing about.

## Reproduce

```bash
./bench/payload/measure.sh 3990 150   # ours; exits non-zero if over budget
```
