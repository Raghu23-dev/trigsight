/**
 * The gate.
 *
 * A citation binds a claim to a passage in a document. This module decides
 * whether that binding holds. If any citation fails, the build fails — an
 * unverifiable claim is never shippable.
 *
 * This is success criteria 1 and 2 from docs/02-thesis.md.
 */

import { buildFragment, findOccurrences, normalise } from "./normalise.js";
import type { PassageIndex } from "./passage-index.js";

export interface Citation {
  /** Where this citation was authored, for error messages. */
  readonly source: string;
  /** Document id being cited, e.g. "work/experience-studio". */
  readonly docId: string;
  /** The passage claimed to appear in that document. */
  readonly passage: string;
  /** Which occurrence is intended, when the passage repeats. Defaults to first. */
  readonly occurrence?: number;
}

export type FailureReason =
  | "unknown-document"
  | "passage-not-found"
  | "passage-too-short"
  | "passage-too-long";

export interface Bound {
  readonly ok: true;
  readonly citation: Citation;
  /** Absolute-path URL including the fragment directive. */
  readonly href: string;
  /** The passage as it appears in the document, for display. */
  readonly quote: string;
  /** True when the passage repeats and a prefix was needed to disambiguate. */
  readonly ambiguous: boolean;
}

export interface Unbound {
  readonly ok: false;
  readonly citation: Citation;
  readonly reason: FailureReason;
  readonly detail: string;
}

export type Result = Bound | Unbound;

/**
 * Below this, a passage is too generic to identify a sentence — "the system"
 * would match in a dozen places and the disambiguation prefix would be doing all
 * the work. Chosen deliberately rather than as a round number: shorter passages
 * were observed to be almost always accidental (a stray word rather than a quote).
 */
export const MIN_PASSAGE_CHARS = 24;

/**
 * Above this, fragments become unwieldy in a URL and far more fragile — any
 * edit anywhere in a long passage orphans the citation. Long quotes should be
 * split into several citations instead.
 */
export const MAX_PASSAGE_CHARS = 300;

export function verifyCitation(index: PassageIndex, citation: Citation): Result {
  const doc = index.get(citation.docId);
  if (!doc) {
    return {
      ok: false,
      citation,
      reason: "unknown-document",
      detail: `no document with id "${citation.docId}". known ids: ${[...index.keys()].sort().join(", ") || "(none)"}`,
    };
  }

  const needle = normalise(citation.passage);

  if (needle.length < MIN_PASSAGE_CHARS) {
    return {
      ok: false,
      citation,
      reason: "passage-too-short",
      detail: `passage is ${needle.length} chars, minimum is ${MIN_PASSAGE_CHARS}. Short passages match ambiguously and cite nothing useful.`,
    };
  }

  if (needle.length > MAX_PASSAGE_CHARS) {
    return {
      ok: false,
      citation,
      reason: "passage-too-long",
      detail: `passage is ${needle.length} chars, maximum is ${MAX_PASSAGE_CHARS}. Split it into several citations; long fragments break on any edit.`,
    };
  }

  const hits = findOccurrences(doc.text, needle);
  if (hits.length === 0) {
    return {
      ok: false,
      citation,
      reason: "passage-not-found",
      detail: `passage does not appear in "${doc.path}". This means the claim is unverifiable — either the passage was paraphrased rather than quoted, or the document changed and the citation is now stale.`,
    };
  }

  const { directive, ambiguous } = buildFragment(doc.text, needle, citation.occurrence ?? 0);

  // Quote the passage as it renders (original case) rather than normalised.
  const firstHit = hits[0];
  if (firstHit === undefined) {
    throw new Error("unreachable: hits verified non-empty above");
  }
  const start = hits[citation.occurrence ?? 0]?.index ?? firstHit.index;
  const quote = doc.display.slice(start, start + needle.length);

  return {
    ok: true,
    citation,
    href: `${doc.path}#${directive}`,
    quote,
    ambiguous,
  };
}

export interface VerificationReport {
  readonly total: number;
  readonly bound: readonly Bound[];
  readonly unbound: readonly Unbound[];
  readonly ambiguous: readonly Bound[];
  /** True when every citation bound — the condition for the build to proceed. */
  readonly passed: boolean;
}

export function verifyAll(
  index: PassageIndex,
  citations: readonly Citation[],
): VerificationReport {
  const bound: Bound[] = [];
  const unbound: Unbound[] = [];

  for (const c of citations) {
    const r = verifyCitation(index, c);
    if (r.ok) bound.push(r);
    else unbound.push(r);
  }

  return {
    total: citations.length,
    bound,
    unbound,
    ambiguous: bound.filter((b) => b.ambiguous),
    passed: unbound.length === 0,
  };
}

/** Human-readable report. Written to stdout by the build gate. */
export function formatReport(report: VerificationReport): string {
  const lines: string[] = [];
  lines.push(`citations: ${report.total}  bound: ${report.bound.length}  unbound: ${report.unbound.length}`);

  if (report.ambiguous.length > 0) {
    lines.push("");
    lines.push(`${report.ambiguous.length} passage(s) repeat and were disambiguated with a prefix:`);
    for (const a of report.ambiguous) {
      lines.push(`  ${a.citation.docId}  ${JSON.stringify(a.citation.passage.slice(0, 60))}`);
    }
  }

  if (report.unbound.length > 0) {
    lines.push("");
    lines.push(`FAILED — ${report.unbound.length} citation(s) could not be bound:`);
    for (const u of report.unbound) {
      lines.push("");
      lines.push(`  ${u.citation.source}`);
      lines.push(`    doc:     ${u.citation.docId}`);
      lines.push(`    passage: ${JSON.stringify(u.citation.passage.slice(0, 100))}`);
      lines.push(`    reason:  ${u.reason}`);
      lines.push(`    ${u.detail}`);
    }
  }

  return lines.join("\n");
}
