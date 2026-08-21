/**
 * Citation tokens.
 *
 * The model emits `[[cite:docId|passage]]` and NEVER a URL. The resolver looks the
 * pair up in the build-time allowlist, which contains only citations already
 * verified to exist in their source document. An unknown token is dropped.
 *
 * This is what makes the guarantee structural rather than behavioural: the model
 * has no mechanism for producing a link, so it cannot produce a wrong one. Prompt
 * instructions are a request; an absent capability is an invariant.
 */

export const TOKEN_RE = /\[\[cite:([^|\]]+)\|([^\]]+)\]\]/g;

export interface ResolvedCitation {
  readonly docId: string;
  readonly passage: string;
  readonly href: string;
  readonly quote: string;
}

export type Allowlist = Record<string, { href: string; quote: string; ambiguous: boolean }>;

export function resolveToken(
  allowlist: Allowlist,
  docId: string,
  passage: string,
): ResolvedCitation | null {
  const entry = allowlist[`${docId}::${passage.trim()}`];
  if (entry === undefined) return null;
  return { docId, passage: passage.trim(), href: entry.href, quote: entry.quote };
}

export interface Segment {
  readonly type: "text" | "citation";
  readonly text: string;
  readonly citation?: ResolvedCitation;
}

/**
 * Split streamed model output into text and resolved-citation segments.
 *
 * Unresolvable tokens are removed entirely rather than rendered as literal
 * `[[cite:...]]` noise — a reader should never see the mechanism, and a dropped
 * citation degrades to plain prose that is still true.
 */
export function segment(text: string, allowlist: Allowlist): Segment[] {
  const out: Segment[] = [];
  let last = 0;

  for (const m of text.matchAll(TOKEN_RE)) {
    if (m.index === undefined || m[1] === undefined || m[2] === undefined) continue;
    if (m.index > last) out.push({ type: "text", text: text.slice(last, m.index) });

    const resolved = resolveToken(allowlist, m[1], m[2]);
    if (resolved !== null) {
      out.push({ type: "citation", text: resolved.quote, citation: resolved });
    }
    last = m.index + m[0].length;
  }

  if (last < text.length) out.push({ type: "text", text: text.slice(last) });
  return out;
}

/** Citations the model attempted but could not resolve. Surfaced for measurement. */
export function unresolvedTokens(text: string, allowlist: Allowlist): string[] {
  const bad: string[] = [];
  for (const m of text.matchAll(TOKEN_RE)) {
    if (m[1] === undefined || m[2] === undefined) continue;
    if (resolveToken(allowlist, m[1], m[2]) === null) bad.push(`${m[1]}::${m[2]}`);
  }
  return bad;
}
