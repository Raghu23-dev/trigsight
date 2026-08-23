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

/**
 * Suffixes stripped so a query and a document can agree about the same word.
 *
 * WHY THIS EXISTS. One golden query missed at recall 0.976: "what happens when two compactions run
 * at once". The document answering it says "compaction" and "concurrent attempts". BM25 found
 * nothing, because the single most distinctive term in the query — `compactions` — differs from the
 * document's `compaction` by one letter, and the answer landed at rank 6 on the vector leg alone,
 * one place below the cutoff.
 *
 * DELIBERATELY NOT A PORTER STEMMER, and not `es` on short words. A full stemmer conflates terms
 * this corpus needs to keep apart, and aggressive stripping is worse than none in technical prose:
 * `axes` must not become `ax`, `cache` must not become `cach`. The length guard (a stem of at least
 * four characters) is what keeps identifiers intact.
 *
 * CHOSEN OVER SYNONYM EXPANSION BY MEASUREMENT, not preference. Both reached recall 1.000 on the
 * golden set, so the golden set could not distinguish them. Eight held-out queries written
 * afterwards and never used for tuning could: stemming took 6/8 to 7/8, while a synonym list only
 * helps queries whose vocabulary was anticipated — which is tuning to the test with extra steps.
 * See bench/retrieval/results/2026-08-23-stemming.md.
 */
// SHORTEST SUFFIX FIRST, and the order is load-bearing.
//
// Longest-first over-strips: `reservations` matched `ations` and became `reserv`, while the document
// says `reservation` and stems to `reservation` — so a rule meant to MERGE the two split them
// instead. Caught by a test asserting the stem, not by recall, because recall had already reached
// 1.000 and could not see it.
//
// Shortest-first turns `reservations` into `reservation` (strip `s`) and `compactions` into
// `compaction`, which is exactly the pairing that motivated stemming. Nominalisations are therefore
// NOT reduced to their verb: `reservation` never becomes `reserve`. That is the conservative choice
// — merging a noun with its verb is a bigger claim about meaning than merging a plural with its
// singular, and this corpus does not need it.
// PLURALS ONLY. Every other rule I tried was measured and then removed.
//
// `-ation` broke idempotence in the worst possible direction: `reservations` → `reservation` (strip
// `s`) while `reservation` → `reserv` (strip `ation`), so the plural and singular stemmed to
// DIFFERENT terms. A rule added to merge them drove them apart — the exact failure it was written to
// prevent, and invisible to recall, which had already reached 1.000.
//
// `-ing` was measured and earned nothing: golden 42/42 and held-out 7/8 with it and without it,
// identical. It cost idempotence on five domain nouns that merely end in -ing — `ceiling` → `ceil`,
// `embedding` → `embedd`, `heading` → `head`. Paying with correctness for no measured gain is the
// worst trade available, so it is gone. See bench/retrieval/exp/ing.ts.
//
// What remains is the smallest rule that fixes the miss which motivated any of this: `compactions`
// vs `compaction`. Merging a noun with its verb is a far bigger claim about meaning, and this corpus
// asks for none of it.
const SUFFIXES = ["s", "es"] as const;

/** Minimum surviving stem length. Below this, stripping destroys more than it merges. */
const MIN_STEM = 4;

export function stem(token: string): string {
  // A word ending in `ss` is not a plural. `across` → `acros`, `access` → `acces`, `useless` →
  // `useles`: eighteen corpus terms were being mangled this way. Harmless for matching, since query
  // and document are mangled identically, but it made `stem` non-idempotent — and a function whose
  // output is not a fixed point cannot be reasoned about, or safely applied to an already-stemmed
  // index. Found by stemming the entire corpus vocabulary and re-stemming the result.
  if (token.endsWith("ss")) return token;

  // `-ies` first, before any shorter rule can reach it.
  //
  // Shortest-first ordering fixed over-stripping but created its own bug: `policies` matched the
  // `s` rule and became `policie`, which is a word in no language and therefore matches nothing.
  // `-ies → y` has to be checked ahead of `s` and `es` because it REWRITES rather than truncates,
  // so no shorter rule can produce the same answer.
  if (token.length - 3 >= MIN_STEM && token.endsWith("ies")) {
    return `${token.slice(0, -3)}y`;
  }
  for (const suffix of SUFFIXES) {
    if (token.length - suffix.length >= MIN_STEM && token.endsWith(suffix)) {
      return token.slice(0, -suffix.length);
    }
  }
  return token;
}

export function tokenise(text: string): string[] {
  return (
    text
      .toLowerCase()
      // Keep intra-word hyphens and underscores: "human-in-the-loop" and
      // "snake_case_name" are single terms in this domain, and splitting them
      // destroys the exact-match advantage BM25 is here to provide.
      .match(/[a-z0-9][a-z0-9_-]*/g) ?? []
  )
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map(stem);
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
