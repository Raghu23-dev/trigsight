/**
 * Upstash Vector backend.
 *
 * Implements the same `VectorBackend` interface as the local trigram stand-in, so
 * swapping between them changes one constructor call and nothing else. That was the
 * point of putting the vector leg behind an interface before there was a real one to
 * put there.
 *
 * The index is configured with a server-side embedding model, so text is sent and
 * Upstash produces the vector. That removes a separate embedding call from the request
 * path and keeps everything inside one free tier — at the cost of coupling the index to
 * one model, which is recorded in docs/DECISIONS.md rather than discovered later.
 */

import type { Chunk } from "./chunk";
import type { VectorBackend } from "./retrieve";

interface UpstashQueryResult {
  readonly id: string;
  readonly score: number;
}

interface UpstashResponse<T> {
  readonly result?: T;
  readonly error?: string;
}

export interface UpstashConfig {
  readonly url: string;
  readonly token: string;
  /** Namespace, so a future project can share the free tier's single index. */
  readonly namespace?: string;
}

export class UpstashBackend implements VectorBackend {
  readonly name = "upstash-vector";

  constructor(private readonly config: UpstashConfig) {}

  private get base(): string {
    const ns = this.config.namespace;
    return ns !== undefined && ns.length > 0
      ? `${this.config.url.replace(/\/$/, "")}`
      : this.config.url.replace(/\/$/, "");
  }

  private async call<T>(path: string, body: unknown): Promise<T> {
    const ns = this.config.namespace;
    const suffix = ns !== undefined && ns.length > 0 ? `/${encodeURIComponent(ns)}` : "";
    const response = await fetch(`${this.base}${path}${suffix}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`upstash ${path} failed: ${response.status} ${await response.text()}`);
    }

    const parsed = (await response.json()) as UpstashResponse<T>;
    if (parsed.error !== undefined) {
      throw new Error(`upstash ${path}: ${parsed.error}`);
    }
    if (parsed.result === undefined) {
      throw new Error(`upstash ${path}: response had no result`);
    }
    return parsed.result;
  }

  /**
   * Upsert chunks. Text is sent, not vectors — the index embeds server-side.
   *
   * Batched because a single request per chunk would be one round trip each. 25 is well
   * under any documented payload limit and keeps a failure's blast radius small enough
   * to retry cheaply.
   */
  async index(chunks: readonly Chunk[], batchSize = 25): Promise<number> {
    let written = 0;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize).map((c) => ({
        id: c.id,
        data: c.text,
        // Metadata is stored but never used for ranking. It exists so a result can be
        // traced back to its document without a second lookup.
        metadata: {
          docId: c.docId,
          docTitle: c.docTitle,
          path: c.path,
          headings: c.headings.join(" › "),
        },
      }));
      await this.call<{ upsertedCount?: number } | string>("/upsert-data", batch);
      written += batch.length;
    }
    return written;
  }

  async search(query: string, limit: number): Promise<string[]> {
    const results = await this.call<UpstashQueryResult[]>("/query-data", {
      data: query,
      topK: limit,
      includeMetadata: false,
      includeData: false,
    });
    // Upstash returns descending by score. The retriever fuses by RANK, so the scores
    // themselves are deliberately discarded — see fuse.ts for why comparing a cosine
    // score against a BM25 score is a mistake.
    return results.map((r) => r.id);
  }

  async reset(): Promise<void> {
    const ns = this.config.namespace;
    const suffix = ns !== undefined && ns.length > 0 ? `/${encodeURIComponent(ns)}` : "";
    const response = await fetch(`${this.base}/reset${suffix}`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.config.token}` },
    });
    if (!response.ok) {
      throw new Error(`upstash reset failed: ${response.status}`);
    }
  }

  async info(): Promise<{ vectorCount: number; dimension: number }> {
    const response = await fetch(`${this.base}/info`, {
      headers: { authorization: `Bearer ${this.config.token}` },
    });
    if (!response.ok) {
      throw new Error(`upstash info failed: ${response.status}`);
    }
    const parsed = (await response.json()) as UpstashResponse<{
      vectorCount: number;
      dimension: number;
    }>;
    if (parsed.result === undefined) {
      throw new Error("upstash info: no result");
    }
    return parsed.result;
  }
}

/**
 * Build a backend from the environment, or return null when unconfigured.
 *
 * Returns null rather than throwing so the site runs with lexical-only retrieval when
 * credentials are absent — a contributor cloning the repo should not need a vector store
 * to see it work, and CI should not need secrets to run the eval.
 */
export function upstashFromEnv(namespace?: string): UpstashBackend | null {
  const url = process.env.UPSTASH_VECTOR_REST_URL;
  const token = process.env.UPSTASH_VECTOR_REST_TOKEN;
  if (url === undefined || token === undefined || url.length === 0 || token.length === 0) {
    return null;
  }
  return new UpstashBackend({
    url,
    token,
    ...(namespace !== undefined ? { namespace } : {}),
  });
}
