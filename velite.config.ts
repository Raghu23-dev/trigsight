import { defineCollection, defineConfig, s } from "velite";

/**
 * Content schema.
 *
 * Zod validation here is what makes the citation gate type-safe: a document with
 * a missing title or malformed frontmatter fails the build rather than rendering
 * blank. The gate can then assume every indexed document is well-formed.
 *
 * One content source, six derivations — pages, chat corpus, passage index, MCP
 * tool output, .md variants, and resume data all read from `content/`.
 */

const metrics = s
  .array(
    s.object({
      label: s.string().max(40),
      value: s.string().max(24),
      /** Whether this number is independently reproducible by a reader. */
      verified: s.boolean().default(false),
    }),
  )
  .default([]);

const work = defineCollection({
  name: "Work",
  pattern: "work/**/*.mdx",
  schema: s
    .object({
      title: s.string().max(80),
      /** One sentence. Shown in listings and fed to the chat corpus. */
      summary: s.string().max(200),
      /** Category, never a product codename — employer naming stays generic. */
      category: s.string().max(60),
      period: s.string().max(40),
      /** Ordering in listings; lower is more prominent. */
      order: s.number().default(99),
      stack: s.array(s.string()).default([]),
      metrics,
      /** Deliberately excluded from the site while still tracked in the repo. */
      draft: s.boolean().default(false),
      slug: s.path(),
      body: s.mdx(),
      raw: s.raw(),
    })
    .transform((d) => ({ ...d, path: `/${d.slug}`, id: d.slug })),
});

/**
 * Projects built independently, as opposed to the employer work in `work/`.
 *
 * Deliberately a separate collection rather than a flag on `work`, because the shape of the
 * evidence differs. Employer work is described generically and cannot be verified from outside.
 * These have a live URL, a public repo and a reproducible benchmark — so the schema REQUIRES
 * those three fields, and a project that cannot supply them fails the build.
 *
 * `limitation` is required for the same reason. Every one of these published a measured result
 * that came out worse than hoped, and a projects section listing only headline numbers would be
 * the marketing the rest of this site argues against.
 */
const projects = defineCollection({
  name: "Project",
  pattern: "projects/**/*.mdx",
  schema: s
    .object({
      title: s.string().max(80),
      /** One sentence. Shown in listings and fed to the chat corpus. */
      summary: s.string().max(200),
      /** What kind of problem this is, not what it is built with. */
      category: s.string().max(60),
      period: s.string().max(40),
      order: s.number().default(99),
      /** A running instance a stranger can hit. Required — a repo alone is not a product. */
      live: s.string().url(),
      repo: s.string().url(),
      /** The single number that carries the argument, e.g. "17 documents revealed becomes 0". */
      headline: s.string().max(120),
      /**
       * The measured thing that came out worse than hoped, in one sentence. Required, because a
       * project with no published limitation has either not been measured hard enough or is
       * being sold rather than described.
       */
      limitation: s.string().max(280),
      /** One command a reader can run to reproduce the headline. */
      reproduce: s.string().max(160),
      stack: s.array(s.string()).default([]),
      metrics,
      draft: s.boolean().default(false),
      slug: s.path(),
      body: s.mdx(),
      raw: s.raw(),
    })
    .transform((d) => ({ ...d, path: `/${d.slug}`, id: d.slug })),
});

const notes = defineCollection({
  name: "Note",
  pattern: "notes/**/*.mdx",
  schema: s
    .object({
      title: s.string().max(120),
      summary: s.string().max(240),
      date: s.isodate(),
      tags: s.array(s.string()).default([]),
      draft: s.boolean().default(false),
      slug: s.path(),
      body: s.mdx(),
      raw: s.raw(),
    })
    .transform((d) => ({ ...d, path: `/${d.slug}`, id: d.slug })),
});

export default defineConfig({
  root: "content",
  output: {
    data: ".velite",
    assets: "public/static",
    base: "/static/",
    clean: true,
  },
  collections: { work, projects, notes },
  mdx: {
    // No raw HTML in content: the chat renders markdown through a sanitiser, and
    // allowing HTML here would create two different trust models for one source.
    remarkPlugins: [],
    rehypePlugins: [],
  },
});
