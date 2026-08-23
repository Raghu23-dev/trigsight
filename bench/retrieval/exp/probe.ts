// Measure three candidates against the full golden set, changing nothing in src/.
// A fix chosen without measuring the alternatives is a guess with a commit message.
import { readFileSync } from "node:fs";
import { projects, work } from "../../../src/lib/content";
import { chunkDocument, type Chunk } from "../../../src/lib/retrieval/chunk";
import { LocalTrigramBackend } from "../../../src/lib/retrieval/retrieve";
import { buildBm25, searchBm25, stem } from "../../../src/lib/retrieval/bm25";

// LOCAL, UNSTEMMED tokeniser — deliberately not the shipped one.
//
// This probe imported `tokenise` from src. Once stemming shipped there, the "baseline" row was
// measuring the fix, and the 6/8 vs 7/8 comparison silently became 7/8 vs 7/8: a benchmark that
// invalidates itself the moment its recommendation is adopted, while still printing two rows as
// though they differed.
const STOP = new Set(["a","an","and","are","as","at","be","but","by","for","if","in","into","is",
  "it","of","on","or","that","the","then","there","to","was","were","will","with"]);
function tokenise(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9][a-z0-9_-]*/g) ?? [])
    .filter((t) => t.length > 1 && !STOP.has(t));
}
import { fuse } from "../../../src/lib/retrieval/fuse";

const golden = JSON.parse(readFileSync("bench/retrieval/golden.json", "utf8")) as {
  queries: { q: string; docs: string[] }[];
};

const chunks: Chunk[] = [...projects, ...work].flatMap((d) =>
  chunkDocument({ docId: d.id, docTitle: d.title, path: d.path, body: d.raw }),
);

/** Crude suffix stripping. Deliberately not a Porter stemmer: see the writeup. */

const SYNONYMS: Record<string, string[]> = {
  once: ["concurrent", "concurrently", "simultaneous"],
  simultaneously: ["concurrent"],
  same: ["concurrent"],
  time: ["concurrent"],
};

function expand(q: string): string {
  const extra = tokenise(q).flatMap((t) => SYNONYMS[t] ?? []);
  return extra.length ? `${q} ${extra.join(" ")}` : q;
}

async function score(label: string, transform: (s: string) => string, stemmed: boolean) {
  const idxDocs = chunks.map((c) => ({
    id: c.id,
    text: stemmed ? tokenise(c.searchText).map(stem).join(" ") : c.searchText,
  }));
  const lexical = buildBm25(idxDocs);
  const vector = new LocalTrigramBackend(chunks);
  const byId = new Map(chunks.map((c) => [c.id, c]));

  let hits = 0;
  const misses: string[] = [];
  for (const { q, docs } of golden.queries) {
    const qq = transform(q);
    const qTerms = stemmed ? tokenise(qq).map(stem).join(" ") : qq;
    const lists = [
      { leg: "bm25", ids: searchBm25(lexical, qTerms, 20).map((s) => s.id) },
      { leg: "vec", ids: await vector.search(qq, 20) },
    ];
    const top = fuse(lists).slice(0, 5);
    if (top.some((f) => docs.includes(byId.get(f.id)!.docId))) hits += 1;
    else misses.push(q);
  }
  const n = golden.queries.length;
  console.log(`  ${label.padEnd(28)} recall@5 = ${(hits / n).toFixed(3)}  (${hits}/${n})`);
  for (const m of misses) console.log(`      miss: ${m}`);
}

(async () => {
  console.log(`  golden queries: ${golden.queries.length}, chunks: ${chunks.length}\n`);
  await score("baseline (as shipped)", (s) => s, false);
  await score("stemming only", (s) => s, true);
  await score("synonym expansion only", expand, false);
  await score("stemming + expansion", expand, true);
})();
