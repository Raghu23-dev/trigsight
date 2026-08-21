/**
 * Reciprocal rank fusion.
 *
 * Combines ranked lists by RANK, never by score. This is the whole point: a
 * cosine similarity lands in a narrow high band (roughly 0.6–0.95 for related
 * text) while BM25 scores are unbounded and spread low. Comparing them
 * numerically lets the vector leg win every tie regardless of which signal was
 * actually more relevant.
 *
 * RRF sidesteps that entirely — only position matters, so the legs need no
 * calibration against each other.
 *
 * score(d) = Σ_legs 1 / (k + rank_leg(d))
 *
 * k=60 is the value from Cormack et al. (2009). It damps the influence of top
 * ranks enough that a document appearing at rank 3 in two legs outranks one
 * appearing at rank 1 in a single leg — which is the behaviour we want when the
 * legs disagree.
 */

export const RRF_K = 60;

export interface RankedList {
  readonly leg: string;
  /** Ids in rank order, best first. */
  readonly ids: readonly string[];
}

export interface FusedResult {
  readonly id: string;
  readonly score: number;
  /** Which legs surfaced this, and at what rank. Kept for eval and debugging. */
  readonly provenance: ReadonlyArray<{ leg: string; rank: number }>;
}

export function fuse(lists: readonly RankedList[], k = RRF_K): FusedResult[] {
  const scores = new Map<string, number>();
  const provenance = new Map<string, Array<{ leg: string; rank: number }>>();

  for (const list of lists) {
    list.ids.forEach((id, i) => {
      const rank = i + 1;
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank));
      const p = provenance.get(id) ?? [];
      p.push({ leg: list.leg, rank });
      provenance.set(id, p);
    });
  }

  return [...scores.entries()]
    .map(([id, score]) => ({
      id,
      score,
      provenance: provenance.get(id) ?? [],
    }))
    // Ties broken by id so ordering is deterministic across runs — an eval that
    // reorders randomly on equal scores produces noise that looks like signal.
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
