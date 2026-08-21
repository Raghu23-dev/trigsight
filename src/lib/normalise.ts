/**
 * Text normalisation for scroll-to-text-fragment citation binding.
 *
 * WHY THIS FILE EXISTS, AND WHY IT IS SHARED
 *
 * A browser resolving `#:~:text=...` matches against the *rendered* text of the
 * document, not its source. It collapses whitespace, and matching is
 * case-insensitive per the spec.
 *
 * Measured consequence (bench/baseline/probe-text-fragment-matching.mjs, 7 cases):
 * a verifier comparing against raw MDX source fails 3 of 7 passages that
 * browsers match correctly — passages crossing a newline, passages where the
 * source has consecutive spaces, and passages differing only in case.
 *
 * A verifier producing false failures is worse than no verifier, because it
 * trains you to disable the gate — which defeats the entire thesis. So the
 * verifier, the passage index and the runtime resolver all import this one
 * function. They agree by construction rather than by discipline.
 *
 * Spec: https://wicg.github.io/scroll-to-text-fragment/
 */

/** Zero-width and BOM characters that survive MDX authoring and copy-paste. */
const INVISIBLE = /[​-‍﻿⁠]/g;

/**
 * Normalise text the way a browser does before matching a text fragment.
 *
 * - strips invisible characters (they break matching but are unseeable in review)
 * - collapses every whitespace run (incl. newlines, tabs, NBSP) to one space
 * - trims
 * - casefolds
 *
 * Punctuation is deliberately preserved: smart quotes and em dashes match fine
 * (verified in the probe) and rewriting them would silently change meaning.
 */
export function normalise(text: string): string {
  return text
    .replace(INVISIBLE, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Percent-encode a passage for use in a text fragment directive.
 *
 * The spec requires `-` to be encoded, because a bare `-` is significant in the
 * `prefix-,textStart,textEnd,-suffix` grammar. `encodeURIComponent` leaves `-`
 * alone, so it must be handled explicitly — an easy and silent mistake.
 *
 * `,` is also encoded: it separates grammar components, so an unencoded comma in
 * a passage would be parsed as a boundary and truncate the match.
 */
export function encodePassage(passage: string): string {
  return encodeURIComponent(passage.replace(/\s+/g, " ").trim())
    .replace(/-/g, "%2D")
    .replace(/,/g, "%2C");
}

export type Occurrence = { readonly index: number };

/** Every occurrence of `needle` in `haystack`, both already normalised. */
export function findOccurrences(haystack: string, needle: string): Occurrence[] {
  if (needle.length === 0) return [];
  const found: Occurrence[] = [];
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) break;
    found.push({ index: at });
    from = at + 1; // +1 not +needle.length: overlapping occurrences still collide
  }
  return found;
}

/**
 * Build a fragment directive for a passage, disambiguating when necessary.
 *
 * The spec warns that when a passage appears more than once the browser scrolls
 * to the *first* match — which for a citation is a silent correctness bug: the
 * reader is shown a different sentence than the one supporting the claim.
 *
 * Rather than reject an ambiguous passage (losing the citation), we emit the
 * `prefix-,textStart` form using surrounding context to pin the intended
 * occurrence.
 *
 * `context` must be the normalised full document text.
 */
export function buildFragment(
  context: string,
  passage: string,
  occurrenceIndex = 0,
): { directive: string; ambiguous: boolean } {
  const needle = normalise(passage);
  const hits = findOccurrences(context, needle);

  if (hits.length === 0) {
    throw new Error(`passage not found in document: ${JSON.stringify(passage.slice(0, 80))}`);
  }

  if (hits.length === 1) {
    return { directive: `:~:text=${encodePassage(needle)}`, ambiguous: false };
  }

  // Ambiguous: pin it with the words immediately before the intended occurrence.
  // hits is non-empty here (the zero case returned above), so hits[0] is defined —
  // but the compiler cannot know that, and asserting it would defeat the check.
  const first = hits[0];
  if (first === undefined) {
    throw new Error("unreachable: hits verified non-empty above");
  }
  const target = hits[occurrenceIndex] ?? first;
  const before = context.slice(0, target.index).trimEnd();
  const prefixWords = before.split(" ").slice(-PREFIX_WORDS).join(" ");

  if (prefixWords.length === 0) {
    // Occurrence is at the start of the document; no prefix available.
    return { directive: `:~:text=${encodePassage(needle)}`, ambiguous: true };
  }

  return {
    directive: `:~:text=${encodePassage(prefixWords)}-,${encodePassage(needle)}`,
    ambiguous: true,
  };
}

/** Words of preceding context used to disambiguate a repeated passage. */
const PREFIX_WORDS = 4;
