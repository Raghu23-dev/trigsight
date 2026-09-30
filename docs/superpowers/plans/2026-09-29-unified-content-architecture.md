# Unified Content Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fold About-page prose, the Skills list, and nav/footer link data into Velite content collections so every piece of site content lives in `content/`, and make the chatbot's corpus generic over all of it instead of a hardcoded `[...projects, ...work]`.

**Architecture:** Four new Velite collections (`pages`, `skills`, `nav`, `footer`) alongside the existing `work`/`projects`/`notes`. `pages` and `skills` are prose (schema-validated MDX body + citations, chat-indexed); `nav`/`footer` are frontmatter-only structured data (no body, never chat-indexed — they aren't documents at all). `src/lib/content.ts` gains `allChatDocuments()`, which the chat route calls instead of hardcoding two collections. `bench/citations/verify.ts` needs zero changes — it already globs `content/**` directly off disk.

**Tech Stack:** Next.js 16 (App Router), Velite (MDX content layer, Zod-style schemas), Vitest, TypeScript, Tailwind.

**Spec:** [docs/superpowers/specs/2026-09-29-unified-content-architecture-design.md](../specs/2026-09-29-unified-content-architecture-design.md)

## Global Constraints

- Citation gate: any citation the chatbot can emit must bind to an exact quoted passage 24–300 characters long, present verbatim in the document's rendered text (`src/lib/verify-citations.ts` — unchanged, do not modify its thresholds).
- No new npm dependencies. Stay inside Next.js/Velite/Tailwind/Vitest, matching the site's existing "no animation library, no CMS" ethos.
- Content stays git-committed MDX under `content/` — no admin UI, no non-git authoring flow.
- `chatIndexed` is decided per collection, not per document (already-existing `draft: boolean` remains the per-document escape hatch for excluding a single doc from a chat-eligible collection).
- Full verification sequence before any PR: `npm run typecheck && npm run lint && npm run test && npm run content && npm run verify:citations && npm run build`, plus `bash bench/payload/measure.sh 3990 150`.
- Every new collection's documents that participate in chat indexing must expose `{ id, title, path, raw, draft }` — the shape `allChatDocuments()` depends on.

---

### Task 1: Velite schema — `pages`, `skills`, `nav`, `footer` collections

**Files:**
- Modify: `velite.config.ts`

**Interfaces:**
- Produces: four new collection exports (`pages`, `skills`, `nav`, `footer`) from `.velite/index`, each collection's document shape as defined below. Task 6 imports all four.

- [ ] **Step 1: Add the four collection definitions**

Insert after the existing `notes` collection definition (before `export default defineConfig({...})`):

```ts
/**
 * Singular pages that render at bespoke routes, not `/pages/[slug]`. Matched at the
 * content root (not a subdirectory) so the file layout mirrors the route layout the
 * same way every other collection does — except `home`, which is deliberately
 * special: the homepage route is `/`, not `/home`. Both the transform below and
 * `bench/citations/verify.ts`'s independent path derivation special-case exactly
 * that one slug; nothing else needs it.
 */
const pages = defineCollection({
  name: "Page",
  pattern: "*.mdx",
  schema: s
    .object({
      title: s.string().max(80),
      summary: s.string().max(200),
      eyebrow: s.string().max(80).optional(),
      headline: s.string().max(120).optional(),
      draft: s.boolean().default(false),
      body: s.mdx(),
      raw: s.raw(),
      slug: s.path(),
    })
    .transform((d) => ({
      ...d,
      id: d.slug,
      path: d.slug === "home" ? "/" : `/${d.slug}`,
    })),
});

/**
 * One file per taxonomy category, replacing the hardcoded array in
 * `src/lib/skills.ts`. `items` are the chip labels rendered verbatim in the UI;
 * `body` is short authored prose so the category is chat-citable — a bare chip
 * label like "FastAPI" is too short to pass the citation gate's minimum passage
 * length (24 characters).
 */
const skills = defineCollection({
  name: "SkillGroup",
  pattern: "skills/**/*.mdx",
  schema: s
    .object({
      title: s.string().max(60),
      items: s.array(s.string()).default([]),
      order: s.number().default(99),
      draft: s.boolean().default(false),
      body: s.mdx(),
      raw: s.raw(),
      slug: s.path(),
    })
    .transform((d) => ({ ...d, path: `/${d.slug}`, id: d.slug })),
});

/**
 * Nav and footer link data. Frontmatter-only — no body, no citations, because
 * there is no prose to cite. Excluded from the chat corpus by construction:
 * `content.ts` never includes these in the array-shaped, citable-document union
 * the corpus builder reads, because their document shape doesn't have one.
 */
const nav = defineCollection({
  name: "Nav",
  pattern: "chrome/nav.mdx",
  schema: s.object({
    primaryLinks: s.array(
      s.object({ label: s.string(), href: s.string(), order: s.number() }),
    ),
    contactLinks: s.array(
      s.object({
        label: s.string(),
        href: s.string(),
        external: s.boolean().default(false),
        hiddenOnMobile: s.boolean().default(false),
        variant: s.enum(["link", "button"]).default("link"),
      }),
    ),
  }),
});

const footer = defineCollection({
  name: "Footer",
  pattern: "chrome/footer.mdx",
  schema: s.object({
    links: s.array(
      s.object({
        label: s.string(),
        href: s.string(),
        external: s.boolean().default(false),
      }),
    ),
  }),
});
```

- [ ] **Step 2: Register the four collections**

Change:
```ts
  collections: { work, projects, notes },
```
to:
```ts
  collections: { work, projects, notes, pages, skills, nav, footer },
```

- [ ] **Step 3: Verify the schema compiles with zero content**

Run: `npm run content`
Expected: `[VELITE] build finished` with no errors. The four new collections have zero matching files yet, which is fine — Velite does not require at least one document per collection.

- [ ] **Step 4: Commit**

```bash
git add velite.config.ts
git commit -m "feat(content): add pages, skills, nav, footer collections"
```

---

### Task 2: Author `content/about.mdx`

**Files:**
- Create: `content/about.mdx`
- Create: `content/about.citations.json`

**Interfaces:**
- Consumes: the `pages` collection schema from Task 1.
- Produces: a document with `id: "about"`, `path: "/about"`. Task 8 reads this via `pageBySlug("about")`.

- [ ] **Step 1: Write the content file**

```mdx
---
title: About
summary: GenAI / full-stack engineer based in Hyderabad, India. Why this site and its four projects exist, and the discipline behind them.
---

I'm Raghuram, a GenAI / full-stack engineer based in Hyderabad, India. Day to day I build the infrastructure underneath AI products other engineers use: multi-agent orchestration on human-in-the-loop approval gates, hybrid retrieval pipelines, and the real-time streaming backbone that keeps a live generation UI in sync across pods — inside an enterprise platform used daily across five-plus client environments.

That work is proprietary, which means the parts I'm proudest of are invisible to anyone evaluating me from outside it. This site, and the [four projects](/projects) under it, exist to make a version of that work public, measured, and checkable by a stranger — not asserted on a résumé.

Each project follows the same order: measure the problem myself before citing anyone else's numbers, commit to a falsifiable thesis and pass/fail criteria *before* writing a feature, build only what the thesis needs, benchmark it, and publish whatever came out worse than expected alongside what worked. [onewayglass](/projects/onewayglass) narrowed its own headline claim after every pre-registered test had already passed. [mcpgantlet](/projects/mcpgantlet) found six specification violations in this site's own server before it found any in someone else's. I care about that order — measure, commit, build, verify, publish the miss — more than I care about any one result, and it's the discipline I bring to a team, not just a side project.

Outside work: B.Tech in Information Technology, Vel Tech Multi Tech Engineering College. The fastest way to reach me is [email](mailto:raghu.builds@gmail.com), or find the day job and the four projects laid out on [one page](/static/resume.pdf).
```

This is a verbatim migration of the prose currently hardcoded in `src/app/about/page.tsx:31-85` (JSX → markdown; `<em>before</em>` → `*before*`; `<Link>`/`<a>` → markdown links).

- [ ] **Step 2: Write the citations file**

```json
[
  {
    "docId": "about",
    "passage": "multi-agent orchestration on human-in-the-loop approval gates, hybrid retrieval pipelines, and the real-time streaming backbone"
  },
  {
    "docId": "about",
    "passage": "measure the problem myself before citing anyone else's numbers, commit to a falsifiable thesis and pass/fail criteria"
  },
  {
    "docId": "about",
    "passage": "found six specification violations in this site's own server before it found any in someone else's"
  }
]
```

- [ ] **Step 3: Verify the citations bind**

Run: `npm run content && npm run verify:citations`
Expected: `documents indexed: 11` (10 existing + `about`), all citations bound, `OK — every citation is bound to a real passage.`

- [ ] **Step 4: Commit**

```bash
git add content/about.mdx content/about.citations.json
git commit -m "content: migrate About page prose into content/about.mdx"
```

---

### Task 3: Author `content/home.mdx`

**Files:**
- Create: `content/home.mdx`
- Create: `content/home.citations.json`

**Interfaces:**
- Consumes: the `pages` collection schema from Task 1.
- Produces: a document with `id: "home"`, `path: "/"` (the special-cased root path). Task 9 reads this via `pageBySlug("home")`.

- [ ] **Step 1: Write the content file**

```mdx
---
title: Home
summary: I build the AI tools other engineers build with.
eyebrow: "Raghuram P · GenAI Full-Stack Engineer"
headline: "I build the AI tools other engineers build with."
---

Multi-agent orchestration, hybrid retrieval and real-time streaming backbones — shipped to production and used daily across enterprise environments.
```

`eyebrow` and `headline` are frontmatter fields, not body prose — `renderToText()` in `src/lib/passage-index.ts` strips frontmatter before indexing, so neither is ever chat-citable. That's consistent with how `title`/`category`/`period` on Project/Work docs already work today (only `body` is citable) — not a new inconsistency.

- [ ] **Step 2: Write the citations file**

```json
[
  {
    "docId": "home",
    "passage": "shipped to production and used daily across enterprise environments"
  }
]
```

- [ ] **Step 3: Verify the citations bind**

Run: `npm run content && npm run verify:citations`
Expected: `documents indexed: 12`, all bound.

- [ ] **Step 4: Commit**

```bash
git add content/home.mdx content/home.citations.json
git commit -m "content: migrate homepage hero copy into content/home.mdx"
```

---

### Task 4: Author the `skills` collection (8 categories)

**Files:**
- Create: `content/skills/ai-genai.mdx` + `content/skills/ai-genai.citations.json`
- Create: `content/skills/backend-apis.mdx` + `content/skills/backend-apis.citations.json`
- Create: `content/skills/frontend.mdx` + `content/skills/frontend.citations.json`
- Create: `content/skills/databases-storage.mdx` + `content/skills/databases-storage.citations.json`
- Create: `content/skills/messaging-realtime.mdx` + `content/skills/messaging-realtime.citations.json`
- Create: `content/skills/cloud-devops.mdx` + `content/skills/cloud-devops.citations.json`
- Create: `content/skills/architecture.mdx` + `content/skills/architecture.citations.json`
- Create: `content/skills/observability-testing.mdx` + `content/skills/observability-testing.citations.json`

**Interfaces:**
- Consumes: the `skills` collection schema from Task 1.
- Produces: 8 documents with `id: "skills/<slug>"`. Task 6 exports these sorted by `order`; Task 9 renders `items` as chips.

**Content note:** `items` in every file below is migrated verbatim from `src/lib/skills.ts`. The one-sentence `body` in each is new authored prose (per the spec's flagged content debt) — reads naturally, but review the exact wording before merging; nothing here is a placeholder, but it is a first draft of new copy, not a migration of existing copy.

- [ ] **Step 1: `content/skills/ai-genai.mdx`**

```mdx
---
title: AI / GenAI
order: 1
items:
  - Multi-Agent Orchestration (CrewAI)
  - RAG
  - LLM Routing
  - Prompt & Context Engineering
  - ReAct
  - AWS Bedrock
  - Azure OpenAI
  - Cohere Rerank
  - Tree-sitter
  - Vector DBs & Embeddings
---

Multi-agent orchestration on human-in-the-loop approval gates, hybrid retrieval pipelines evaluated with Cohere rerank, and LLM routing across AWS Bedrock and Azure OpenAI.
```

```json
[
  {
    "docId": "skills/ai-genai",
    "passage": "Multi-agent orchestration on human-in-the-loop approval gates, hybrid retrieval pipelines evaluated with Cohere rerank"
  }
]
```

- [ ] **Step 2: `content/skills/backend-apis.mdx`**

```mdx
---
title: Backend & APIs
order: 2
items:
  - FastAPI
  - gRPC
  - REST
  - GraphQL
  - SSE / Streaming APIs
  - Async Processing
  - Pydantic
  - JWT Auth
---

FastAPI services exposing REST, GraphQL and gRPC, with SSE streaming and JWT-authenticated async processing in production.
```

```json
[
  {
    "docId": "skills/backend-apis",
    "passage": "FastAPI services exposing REST, GraphQL and gRPC, with SSE streaming"
  }
]
```

- [ ] **Step 3: `content/skills/frontend.mdx`**

```mdx
---
title: Frontend
order: 3
items:
  - Angular (Standalone Components, RxJS, Signals)
  - React
  - Next.js
  - Monaco Editor
  - SCSS
  - Tailwind CSS
  - GSAP
---

Angular with standalone components, signals and RxJS in production, plus React and Next.js for this site and its retrieval-driven chat.
```

```json
[
  {
    "docId": "skills/frontend",
    "passage": "Angular with standalone components, signals and RxJS in production"
  }
]
```

- [ ] **Step 4: `content/skills/databases-storage.mdx`**

```mdx
---
title: Databases & Storage
order: 4
items:
  - PostgreSQL
  - Redis
  - MongoDB
  - ChromaDB
  - Qdrant
  - SQLite (FTS5, sqlite-vec)
  - asyncpg
  - SQLAlchemy
  - Alembic
---

PostgreSQL via asyncpg and SQLAlchemy, Redis and MongoDB in production, plus vector stores — ChromaDB, Qdrant, and SQLite's own FTS5 and sqlite-vec — for retrieval.
```

```json
[
  {
    "docId": "skills/databases-storage",
    "passage": "PostgreSQL via asyncpg and SQLAlchemy, Redis and MongoDB in production"
  }
]
```

- [ ] **Step 5: `content/skills/messaging-realtime.mdx`**

```mdx
---
title: Messaging & Real-Time
order: 5
items:
  - Apache Kafka
  - Redis Streams (Pub/Sub)
  - Server-Sent Events (SSE)
  - WebSockets
  - Event-Driven Architecture
---

Kafka and Redis Streams underneath an event-driven architecture, with SSE and WebSockets keeping a live generation UI in sync across pods.
```

```json
[
  {
    "docId": "skills/messaging-realtime",
    "passage": "Kafka and Redis Streams underneath an event-driven architecture"
  }
]
```

- [ ] **Step 6: `content/skills/cloud-devops.mdx`**

```mdx
---
title: Cloud & DevOps
order: 6
items:
  - AWS (Bedrock, RDS IAM)
  - Azure (DevOps Pipelines, Static Web Apps, App Services, Artifacts)
  - Docker
  - Kubernetes
  - Nginx
  - CI/CD (Azure Pipelines, GitHub Actions)
---

Docker and Kubernetes behind Nginx, deployed through Azure DevOps Pipelines and GitHub Actions, with AWS RDS IAM authentication in production.
```

```json
[
  {
    "docId": "skills/cloud-devops",
    "passage": "Docker and Kubernetes behind Nginx, deployed through Azure DevOps Pipelines"
  }
]
```

- [ ] **Step 7: `content/skills/architecture.mdx`**

```mdx
---
title: Architecture
order: 7
items:
  - Distributed Systems
  - Microservices
  - Micro-Frontend
  - Real-Time Streaming
  - Multi-Agent Systems
  - Event-Driven Design
  - Monorepo
---

Distributed, event-driven microservices and a micro-frontend monorepo, carrying multi-agent systems and real-time streaming end to end.
```

```json
[
  {
    "docId": "skills/architecture",
    "passage": "Distributed, event-driven microservices and a micro-frontend monorepo"
  }
]
```

- [ ] **Step 8: `content/skills/observability-testing.mdx`**

```mdx
---
title: Observability & Testing
order: 8
items:
  - OpenTelemetry
  - Prometheus
  - Grafana
  - pytest
  - Jest
  - Karma
  - Playwright
---

OpenTelemetry traces surfaced through Prometheus and Grafana, with pytest, Jest, Karma and Playwright covering the code underneath.
```

```json
[
  {
    "docId": "skills/observability-testing",
    "passage": "OpenTelemetry traces surfaced through Prometheus and Grafana"
  }
]
```

- [ ] **Step 9: Verify all 8 documents and citations bind**

Run: `npm run content && npm run verify:citations`
Expected: `documents indexed: 20` (12 + 8), all citations bound, `OK`.

- [ ] **Step 10: Commit**

```bash
git add content/skills/
git commit -m "content: migrate skills taxonomy into content/skills/*.mdx"
```

---

### Task 5: Author `content/chrome/nav.mdx` and `content/chrome/footer.mdx`

**Files:**
- Create: `content/chrome/nav.mdx`
- Create: `content/chrome/footer.mdx`

**Interfaces:**
- Consumes: the `nav`/`footer` collection schemas from Task 1.
- Produces: exactly one document each. Task 10/11 read these as unwrapped singletons via `content.ts`.

- [ ] **Step 1: `content/chrome/nav.mdx`**

Migrated verbatim from `src/components/nav.tsx:16-20` (primary links) and `:60-76` (contact links — GitHub/LinkedIn plain, LinkedIn hidden below `sm`, Résumé styled as a button):

```mdx
---
primaryLinks:
  - label: Projects
    href: /projects
    order: 1
  - label: About
    href: /about
    order: 2
  - label: Ask
    href: /ask
    order: 3
contactLinks:
  - label: GitHub
    href: https://github.com/Raghu23-dev
    external: true
    hiddenOnMobile: false
    variant: link
  - label: LinkedIn
    href: https://linkedin.com/in/raghuram-p
    external: true
    hiddenOnMobile: true
    variant: link
  - label: Résumé
    href: /static/resume.pdf
    external: false
    hiddenOnMobile: false
    variant: button
---
```

No body — this file is frontmatter-only, which is valid MDX (an empty body compiles to nothing).

- [ ] **Step 2: `content/chrome/footer.mdx`**

Migrated verbatim from `src/components/footer.tsx:18-55`:

```mdx
---
links:
  - label: Projects
    href: /projects
    external: false
  - label: About
    href: /about
    external: false
  - label: Email
    href: mailto:raghu.builds@gmail.com
    external: true
  - label: LinkedIn
    href: https://linkedin.com/in/raghuram-p
    external: true
  - label: GitHub
    href: https://github.com/Raghu23-dev
    external: true
---
```

- [ ] **Step 3: Verify the build**

Run: `npm run content && npm run verify:citations`
Expected: build succeeds. `documents indexed: 22` — `bench/citations/discover.ts`'s `documentFiles()` walks and counts every `.mdx` file regardless of body content, so `chrome/nav.mdx` and `chrome/footer.mdx` each add one to the count even though neither has a citations file pointing at it. This is expected, not a bug: 0 new citations, 0 new unbound, just 2 more indexed (and uncited) documents. Still `OK — every citation is bound to a real passage.`

- [ ] **Step 4: Commit**

```bash
git add content/chrome/
git commit -m "content: migrate nav and footer links into content/chrome/"
```

---

### Task 6: `content.ts` — export new collections, add `allChatDocuments()`

**Files:**
- Modify: `src/lib/content.ts`
- Test: `tests/correctness/content-corpus.test.ts`

**Interfaces:**
- Consumes: `pages`, `skills`, `nav`, `footer` from `.velite/index` (Tasks 1–5 must be complete — this task's test depends on real content existing).
- Produces:
  - `export const pages: Page[]`
  - `export const skills: SkillGroup[]` (sorted by `order`)
  - `export const nav: { primaryLinks: ...; contactLinks: ... }` (unwrapped singleton)
  - `export const footer: { links: ... }` (unwrapped singleton)
  - `export function pageBySlug(slug: string): Page | undefined`
  - `export interface ChatDocument { id, title, path, raw }`
  - `export function allChatDocuments(): ChatDocument[]`

  Task 7 (`route.ts`) consumes `allChatDocuments()`. Task 8 consumes `pageBySlug("about")`. Task 9 consumes `pageBySlug("home")` and `skills`. Task 10 consumes `nav`. Task 11 consumes `footer`.

- [ ] **Step 1: Write the failing test**

Create `tests/correctness/content-corpus.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { allChatDocuments, footer, nav, pages, skills } from "../../src/lib/content.ts";

describe("allChatDocuments", () => {
  it("includes the migrated pages and skills documents", () => {
    const ids = allChatDocuments().map((d) => d.id);
    expect(ids).toContain("about");
    expect(ids).toContain("home");
    expect(ids.filter((id) => id.startsWith("skills/")).length).toBe(8);
  });

  it("still includes the pre-existing work and project documents", () => {
    const ids = allChatDocuments().map((d) => d.id);
    expect(ids.some((id) => id.startsWith("work/"))).toBe(true);
    expect(ids.some((id) => id.startsWith("projects/"))).toBe(true);
  });

  it("never includes nav or footer, which have no citable body", () => {
    const ids = allChatDocuments().map((d) => d.id);
    expect(ids).not.toContain("nav");
    expect(ids).not.toContain("footer");
  });
});

describe("pages", () => {
  it("resolves the homepage to path '/', not '/home'", () => {
    const home = pages.find((p) => p.id === "home");
    expect(home?.path).toBe("/");
  });

  it("resolves about to path '/about'", () => {
    const about = pages.find((p) => p.id === "about");
    expect(about?.path).toBe("/about");
  });
});

describe("nav and footer", () => {
  it("are exposed as single objects, not arrays", () => {
    expect(Array.isArray(nav)).toBe(false);
    expect(Array.isArray(footer)).toBe(false);
  });

  it("carry the migrated link data", () => {
    expect(nav.primaryLinks.map((l) => l.label)).toEqual(["Projects", "About", "Ask"]);
    expect(footer.links.map((l) => l.label)).toContain("Email");
  });
});

describe("skills", () => {
  it("is sorted by order", () => {
    const orders = skills.map((s) => s.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it("has 8 categories, each with a citable body", () => {
    expect(skills).toHaveLength(8);
    for (const group of skills) expect(group.raw.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/correctness/content-corpus.test.ts`
Expected: FAIL — `pages`, `skills`, `nav`, `footer`, `allChatDocuments`, `pageBySlug` are not exported from `content.ts` yet.

- [ ] **Step 3: Implement `content.ts`**

Replace the full file:

```ts
/**
 * Typed access to Velite's build output.
 *
 * Everything reads content through here so a schema change surfaces as one type
 * error rather than several runtime surprises. Drafts are filtered at this
 * boundary, meaning no page or derivation can accidentally publish one.
 */
import {
  footer as allFooter,
  nav as allNav,
  notes as allNotes,
  pages as allPages,
  projects as allProjects,
  skills as allSkillGroups,
  work as allWork,
} from "../../.velite/index";

export type Work = (typeof allWork)[number];
export type Project = (typeof allProjects)[number];
export type Note = (typeof allNotes)[number];
export type Page = (typeof allPages)[number];
export type SkillGroup = (typeof allSkillGroups)[number];

export const work: Work[] = allWork
  .filter((w) => !w.draft)
  .sort((a, b) => a.order - b.order);

export const notes: Note[] = allNotes
  .filter((n) => !n.draft)
  .sort((a, b) => b.date.localeCompare(a.date));

export const projects: Project[] = allProjects
  .filter((p) => !p.draft)
  .sort((a, b) => a.order - b.order);

export const pages: Page[] = allPages.filter((p) => !p.draft);

export const skills: SkillGroup[] = allSkillGroups
  .filter((s) => !s.draft)
  .sort((a, b) => a.order - b.order);

// Singletons: exactly one document per collection, unwrapped for ergonomic access.
// `allNav`/`allFooter` are arrays because every Velite collection is, but there is
// never more than one nav.mdx or footer.mdx.
export const nav = allNav[0]!;
export const footer = allFooter[0]!;

export function workBySlug(slug: string): Work | undefined {
  return work.find((w) => w.id === `work/${slug}`);
}

export function projectBySlug(slug: string): Project | undefined {
  return projects.find((p) => p.id === `projects/${slug}`);
}

export function pageBySlug(slug: string): Page | undefined {
  return pages.find((p) => p.id === slug);
}

export interface ChatDocument {
  readonly id: string;
  readonly title: string;
  readonly path: string;
  readonly raw: string;
}

/**
 * Every collection whose documents are chat-indexable: array-shaped, with
 * `{ id, title, path, raw, draft }`. `nav`/`footer` are singletons with a
 * different shape entirely and are never part of this map — there is nothing to
 * exclude, they were never eligible. A new prose collection becomes chat-indexed
 * the moment it is added here; nothing in `route.ts` needs to change.
 */
const CHAT_COLLECTIONS = {
  work: allWork,
  projects: allProjects,
  notes: allNotes,
  pages: allPages,
  skills: allSkillGroups,
};

export function allChatDocuments(): ChatDocument[] {
  return Object.values(CHAT_COLLECTIONS).flatMap((docs) =>
    (
      docs as ReadonlyArray<{
        draft: boolean;
        id: string;
        title: string;
        path: string;
        raw: string;
      }>
    )
      .filter((d) => !d.draft)
      .map((d) => ({ id: d.id, title: d.title, path: d.path, raw: d.raw })),
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/correctness/content-corpus.test.ts`
Expected: PASS, all 9 assertions.

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `npm run test`
Expected: all existing tests (163 previously) plus the 9 new ones pass. `tests/correctness/retrieval.test.ts` imports `projects`/`work` from `content.ts` — confirm those exports are unchanged in shape (they are; only new exports were added).

- [ ] **Step 6: Commit**

```bash
git add src/lib/content.ts tests/correctness/content-corpus.test.ts
git commit -m "feat(content): export pages/skills/nav/footer, add allChatDocuments()"
```

---

### Task 7: Wire the chat route to `allChatDocuments()`

**Files:**
- Modify: `src/app/api/chat/route.ts:4` (import), `:44` (corpus loop)

**Interfaces:**
- Consumes: `allChatDocuments()` from Task 6.

- [ ] **Step 1: Update the import**

Change:
```ts
import { projects, work } from "../../../lib/content";
```
to:
```ts
import { allChatDocuments } from "../../../lib/content";
```

- [ ] **Step 2: Update the corpus-building loop**

Change:
```ts
  for (const d of [...projects, ...work]) {
    chunks.push(
      ...chunkDocument({ docId: d.id, docTitle: d.title, path: d.path, body: d.raw }),
    );
  }
```
to:
```ts
  for (const d of allChatDocuments()) {
    chunks.push(
      ...chunkDocument({ docId: d.id, docTitle: d.title, path: d.path, body: d.raw }),
    );
  }
```

- [ ] **Step 3: Run the existing chat-provider tests**

Run: `npx vitest run tests/correctness/chat-provider.test.ts`
Expected: PASS — this file tests provider/gateway resolution logic, unrelated to corpus assembly, so it should be unaffected.

- [ ] **Step 4: Verify the retrieval eval still passes with the wider corpus**

Run: `npm run eval:retrieval`
Expected: `recall@5` still meets the `>= 0.85` threshold from `docs/02-thesis.md`. The corpus is now larger (20 documents instead of 10), which could shift ranking — if recall drops below threshold, this is a real finding to report, not to suppress; do not proceed past this step until it passes or the drop is understood and accepted deliberately.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat(chat): index every chat-eligible collection, not just projects+work"
```

---

### Task 8: Wire the About page to `content/about.mdx`

**Files:**
- Modify: `src/app/about/page.tsx` (full rewrite)

**Interfaces:**
- Consumes: `pageBySlug("about")` from Task 6, `MDX` from `src/components/mdx.tsx` (existing, unmodified).

**Visual note, stated up front:** the shared `MDX` component styles its own `<p>` tags (`mt-5 leading-[1.75] text-fg-muted`, from `src/components/mdx.tsx:28-30`). This replaces About's previous bespoke `text-lg leading-relaxed` / `space-y-6` paragraph rhythm with the same rhythm Project/Work pages already use. That's a deliberate, minor visual consequence of sharing one renderer across all prose content — not preserved with override CSS, because fighting the shared component's styling would defeat the point of sharing it. Flagging it so it isn't mistaken for an unnoticed regression.

- [ ] **Step 1: Replace the file**

```tsx
import type { Metadata } from "next";
import { ViewTransition } from "react";
import Link from "next/link";
import { MDX } from "../../components/mdx";
import { pageBySlug } from "../../lib/content";
import { PAGE_TRANSITION } from "../../lib/page-transition";

export function generateMetadata(): Metadata {
  const doc = pageBySlug("about");
  return {
    title: doc?.title ?? "About",
    description: doc?.summary,
  };
}

export default function AboutPage() {
  const doc = pageBySlug("about");
  if (!doc) throw new Error("content/about.mdx is missing");

  return (
    <ViewTransition {...PAGE_TRANSITION}>
    <main className="mx-auto max-w-4xl px-6 py-20">
      <Link
        href="/"
        transitionTypes={["nav-back"]}
        className="font-mono text-2xs uppercase tracking-[0.2em] text-fg-subtle hover:text-fg"
      >
        ← Home
      </Link>

      <header className="mt-10">
        <h1 className="font-display text-3xl leading-tight tracking-tight text-fg">
          {doc.title}
        </h1>
      </header>

      <div className="mt-10 max-w-2xl">
        <MDX code={doc.body} />
      </div>
    </main>
    </ViewTransition>
  );
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: `/about` is prerendered as static content, no errors.

- [ ] **Step 3: Structural check (no browser in this environment — see repo convention)**

Run: `npx next start -p 3991 & sleep 2 && curl -s http://localhost:3991/about | grep -o "I&#x27;m Raghuram" ; kill %1`
Expected: the migrated prose's opening line appears in the rendered HTML.

- [ ] **Step 4: Commit**

```bash
git add src/app/about/page.tsx
git commit -m "feat(about): read About page prose from content/about.mdx"
```

---

### Task 9: Wire the homepage hero and Skills section to content

**Files:**
- Modify: `src/app/page.tsx:1-9` (imports), `:31-43` (hero), `:157-179` (Skills section)

**Interfaces:**
- Consumes: `pageBySlug("home")`, `skills` from Task 6, `MDX` from `src/components/mdx.tsx`.

- [ ] **Step 1: Update imports**

Change:
```tsx
import { projects, work } from "../lib/content";
import { skillGroups } from "../lib/skills";
```
to:
```tsx
import { MDX } from "../components/mdx";
import { pageBySlug, projects, skills, work } from "../lib/content";
```

- [ ] **Step 2: Replace the hero**

Change:
```tsx
      <header>
        <p className="font-mono text-2xs uppercase tracking-[0.2em] text-fg-subtle">
          Raghuram P · GenAI Full-Stack Engineer
        </p>
        <h1 className="mt-6 max-w-3xl font-display text-4xl leading-[1.05] tracking-tight text-fg">
          I build the AI tools other engineers build with.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-fg-muted">
          Multi-agent orchestration, hybrid retrieval and real-time streaming
          backbones — shipped to production and used daily across enterprise
          environments.
        </p>
      </header>
```
to:
```tsx
      <header>
        {(() => {
          const home = pageBySlug("home");
          if (!home) throw new Error("content/home.mdx is missing");
          return (
            <>
              <p className="font-mono text-2xs uppercase tracking-[0.2em] text-fg-subtle">
                {home.eyebrow}
              </p>
              <h1 className="mt-6 max-w-3xl font-display text-4xl leading-[1.05] tracking-tight text-fg">
                {home.headline}
              </h1>
              <div className="mt-6 max-w-2xl">
                <MDX code={home.body} />
              </div>
            </>
          );
        })()}
      </header>
```

Same visual note as Task 8 applies to the subhead paragraph: it now carries the shared `MDX` component's paragraph styling rather than its previous inline `text-lg leading-relaxed`.

- [ ] **Step 3: Replace the Skills section**

Change:
```tsx
        <div className="mt-8 space-y-6">
          {skillGroups.map((group, i) => (
            <Reveal key={group.category} delayMs={i * 40}>
              <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
                <h3 className="w-40 shrink-0 font-mono text-2xs uppercase tracking-wider text-fg-subtle">
                  {group.category}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {group.items.map((item) => (
                    <span key={item} className="skill-chip">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
```
to:
```tsx
        <div className="mt-8 space-y-6">
          {skills.map((group, i) => (
            <Reveal key={group.id} delayMs={i * 40}>
              <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
                <h3 className="w-40 shrink-0 font-mono text-2xs uppercase tracking-wider text-fg-subtle">
                  {group.title}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {group.items.map((item) => (
                    <span key={item} className="skill-chip">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
```

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: `/` prerendered, no errors.

- [ ] **Step 5: Structural check**

Run: `npx next start -p 3991 & sleep 2 && curl -s http://localhost:3991/ | grep -o "I build the AI tools other engineers build with" && curl -s http://localhost:3991/ | grep -o "Tree-sitter" ; kill %1`
Expected: both the headline and a skill chip from the migrated content appear.

- [ ] **Step 6: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(home): read hero copy and skills from content instead of hardcoded data"
```

---

### Task 10: Wire the Header/Nav component to `content/chrome/nav.mdx`

**Files:**
- Modify: `src/components/nav.tsx` (full rewrite)

**Interfaces:**
- Consumes: `nav` from Task 6.

- [ ] **Step 1: Replace the file**

```tsx
import Link from "next/link";
import { nav } from "../lib/content";

const linkClass =
  "font-mono text-2xs uppercase tracking-[0.14em] text-fg-muted transition-colors hover:text-fg";

/**
 * Site header.
 *
 * The only piece of persistent chrome on the site. Before this existed, the only way
 * to reach GitHub, LinkedIn, email, or a résumé was to already know the URL — every
 * page was an island reachable only by an inline "← Home" link. `scroll-padding-top`
 * in globals.css already assumed a fixed-height header (5rem) for anchor scrolling;
 * this is that header, sized to match.
 *
 * Link data lives in `content/chrome/nav.mdx`, not here — this component only knows
 * how to render a primary link and a contact link, in either of its two variants.
 */
export function Header() {
  const primaryLinks = [...nav.primaryLinks].sort((a, b) => a.order - b.order);

  return (
    <header
      className="sticky top-0 z-40 h-20 border-b border-border bg-bg/85 backdrop-blur"
      style={{ viewTransitionName: "site-header" }}
    >
      <div className="mx-auto flex h-full max-w-4xl items-center justify-between gap-6 px-6">
        <Link
          href="/"
          transitionTypes={["nav-back"]}
          className="flex items-center gap-2.5 font-mono text-2xs uppercase tracking-[0.14em] text-fg transition-colors hover:text-accent"
          aria-label="Raghuram P — home"
        >
          <svg viewBox="0 0 32 32" width="18" height="18" aria-hidden="true">
            <rect width="32" height="32" rx="6" fill="var(--color-bg)" stroke="var(--color-border-strong)" />
            <circle cx="16" cy="16" r="3" fill="var(--color-accent)" />
            <path
              d="M16 5v5M16 22v5M5 16h5M22 16h5"
              stroke="var(--color-accent-dim)"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          Raghuram P
        </Link>

        <nav aria-label="Primary" className="flex flex-wrap items-center gap-x-5 gap-y-1">
          {primaryLinks.map((l) => (
            <Link key={l.href} href={l.href} transitionTypes={["nav-forward"]} className={linkClass}>
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-4">
          {nav.contactLinks.map((l) => {
            const hideClass = l.hiddenOnMobile ? "hidden sm:inline" : "";
            const externalAttrs = l.external ? { target: "_blank", rel: "noreferrer" } : {};
            if (l.variant === "button") {
              return (
                <a
                  key={l.href}
                  href={l.href}
                  {...externalAttrs}
                  className={`${hideClass} rounded border border-border bg-surface px-3 py-1.5 font-mono text-2xs uppercase tracking-wider text-fg-muted transition-colors hover:border-accent-dim hover:text-fg`}
                >
                  {l.label}
                </a>
              );
            }
            return (
              <a key={l.href} href={l.href} {...externalAttrs} className={`${linkClass} ${hideClass}`}>
                {l.label}
              </a>
            );
          })}
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 3: Structural check**

Run: `npx next start -p 3991 & sleep 2 && curl -s http://localhost:3991/ | grep -c 'href="/projects"' ; kill %1`
Expected: at least 1 (the nav link renders); repeat for `/about`, `/ask`, `https://github.com/Raghu23-dev`, `/static/resume.pdf` to confirm all five still render.

- [ ] **Step 4: Commit**

```bash
git add src/components/nav.tsx
git commit -m "feat(nav): read link data from content/chrome/nav.mdx"
```

---

### Task 11: Wire the Footer component to `content/chrome/footer.mdx`

**Files:**
- Modify: `src/components/footer.tsx` (full rewrite)

**Interfaces:**
- Consumes: `footer` from Task 6.

- [ ] **Step 1: Replace the file**

```tsx
import Link from "next/link";
import { footer } from "../lib/content";
import allowlist from "../generated/citation-allowlist.json";
import payload from "../generated/payload.json";

/**
 * Site footer. Repeats the contact set from the header — a visitor who scrolls to
 * the end of a case study shouldn't have to scroll back to the top to reach it —
 * plus the same build-verified numbers the homepage stat strip shows, read from
 * the same generated files so the two can never disagree.
 *
 * Link data lives in `content/chrome/footer.mdx`. `mailto:` links never open a new
 * tab even though they're marked `external` (not a Next.js route) — that
 * distinction, not the `external` flag alone, decides whether `target="_blank"`
 * applies.
 */
export function Footer() {
  const verifiedCitations = Object.keys(allowlist).length;

  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
            {footer.links.map((l) => {
              const className = "font-mono text-2xs uppercase tracking-[0.14em] text-fg-muted hover:text-fg";
              if (!l.external) {
                return (
                  <Link key={l.href} href={l.href} transitionTypes={["nav-forward"]} className={className}>
                    {l.label}
                  </Link>
                );
              }
              const isMailto = l.href.startsWith("mailto:");
              return (
                <a
                  key={l.href}
                  href={l.href}
                  {...(isMailto ? {} : { target: "_blank", rel: "noreferrer" })}
                  className={className}
                >
                  {l.label}
                </a>
              );
            })}
          </nav>

          <p className="font-mono text-2xs text-fg-subtle">
            {verifiedCitations}/{verifiedCitations} claims bound to source &middot;{" "}
            {payload.initialJsKb} KB initial JS
          </p>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 3: Structural check**

Run: `npx next start -p 3991 & sleep 2 && curl -s http://localhost:3991/ | grep -o 'href="mailto:raghu.builds@gmail.com"' ; kill %1`
Expected: exactly one match, and (separately) confirm it has no adjacent `target="_blank"` by inspecting the surrounding HTML — the mailto link must not open a new tab.

- [ ] **Step 4: Commit**

```bash
git add src/components/footer.tsx
git commit -m "feat(footer): read link data from content/chrome/footer.mdx"
```

---

### Task 12: Delete `src/lib/skills.ts`, full verification, final commit

**Files:**
- Delete: `src/lib/skills.ts`

**Interfaces:**
- Consumes: nothing new. This task only removes now-dead code and runs the full gate.

- [ ] **Step 1: Confirm nothing still imports it**

Run: `grep -rn "lib/skills" src/ tests/`
Expected: no matches (Task 9 already removed the only import).

- [ ] **Step 2: Delete the file**

```bash
git rm src/lib/skills.ts
```

- [ ] **Step 3: Run the full verification sequence**

Run:
```bash
npm run typecheck && \
npm run lint && \
npm run test && \
npm run content && \
npm run verify:citations && \
npm run build
```
Expected: every step passes. This is the same sequence used for every PR on this repo this session.

- [ ] **Step 4: Run the payload budget check**

Run: `bash bench/payload/measure.sh 3990 150`
Expected: `within budget`. This is a content/data change, not new client JS, so the number should be effectively unchanged from the pre-migration baseline — investigate if it moves by more than a percent or two.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove src/lib/skills.ts, superseded by content/skills/*.mdx"
```

- [ ] **Step 6: Push and open a PR**

```bash
git push -u origin <branch-name>
gh pr create --title "feat: unified content architecture — pages, skills, nav, footer" --body "$(cat <<'EOF'
## Summary
About prose, the Skills list, and nav/footer link data move from hardcoded TSX/TS into
Velite content collections (`pages`, `skills`, `nav`, `footer`), matching how
Projects/Work/Notes already work. The chat corpus (`src/app/api/chat/route.ts`) now
calls `allChatDocuments()` instead of hardcoding `[...projects, ...work]`, so it
answers from About and Skills too, and any future collection is chat-indexed by
default the moment it's added to `content.ts`.

## Test plan
- [x] Full verification sequence: typecheck, lint, test, content, verify:citations, build
- [x] Payload budget unchanged (content/data change, no new client JS)
- [x] Structural checks confirm migrated hero/About/skills/nav/footer content renders
- [x] Retrieval eval still meets the recall@5 threshold against the wider corpus
EOF
)"
```

Wait for CI green before merging, matching this repo's established branch → verify → PR → CI → squash-merge → deploy → tag workflow.

---

## Self-Review Notes

**Spec coverage:** every section of the design spec has a task — schema (Task 1), `pages` migration (Tasks 2–3), `skills` migration (Task 4), `chrome` migration (Task 5), the generic aggregation layer (Task 6), the chat route swap (Task 7), and all five component rewires (Tasks 8–11), plus cleanup (Task 12). The spec's "Migration order" section maps directly onto Tasks 1–12 in the same sequence.

**Deviations from the spec, both justified above at the point they occur:** `pages` files live at `content/*.mdx` (top-level), not `content/pages/*.mdx` — this avoids needing a path-remapping special case beyond the one already-necessary `home → "/"` rule, since the generic `bench/citations/verify.ts` path formula (`/${id}`) only produces the right URL when the file's location already mirrors its route. `chrome` was split into two collections (`nav`, `footer`) rather than one, since their schemas don't share a shape and forcing a union would be more awkward than two small collections — the spec's self-review note already anticipated this kind of refinement being needed during implementation.

**Type consistency check:** `ChatDocument` (Task 6) is `{id, title, path, raw}` and Task 7's `chunkDocument` call reads `d.raw` for `body:` — consistent. `Page` (Task 6) always has `.id`/`.path` from the `pages` transform (Task 1); Task 8/9 call `pageBySlug()` which searches `pages` by `.id`, consistent with Task 1's transform setting `id: d.slug`. `nav.primaryLinks[].order` (Task 1 schema) is read and sorted in Task 10 — consistent. `SkillGroup.order` (Task 1) is sorted in `content.ts` (Task 6) and re-used for `Reveal`'s `delayMs` in Task 9 via array index, not the `order` field itself — correct, since `delayMs` wants position-in-list, not the raw order number.
