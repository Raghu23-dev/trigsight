/**
 * BM25 over the chunk set.
 *
 * Implemented rather than imported for one reason that matters: the corpus is
 * ~25 documents and lives in the repo, so a lexical index is a few kilobytes of
 * JSON built at compile time. Adding a search service for that would be
 * infrastructure with no measurable benefit.
 *
 * BM25 exists alongside vector search because they fail differently. Vector
 * search misses exact identifiers — ask for "RRF" and a semantic index returns
 * paraphrases about fusion. BM25 misses paraphrase — ask "how do you stop it
 * losing work on reconnect" and lexical matching finds nothing unless those exact
 * words appear. Fusing them covers both.
 */

const K1 = 1.2; // term-frequency saturation
const B = 0.75; // length normalisation

/**
 * Stop words. Kept deliberately short: an aggressive list removes terms that
 * carry real signal in technical prose ("state", "over", "between" all matter
 * here), and BM25's IDF already discounts common terms.
 */
const STOP = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "if", "in",
  "into", "is", "it", "of", "on", "or", "that", "the", "then", "there", "to",
  "was", "were", "will", "with",
]);

export function tokenise(text: string): string[] {
  return (
    text
      .toLowerCase()
      // Keep intra-word hyphens and underscores: "human-in-the-loop" and
      // "snake_case_name" are single terms in this domain, and splitting them
      // destroys the exact-match advantage BM25 is here to provide.
      .match(/[a-z0-9][a-z0-9_-]*/g) ?? []
  ).filter((t) => t.length > 1 && !STOP.has(t));
}

export interface Bm25Doc {
  readonly id: string;
  readonly text: string;
}

export interface Bm25Index {
  readonly docCount: number;
  readonly avgLength: number;
  /** term → docId → term frequency */
  readonly postings: ReadonlyMap<string, ReadonlyMap<string, number>>;
  readonly lengths: ReadonlyMap<string, number>;
}

export function buildBm25(docs: readonly Bm25Doc[]): Bm25Index {
  const postings = new Map<string, Map<string, number>>();
  const lengths = new Map<string, number>();
  let total = 0;

  for (const doc of docs) {
    const terms = tokenise(doc.text);
    lengths.set(doc.id, terms.length);
    total += terms.length;

    const counts = new Map<string, number>();
    for (const t of terms) counts.set(t, (counts.get(t) ?? 0) + 1);

    for (const [term, tf] of counts) {
      let p = postings.get(term);
      if (p === undefined) {
        p = new Map();
        postings.set(term, p);
      }
      p.set(doc.id, tf);
    }
  }

  return {
    docCount: docs.length,
    avgLength: docs.length > 0 ? total / docs.length : 0,
    postings,
    lengths,
  };
}

export interface Scored {
  readonly id: string;
  readonly score: number;
}

export function searchBm25(index: Bm25Index, query: string, limit = 20): Scored[] {
  const terms = tokenise(query);
  const scores = new Map<string, number>();

  for (const term of terms) {
    const posting = index.postings.get(term);
    if (posting === undefined) continue;

    // Robertson/Sparck-Jones IDF with the +0.5 smoothing that keeps the value
    // positive for terms appearing in more than half the corpus. On a 25-document
    // corpus that case is common, and the unsmoothed form would go negative and
    // penalise documents for containing a query term.
    const df = posting.size;
    const idf = Math.log(1 + (index.docCount - df + 0.5) / (df + 0.5));

    for (const [id, tf] of posting) {
      const len = index.lengths.get(id) ?? 0;
      const norm = index.avgLength > 0 ? len / index.avgLength : 1;
      const score = idf * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + B * norm)));
      scores.set(id, (scores.get(id) ?? 0) + score);
    }
  }

  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit);
}
