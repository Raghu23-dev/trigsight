/**
 * Hybrid retrieval: lexical + semantic, fused by rank.
 *
 * The vector leg is behind an interface so retrieval is testable without network
 * access or credentials. A local deterministic embedder runs in tests and in CI;
 * the hosted store is swapped in for production. Same fusion code either way, so
 * what CI verifies is what production runs.
 */

import type { Chunk } from "./chunk";
import { buildBm25, searchBm25, type Bm25Index } from "./bm25";
import { fuse, type FusedResult } from "./fuse";
import { normalise } from "../normalise";

export interface VectorBackend {
  readonly name: string;
  /** Ranked chunk ids, best first. */
  search(query: string, limit: number): Promise<string[]>;
}

export interface Retrieved {
  readonly chunk: Chunk;
  readonly score: number;
  readonly provenance: ReadonlyArray<{ leg: string; rank: number }>;
}

export interface RetrieverOptions {
  /** Candidates pulled from each leg before fusion. */
  readonly perLeg?: number;
  /** Results returned after fusion. */
  readonly limit?: number;
  /** Token ceiling for the assembled context. */
  readonly tokenBudget?: number;
}

const DEFAULTS = { perLeg: 12, limit: 6, tokenBudget: 3000 } as const;

export class Retriever {
  private readonly byId: Map<string, Chunk>;
  private readonly lexical: Bm25Index;

  constructor(
    private readonly chunks: readonly Chunk[],
    private readonly vector: VectorBackend | null,
  ) {
    this.byId = new Map(chunks.map((c) => [c.id, c]));
    // `searchText`, not `text`: the product name and title are not in the prose, so indexing
    // `text` alone made "what is fusegrid" unanswerable about this site's own flagship.
    this.lexical = buildBm25(chunks.map((c) => ({ id: c.id, text: c.searchText })));
  }

  async retrieve(query: string, options: RetrieverOptions = {}): Promise<Retrieved[]> {
    const perLeg = options.perLeg ?? DEFAULTS.perLeg;
    const limit = options.limit ?? DEFAULTS.limit;
    const budget = options.tokenBudget ?? DEFAULTS.tokenBudget;

    const lists = [
      { leg: "bm25", ids: searchBm25(this.lexical, query, perLeg).map((s) => s.id) },
    ];

    if (this.vector !== null) {
      // A vector-store failure must degrade to lexical-only rather than failing
      // the request. Retrieval returning fewer good results beats returning none.
      try {
        lists.push({ leg: this.vector.name, ids: await this.vector.search(query, perLeg) });
      } catch {
        // Intentionally swallowed; the lexical leg still answers.
      }
    }

    const fused: FusedResult[] = fuse(lists);

    const out: Retrieved[] = [];
    let tokens = 0;
    for (const f of fused) {
      const chunk = this.byId.get(f.id);
      if (chunk === undefined) continue; // stale id from the vector store
      if (out.length >= limit) break;
      if (tokens + chunk.tokenEstimate > budget && out.length > 0) continue;
      tokens += chunk.tokenEstimate;
      out.push({ chunk, score: f.score, provenance: f.provenance });
    }
    return out;
  }

  get size(): number {
    return this.chunks.length;
  }
}

/**
 * Deterministic local embedder for tests, CI, and offline development.
 *
 * Hashed character trigrams into a fixed-width vector, cosine-compared. This is
 * NOT a semantic model and makes no claim to be — it exists so the fusion and
 * budgeting logic can be tested deterministically without a network call. The
 * eval harness reports which backend produced a result precisely so a number from
 * this backend is never mistaken for a number from a real embedding model.
 */
export class LocalTrigramBackend implements VectorBackend {
  readonly name = "local-trigram";
  private readonly vectors: Map<string, Float32Array>;

  constructor(
    chunks: readonly Chunk[],
    private readonly dims = 512,
  ) {
    // Normalised `searchText`, so this leg sees the product name too. Embedding `normalised`
    // alone left both legs blind to the same thing, which is how a name absent from the prose
    // was absent from every result.
    this.vectors = new Map(chunks.map((c) => [c.id, this.embed(normalise(c.searchText))]));
  }

  private embed(text: string): Float32Array {
    const v = new Float32Array(this.dims);
    const s = ` ${text} `;
    for (let i = 0; i + 3 <= s.length; i++) {
      const gram = s.slice(i, i + 3);
      let h = 2166136261;
      for (let j = 0; j < gram.length; j++) {
        h ^= gram.charCodeAt(j);
        h = Math.imul(h, 16777619);
      }
      const slot = Math.abs(h) % this.dims;
      v[slot] = (v[slot] ?? 0) + 1;
    }
    let norm = 0;
    for (const x of v) norm += x * x;
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < v.length; i++) v[i] = (v[i] ?? 0) / norm;
    return v;
  }

  search(query: string, limit: number): Promise<string[]> {
    const q = this.embed(query.toLowerCase());
    const scored: Array<{ id: string; score: number }> = [];
    for (const [id, v] of this.vectors) {
      let dot = 0;
      for (let i = 0; i < v.length; i++) dot += (q[i] ?? 0) * (v[i] ?? 0);
      scored.push({ id, score: dot });
    }
    scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    return Promise.resolve(scored.slice(0, limit).map((s) => s.id));
  }
}
