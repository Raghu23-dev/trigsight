# Unified content architecture — design

**Status:** approved by sections in chat, pending final spec review.
**Scope:** Phase 1 of a two-phase request. Phase 2 (chat UI/motion overhaul —
citation-flash fix, layout, typewriter effect) is a separate spec, not covered here.

## Why

Two problems, one root cause. First: adding or editing most site content is easy
(`work/`, `projects/`, `notes/` are already schema-validated Velite MDX collections —
drop in a file, the build fails if a required field is missing), but About-page prose
and the Skills list are hand-written directly in TSX/TS
(`src/app/about/page.tsx`, `src/lib/skills.ts`), so editing those means editing code.
Second: the chatbot's corpus (`src/app/api/chat/route.ts`) only ever indexed
`[...projects, ...work]` — Notes (schema exists, unused), About, and Skills were never
answerable, regardless of how the content was authored.

Both problems have the same fix: one content system, where "is this content
structured" and "is this content chat-indexed" are the same question asked once per
collection, not decided per feature.

## Architecture

One root (`content/`), one schema file (`velite.config.ts`), one aggregation layer
(`src/lib/content.ts`). Every collection is either:

- **prose** — has `body: s.mdx()` + `raw: s.raw()`, ships a sibling
  `<slug>.citations.json`, and every claim the chatbot cites from it must bind to an
  exact quoted passage (the existing gate in `src/lib/verify-citations.ts`,
  unchanged), or
- **data** — flat structured fields, no body, nothing to cite.

`content.ts` holds one manifest and one derived function. The sketch below is
illustrative, not final code — `chrome`'s documents don't share the same shape as the
prose collections (no `raw`/citable body), so the real implementation needs a type-safe
way to filter `chrome` out *before* mapping to `DocumentInput`, e.g. two narrower
manifests (`CHAT_COLLECTIONS` containing only prose collections, plus `chrome` tracked
separately) rather than one union type with an exclusion set. Same behavior — a new
prose collection is chat-indexed by default — just resolved during implementation
rather than prescribed here at the type level:

```ts
const ALL_COLLECTIONS = { work, projects, notes, pages, skills, chrome } as const;
const CHAT_EXCLUDED = new Set<keyof typeof ALL_COLLECTIONS>(["chrome"]);

export function allChatDocuments(): DocumentInput[] {
  return Object.entries(ALL_COLLECTIONS)
    .filter(([name]) => !CHAT_EXCLUDED.has(name as keyof typeof ALL_COLLECTIONS))
    .flatMap(([, docs]) =>
      (docs as Array<{ draft: boolean; id: string; title: string; path: string; raw: string }>)
        .filter((d) => !d.draft)
        .map((d) => ({ id: d.id, path: d.path, title: d.title, body: d.raw })),
    );
}
```

`route.ts` changes from `for (const d of [...projects, ...work])` to
`for (const d of allChatDocuments())`. A collection is chat-indexed **by default** the
moment it's added to `ALL_COLLECTIONS` — opting out means adding its name to
`CHAT_EXCLUDED`, not adding it to an inclusion list. The one unavoidable manual step:
Velite requires every collection to be declared in `velite.config.ts` and in this one
map — there is no zero-touch path, but it is the same single step already required to
make a collection's content usable by any page.

**No change needed** in `bench/citations/verify.ts`: it globs `content/**/*.mdx` and
`content/**/*.citations.json` directly off disk, never through Velite or a hardcoded
collection list. New collections are picked up automatically.

## New collections

### `pages` — About and the homepage hero

```
content/pages/about.mdx
content/pages/home.mdx
```

Schema: `{ title, summary, eyebrow?, headline?, body: s.mdx(), raw: s.raw(), slug: s.path() }`
→ `id`/`path` via the same `.transform()` pattern as `work`/`projects`.

The current homepage (`src/app/page.tsx`) has three distinct typographic pieces — a
small eyebrow line, an `<h1>`, and a subhead paragraph — so `home.mdx` carries
`eyebrow` and `headline` as separate fields, with `body` holding the subhead prose.
`about.mdx`'s `body` is the full prose currently hardcoded in the About page
component. Each page gets a `.citations.json`, same shape as Projects/Work. The
homepage's verification-status strip (citation count, payload KB) stays
computed-at-build-time code, not content — it was never static prose.

`chatIndexed: true`.

### `skills` — one file per category

```
content/skills/ai-genai.mdx
content/skills/backend-apis.mdx
content/skills/frontend.mdx
content/skills/databases-storage.mdx
content/skills/messaging-realtime.mdx
content/skills/cloud-devops.mdx
content/skills/architecture.mdx
content/skills/observability-testing.mdx
```

Schema: `{ title, items: string[], order, body: s.mdx(), raw: s.raw(), slug: s.path() }`.
`items` are the chip labels, migrated verbatim from `src/lib/skills.ts`, rendered
exactly as today.

**Content debt, stated up front:** the citation gate requires passages ≥24 characters
(`MIN_PASSAGE_CHARS` in `verify-citations.ts`). A bare chip like `"FastAPI"` cannot
meet that. Each category's `body` needs one real authored sentence for it to be
citable at all — e.g. *"Built production RAG pipelines over vector databases,
evaluated with Cohere rerank."* for AI/GenAI. This is new prose to write (8 short
sentences), not a mechanical migration of the existing array.

`chatIndexed: true`.

### `chrome` — nav and footer

```
content/chrome/nav.mdx    → frontmatter only: { links: [{ label, href, order }] }
content/chrome/footer.mdx → frontmatter only: { copyright, links: [{ label, href }] }
```

No `body`, no citations file — there is nothing to cite. Still a real collection in
the same `content/` root and `velite.config.ts`, because "one system" means one
pipeline, not that every collection has the same shape.

`chatIndexed: false` (in `CHAT_EXCLUDED`).

## Component changes

| File | Change |
|---|---|
| `velite.config.ts` | Add `pages`, `skills`, `chrome` collection definitions |
| `src/lib/content.ts` | Export the three new collections; add `ALL_COLLECTIONS`, `CHAT_EXCLUDED`, `allChatDocuments()` |
| `src/app/api/chat/route.ts` | `[...projects, ...work]` → `allChatDocuments()` |
| `src/app/about/page.tsx` | Becomes a thin renderer: reads `pages.about`, renders `body` through the existing `Mdx` component (already used for Project/Work bodies) |
| `src/app/page.tsx` | Reads `pages.home` for eyebrow/headline/body instead of inline JSX text |
| Skills section component (currently inline in `src/app/page.tsx`, driven by `src/lib/skills.ts`) | Maps over the `skills` collection sorted by `order`, instead of `skillGroups` |
| `src/components/nav.tsx` | Reads `chrome.nav.links` instead of hardcoded links |
| `src/components/footer.tsx` | Reads `chrome.footer` instead of hardcoded content |
| `src/lib/skills.ts` | Deleted once the Skills section is migrated |

## Data flow

Build time: Velite compiles `content/**` → `.velite/index` → `content.ts` re-exports
typed, filtered (non-draft), sorted collections → pages render directly from those →
`allChatDocuments()` derives the chat corpus from the same typed data →
`bench/citations/verify.ts` independently re-reads the same `content/` tree from disk
(by design — it must not trust Velite's transform, only the raw files) and writes
`src/generated/citation-allowlist.json`, which the chat UI already consumes to resolve
`[[cite:...]]` tokens. No new data path — every new collection rides the existing one.

## Error handling

Unchanged. A missing required field fails the Velite build (existing Zod schemas). An
unverifiable citation fails `bench/citations/verify.ts` (existing gate, already
generic). A draft document is filtered out of both pages and the chat corpus by the
same `!d.draft` check `allChatDocuments()` shares with `content.ts`'s existing
exports — one filter, not two to keep in sync.

## Testing

- Existing test suite (163 tests) must stay green; no test currently asserts the
  corpus is exactly `[...projects, ...work]`, so widening it shouldn't break anything,
  but a targeted test asserting `allChatDocuments()` excludes `chrome` and includes the
  rest is worth adding.
- `npm run verify:citations` must pass with the new `pages`/`skills` citation files in
  place — this is the real gate, no separate test needed.
- `npm run build` + `bash bench/payload/measure.sh` to confirm the payload budget
  still holds (unlikely to move — this is a data/content change, not new client JS).
- Manual/structural check (per this repo's no-browser convention): fetch `/`, `/about`,
  and `/ask` post-build, assert expected text/DOM presence for the migrated content.

## Migration order (for the implementation plan)

1. `velite.config.ts` schema additions (`pages`, `skills`, `chrome`) — build should
   fail loudly until content exists, which is the point.
2. Author `content/pages/about.mdx`, `home.mdx` + citations, migrating existing prose
   verbatim.
3. Author `content/skills/*.mdx` (8 files) — migrate `items` verbatim, write the 8 new
   blurb sentences, add citations.
4. Author `content/chrome/nav.mdx`, `footer.mdx` — migrate existing links verbatim.
5. `content.ts`: export new collections, add `allChatDocuments()`.
6. Wire components (About, Home, Skills section, Nav, Footer) to read from content
   instead of hardcoded data.
7. `route.ts`: swap in `allChatDocuments()`.
8. Delete `src/lib/skills.ts`.
9. Full verification sequence (typecheck, lint, test, `verify:citations`, build,
   payload budget) before PR.

## Explicitly out of scope

- Phase 2 (chat UI/motion overhaul) — separate spec.
- Any CMS, admin UI, or non-git authoring flow — content stays git-committed MDX,
  matching the existing Projects/Work/Notes workflow and the site's YAGNI ethos.
- Per-document `chatIndexed` overrides — decided as collection-level only.
