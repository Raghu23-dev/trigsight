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
  collections: { work, notes },
  mdx: {
    // No raw HTML in content: the chat renders markdown through a sanitiser, and
    // allowing HTML here would create two different trust models for one source.
    remarkPlugins: [],
    rehypePlugins: [],
  },
});
