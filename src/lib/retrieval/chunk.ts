/**
 * Chunking for retrieval.
 *
 * Chunks are cut on heading boundaries rather than a fixed window, so a chunk is
 * always a complete section with its heading trail attached. Two reasons:
 *
 * 1. A citation must quote text that exists inside one block element, so a chunk
 *    that splits mid-paragraph produces passages the citation gate will reject.
 *    Chunking and citation therefore share the same boundary discipline.
 * 2. A heading trail is free context. "Reconnection that neither loses nor
 *    duplicates work" under "What I built" tells the model where it is without
 *    spending tokens on a summary.
 */

import { normalise } from "../normalise";
import { renderToText } from "../passage-index";

export interface Chunk {
  /** Stable id: `${docId}#${ordinal}`. Used as the citation passage anchor. */
  readonly id: string;
  readonly docId: string
  readonly docTitle: string;
  readonly path: string;
  /** Heading trail, outermost first, e.g. ["What I built", "Reconnection…"]. */
  readonly headings: readonly string[];
  /** Prose as rendered, whitespace-collapsed. What gets embedded. */
  readonly text: string;
  /** Normalised form, for lexical matching. */
  readonly normalised: string;
  readonly tokenEstimate: number;
}

export interface ChunkInput {
  readonly docId: string;
  readonly docTitle: string;
  readonly path: string;
  readonly body: string;
}

/** Rough token estimate. Good enough for budgeting; not a tokeniser. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Minimum chunk size. Below this a chunk carries too little signal to rank
 * meaningfully and pollutes results — a lone heading with one line under it
 * matches many queries weakly and none strongly.
 */
const MIN_CHARS = 120;

/**
 * Maximum chunk size. Sections longer than this are split on paragraph
 * boundaries so no single chunk can dominate the context budget.
 */
const MAX_CHARS = 1400;

export function chunkDocument(input: ChunkInput): Chunk[] {
  const stripped = stripFrontmatter(input.body);
  const sections = splitOnHeadings(stripped);

  const chunks: Chunk[] = [];
  let ordinal = 0;

  for (const section of sections) {
    const text = renderToText(section.body).replace(/\s+/g, " ").trim();
    if (text.length === 0) continue;

    for (const part of splitLong(text)) {
      if (part.length < MIN_CHARS && chunks.length > 0) {
        // Fold an undersized tail into the previous chunk rather than emitting a
        // weak standalone one. It belongs to the same section anyway.
        const prev = chunks[chunks.length - 1];
        if (prev !== undefined && prev.text.length + part.length <= MAX_CHARS) {
          chunks[chunks.length - 1] = rebuild(prev, `${prev.text} ${part}`);
          continue;
        }
      }
      chunks.push({
        id: `${input.docId}#${ordinal++}`,
        docId: input.docId,
        docTitle: input.docTitle,
        path: input.path,
        headings: section.headings,
        text: part,
        normalised: normalise(part),
        tokenEstimate: estimateTokens(part),
      });
    }
  }

  return chunks;
}

function rebuild(chunk: Chunk, text: string): Chunk {
  return {
    ...chunk,
    text,
    normalised: normalise(text),
    tokenEstimate: estimateTokens(text),
  };
}

function stripFrontmatter(body: string): string {
  return body.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

interface Section {
  readonly headings: readonly string[];
  readonly body: string;
}

/** Split on ATX headings, carrying the heading trail down into each section. */
function splitOnHeadings(body: string): Section[] {
  const lines = body.split(/\r?\n/);
  const sections: Section[] = [];
  let trail: string[] = [];
  let buffer: string[] = [];

  const flush = () => {
    if (buffer.join("").trim().length > 0) {
      sections.push({ headings: [...trail], body: buffer.join("\n") });
    }
    buffer = [];
  };

  let inFence = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;

    const heading = inFence ? null : /^(#{2,6})\s+(.*)$/.exec(line);
    if (heading?.[1] !== undefined && heading[2] !== undefined) {
      flush();
      const depth = heading[1].length - 2; // h2 → 0
      trail = [...trail.slice(0, depth), heading[2].trim()];
      continue;
    }
    buffer.push(line);
  }
  flush();

  return sections;
}

/** Split an over-long section on paragraph boundaries. */
function splitLong(text: string): string[] {
  if (text.length <= MAX_CHARS) return [text];

  const sentences = text.split(/(?<=[.?!])\s+/);
  const parts: string[] = [];
  let current = "";

  for (const s of sentences) {
    if (current.length > 0 && current.length + s.length + 1 > MAX_CHARS) {
      parts.push(current);
      current = s;
    } else {
      current = current.length > 0 ? `${current} ${s}` : s;
    }
  }
  if (current.length > 0) parts.push(current);
  return parts;
}
