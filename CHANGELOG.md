# Changelog

Generated from Conventional Commits. Notable changes per release.

## [Unreleased]

## [0.5.1] — 2026-08-21

### Fixed
- **`bench/baseline/measure-payload.sh` never implemented the `noModule` exclusion its own
  results doc describes.** The regex `<script[^>]+src="…"` matches tags where `src` precedes
  `noModule`, so Next's 40.4 KB legacy polyfill — which no ES-module browser fetches — was
  counted, giving 174.3 KB. It now matches whole tags and reports
  `nomodule_scripts_excluded` so a silent zero is visible.
- **Initial JS corrected from 110.4 KB to 133.9 KB.** The published figure came from
  `bench/payload/measure.sh`, which measures a *local* build with brotli applied locally at
  quality 11; the 380.9 KB comparable was measured on its deployment with real transfer bytes.
  Comparing the two mixed methods. Both sides now come from the deployed-transfer harness:
  2.8x rather than the 3.4x previously claimed. Criterion 4 still passes, with 16.1 KB of
  headroom. `src/generated/payload.json` records which method produced its value.

### Added
- `tests/adversarial/payload-claim-is-reproducible.test.ts` — pins the mechanism rather than the
  value: the harness must implement the exclusion it documents, the two harnesses must not be
  confusable, and the published claim must name a regeneration command that exists.

### Documented
- Criterion 6 ("0 hallucinated answers") is **unexercised on the deployment**:
  `AI_GATEWAY_API_KEY` is unset, so `/api/chat` returns `mode: "retrieval-only"` and never calls
  a model. Retrieval works live, but refusal behaviour is proven by `tests/adversarial/` only
  and cannot be checked by a visitor.
