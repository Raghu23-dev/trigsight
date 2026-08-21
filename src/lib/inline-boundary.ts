/**
 * Detects passages that cross an inline-markup boundary.
 *
 * WHY THIS EXISTS — a real bug caught by end-to-end verification.
 *
 * The verifier originally compared a passage against the document's flattened
 * text, which is what the browser matches *within a single element*. But the
 * spec constrains each part of a text directive to reside wholly inside one
 * block-level element, and in practice a fragment also cannot span an inline
 * element boundary: `**output truncation**` renders as
 * `<strong>output truncation</strong>`, so the sentence containing it is split
 * across three DOM nodes.
 *
 * Flattened text therefore says "present" while the browser fails to match.
 * Measured: 2 of 34 citations were bound by the verifier yet absent from the
 * rendered page as a matchable fragment — precisely the silent failure the whole
 * project exists to prevent.
 *
 * Rejecting these is correct rather than inconvenient: the fix is to quote a span
 * that sits inside one element, which is a better citation anyway.
 */

/** Inline constructs that produce their own DOM element. */
const INLINE_MARKUP = [
  { name: "bold", re: /\*\*([^*]+)\*\*/g },
  { name: "bold-underscore", re: /__([^_]+)__/g },
  { name: "italic", re: /(?<![*\w])\*([^*\n]+)\*(?!\*)/g },
  { name: "italic-underscore", re: /(?<![_\w])_([^_\n]+)_(?!_)/g },
  { name: "inline-code", re: /`([^`]+)`/g },
  { name: "link", re: /\[([^\]]+)\]\([^)]*\)/g },
];

export interface BoundaryIssue {
  readonly kind: string;
  /** The marked-up text that splits the passage. */
  readonly fragment: string;
}

/**
 * Returns the inline constructs that intersect `passage` in `source`.
 *
 * A passage is safe when it either contains no inline markup at all, or lies
 * entirely inside a single inline element (e.g. quoting text that is wholly bold).
 */
export function findBoundaryIssues(source: string, passage: string): BoundaryIssue[] {
  const flatSource = source.replace(/\s+/g, " ");
  const flatPassage = passage.replace(/\s+/g, " ").trim();

  // Locate the passage in the source with markup stripped, so we can map back.
  const stripped = stripInline(flatSource);
  const at = stripped.text.toLowerCase().indexOf(flatPassage.toLowerCase());
  if (at === -1) return []; // not found here; the caller's own check reports that
  const end = at + flatPassage.length;

  const issues: BoundaryIssue[] = [];
  for (const span of stripped.spans) {
    const intersects = span.start < end && span.end > at;
    if (!intersects) continue;
    const contained = span.start <= at && span.end >= end;
    if (contained) continue; // passage sits wholly inside one inline element: fine
    issues.push({ kind: span.kind, fragment: span.inner });
  }
  return issues;
}

interface Span {
  readonly kind: string;
  /** Offsets in the *stripped* text. */
  readonly start: number;
  readonly end: number;
  readonly inner: string;
}

/**
 * Remove inline markers, recording where each inline element's content lands in
 * the resulting text so a passage's offsets can be compared against them.
 */
function stripInline(source: string): { text: string; spans: Span[] } {
  const matches: Array<{ kind: string; index: number; length: number; inner: string }> = [];
  for (const { name, re } of INLINE_MARKUP) {
    re.lastIndex = 0;
    for (const m of source.matchAll(re)) {
      if (m.index === undefined || m[1] === undefined) continue;
      matches.push({ kind: name, index: m.index, length: m[0].length, inner: m[1] });
    }
  }
  matches.sort((a, b) => a.index - b.index);

  let text = "";
  const spans: Span[] = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.index < cursor) continue; // overlapping match already consumed
    text += source.slice(cursor, m.index);
    const start = text.length;
    text += m.inner;
    spans.push({ kind: m.kind, start, end: text.length, inner: m.inner });
    cursor = m.index + m.length;
  }
  text += source.slice(cursor);

  return { text, spans };
}
