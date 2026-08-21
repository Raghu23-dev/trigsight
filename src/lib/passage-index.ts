/**
 * Build-time index of every document's rendered, normalised text.
 *
 * This is what a citation is verified against. It deliberately indexes the
 * *rendered* text (MDX compiled, tags stripped) rather than the source, because
 * that is what the browser matches — see src/lib/normalise.ts for the measurement
 * that forced this.
 */

import { normalise } from "./normalise";

export interface IndexedDocument {
  /** Stable id used in citation tokens, e.g. "work/experience-studio". */
  readonly id: string;
  /** Public URL path, e.g. "/work/experience-studio". */
  readonly path: string;
  readonly title: string;
  /** Rendered text, normalised. What citations are matched against. */
  readonly text: string;
  /** Rendered text before normalisation — used to quote passages back to readers. */
  readonly display: string;
  /** Original MDX source. Needed to detect inline-markup boundaries. */
  readonly source: string;
}

export type PassageIndex = ReadonlyMap<string, IndexedDocument>;

/**
 * Strip MDX/HTML to the text a browser would render.
 *
 * Order matters: fenced code and JSX expressions are removed before inline
 * markup, otherwise their contents leak into the indexed text and a citation
 * could "match" a passage that is not visible on the page.
 */
export function renderToText(mdx: string): string {
  let out = mdx;

  // Frontmatter — metadata, never rendered.
  out = out.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");

  // Fenced code blocks. Rendered, but as code; citing inside them is not
  // supported, and their punctuation would pollute prose matching.
  out = out.replace(/```[\s\S]*?```/g, " ");
  out = out.replace(/~~~[\s\S]*?~~~/g, " ");

  // Import/export statements in MDX.
  out = out.replace(/^\s*(?:import|export)\s+[^\n]*$/gm, " ");

  // JSX/HTML comments and expression containers.
  out = out.replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");
  out = out.replace(/<!--[\s\S]*?-->/g, " ");

  // JSX/HTML tags. Their text content is kept; the tags themselves are not text.
  out = out.replace(/<[^>]+>/g, " ");

  // Images before links — image syntax contains link syntax.
  out = out.replace(/!\[([^\]]*)\]\([^)]*\)/g, " $1 ");
  out = out.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");

  // Inline code: backticks are not rendered, the content is.
  out = out.replace(/`([^`]*)`/g, "$1");

  // Emphasis markers.
  out = out.replace(/(\*\*\*|\*\*|\*|___|__|_)(.*?)\1/g, "$2");

  // Heading hashes, blockquote markers, list bullets, table pipes.
  out = out.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  out = out.replace(/^\s{0,3}>\s?/gm, "");
  out = out.replace(/^\s*[-*+]\s+/gm, "");
  out = out.replace(/^\s*\d+\.\s+/gm, "");
  out = out.replace(/\|/g, " ");
  out = out.replace(/^\s*:?-{3,}:?\s*$/gm, " ");

  return out;
}

export interface DocumentInput {
  readonly id: string;
  readonly path: string;
  readonly title: string;
  readonly body: string;
}

export function buildIndex(docs: readonly DocumentInput[]): PassageIndex {
  const index = new Map<string, IndexedDocument>();
  for (const doc of docs) {
    if (index.has(doc.id)) {
      throw new Error(`duplicate document id: ${doc.id}`);
    }
    const display = renderToText(doc.body).replace(/\s+/g, " ").trim();
    index.set(doc.id, {
      id: doc.id,
      path: doc.path,
      title: doc.title,
      text: normalise(display),
      display,
      source: doc.body,
    });
  }
  return index;
}
