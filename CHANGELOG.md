# Changelog

Generated from Conventional Commits. Notable changes per release.

## [Unreleased]

## [0.5.2] — 2026-08-21

### Fixed
- **The chat provider endpoint was hardcoded**, so the deployed chat could not be pointed at a
  different provider without a code change. That mattered the moment Vercel's AI gateway began
  requiring a card on file to release its free credits: on a strictly $0 program the endpoint
  became unusable and unfixable at the same time. `CHAT_BASE_URL`, `CHAT_API_KEY` and
  `CHAT_MODEL` are now configuration, defaulting to the previous values so nothing that worked
  before changes. Any OpenAI-compatible provider works — Groq, Together, OpenRouter, local
  Ollama. The no-credential path still degrades to `mode: "retrieval-only"` rather than erroring.
- **`npm run lint` had been passing while checking nothing.** `next lint` was removed in Next 16,
  so the script was silently inert; wiring ESLint directly surfaced 9 real problems. This is the
  fourth verification step in this program found to report success without verifying — after a
  `| tail` masking a linter's exit code, an empty `tests/correctness/` exiting 5, a test module
  that never collected, and a `mypy` run that aborted before checking a file.

### Added
- `tests/correctness/chat-provider.test.ts` — asserts the chat endpoint cannot regress to a
  hardcoded provider URL. 130 tests total, up from 123.

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
