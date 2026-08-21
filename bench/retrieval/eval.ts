#!/usr/bin/env tsx
/**
 * Retrieval evaluation — criterion 3 of docs/02-thesis.md.
 *
 * Measures recall@k and MRR over a hand-written golden set, and compares
 * configurations so a claim like "hybrid beats lexical" is a measurement rather
 * than an assertion.
 *
 * Reports which backend produced each number. The local trigram backend is a
 * deterministic stand-in, not a semantic model, and a number from it must never be
 * presented as a number from real embeddings.
 *
 * Usage:  tsx bench/retrieval/eval.ts [--k 5] [--json]
 */

import { readFileSync, writeFileSync } from "node:fs";
import { documentFiles } from "../citations/discover.ts";
import { chunkDocument, type Chunk } from "../../src/lib/retrieval/chunk.ts";
import { LocalTrigramBackend, Retriever, type VectorBackend } from "../../src/lib/retrieval/retrieve.ts";

interface Golden {
  readonly queries: ReadonlyArray<{ q: string; docs: readonly string[] }>;
}

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

interface Metrics {
  readonly config: string;
  readonly backend: string;
  readonly queries: number;
  /** Fraction of queries where a relevant doc appeared in the top k. */
  readonly recallAtK: number;
  /** Mean reciprocal rank of the first relevant document. */
  readonly mrr: number;
  /** Queries with no relevant document anywhere in the results. */
  readonly misses: readonly string[];
}

async function evaluate(
  label: string,
  chunks: readonly Chunk[],
  vector: VectorBackend | null,
  golden: Golden,
  k: number,
): Promise<Metrics> {
  const retriever = new Retriever(chunks, vector);
  let hits = 0;
  let rrSum = 0;
  const misses: string[] = [];

  for (const { q, docs } of golden.queries) {
    // Retrieve k chunks; a query is satisfied if any maps to an expected document.
    const results = await retriever.retrieve(q, { limit: k, perLeg: 20, tokenBudget: 100_000 });
    const rank = results.findIndex((r) => docs.includes(r.chunk.docId));
    if (rank >= 0) {
      hits += 1;
      rrSum += 1 / (rank + 1);
    } else {
      misses.push(q);
    }
  }

  const n = golden.queries.length;
  return {
    config: label,
    backend: vector?.name ?? "none (lexical only)",
    queries: n,
    recallAtK: n > 0 ? hits / n : 0,
    mrr: n > 0 ? rrSum / n : 0,
    misses,
  };
}

async function main(): Promise<void> {
  const kArg = process.argv.indexOf("--k");
  const k = kArg >= 0 ? Number(process.argv[kArg + 1] ?? 5) : 5;
  const asJson = process.argv.includes("--json");

  const golden: Golden = JSON.parse(readFileSync("bench/retrieval/golden.json", "utf8"));
  const chunks = loadChunks();

  const runs: Metrics[] = [];
  // Multiple configurations, so "hybrid is better" is a comparison not a claim.
  runs.push(await evaluate("lexical only", chunks, null, golden, k));
  runs.push(await evaluate("hybrid (local trigram)", chunks, new LocalTrigramBackend(chunks), golden, k));

  if (asJson) {
    const payload = { k, chunks: chunks.length, runs, measuredAt: new Date().toISOString().slice(0, 10) };
    writeFileSync("bench/retrieval/results/latest.json", `${JSON.stringify(payload, null, 2)}\n`);
  }

  console.log(`corpus: ${chunks.length} chunks from ${documentFiles("content").length} documents`);
  console.log(`k = ${k}, queries = ${golden.queries.length}\n`);
  console.log("config                    backend               recall@k    MRR");
  for (const r of runs) {
    console.log(
      `${r.config.padEnd(25)} ${r.backend.padEnd(21)} ${r.recallAtK.toFixed(3).padStart(7)}  ${r.mrr.toFixed(3).padStart(6)}`,
    );
  }

  const best = runs.reduce((a, b) => (b.recallAtK > a.recallAtK ? b : a));
  if (best.misses.length > 0) {
    console.log(`\nmissed by the best config (${best.config}):`);
    for (const m of best.misses) console.log(`  ${m}`);
  }

  console.log(
    "\nNOTE: the local trigram backend is a deterministic stand-in for testing the",
  );
  console.log(
    "fusion and budgeting logic offline. It is NOT a semantic embedding model, and",
  );
  console.log("its numbers must not be reported as embedding-model performance.");

  const THRESHOLD = 0.85;
  if (best.recallAtK < THRESHOLD) {
    console.error(
      `\nBELOW THRESHOLD — recall@${k} is ${best.recallAtK.toFixed(3)}, criterion 3 requires >= ${THRESHOLD}`,
    );
    process.exit(1);
  }
  console.log(`\nrecall@${k} = ${best.recallAtK.toFixed(3)} — meets the >= ${THRESHOLD} threshold`);
}

await main();
