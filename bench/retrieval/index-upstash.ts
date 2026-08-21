#!/usr/bin/env tsx
/**
 * Index the corpus into Upstash Vector.
 *
 * Resets first so a re-run is idempotent rather than accumulating stale chunk ids from
 * edited content — a stale id would surface in retrieval and hydrate to nothing.
 *
 * Usage:  tsx bench/retrieval/index-upstash.ts
 */

import { readFileSync } from "node:fs";
import { documentFiles } from "../citations/discover.ts";
import { chunkDocument, type Chunk } from "../../src/lib/retrieval/chunk.ts";
import { upstashFromEnv } from "../../src/lib/retrieval/upstash.ts";

function loadChunks(): Chunk[] {
  const out: Chunk[] = [];
  for (const file of documentFiles("content")) {
    const body = readFileSync(file, "utf8");
    const id = file.replace(/^content\//, "").replace(/\.mdx?$/, "");
    const title = /^title:\s*(.+)$/m.exec(body)?.[1]?.trim() ?? id;
    out.push(...chunkDocument({ docId: id, docTitle: title, path: `/${id}`, body }));
  }
  return out;
}

const backend = upstashFromEnv();
if (backend === null) {
  console.error("UPSTASH_VECTOR_REST_URL / _TOKEN not set. Run: vercel env pull .env.local");
  process.exit(1);
}

const chunks = loadChunks();
console.log(`chunks: ${chunks.length}`);

const before = await backend.info();
console.log(`index before: ${before.vectorCount} vectors, ${before.dimension} dims`);

console.log("resetting…");
await backend.reset();

console.log("indexing…");
const written = await backend.index(chunks);

// The index is eventually consistent, so a count read immediately after a write can
// legitimately lag. Poll briefly rather than reporting a wrong number.
let after = await backend.info();
for (let i = 0; i < 20 && after.vectorCount < written; i++) {
  await new Promise((r) => setTimeout(r, 500));
  after = await backend.info();
}

console.log(`wrote ${written}, index now reports ${after.vectorCount}`);
if (after.vectorCount !== written) {
  console.error(`MISMATCH: expected ${written}, got ${after.vectorCount}`);
  process.exit(1);
}
console.log("OK");
