// Does stemming generalise, or did it happen to fix the one query in the golden set?
//
// Held-out queries: written now, never used to tune anything, each a plural/tense variant of a
// term the corpus states in a different form. If stemming is real, these improve. If it only
// rescued one lucky query, they will not.
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

const HOLDOUT: { q: string; docs: string[] }[] = [
  { q: "how are reservations released", docs: ["projects/fusegrid"] },
  { q: "what do the probes check", docs: ["projects/mcpgantlet"] },
  { q: "how are citations verified", docs: ["projects/trigsight"] },
  { q: "which rules cite clauses", docs: ["projects/mcpgantlet"] },
  { q: "how are permissions enforced", docs: ["projects/onewayglass"] },
  { q: "what gets chunked", docs: ["projects/trigsight"] },
  { q: "how are budgets exceeded", docs: ["projects/fusegrid"] },
  { q: "what leaks counts", docs: ["projects/onewayglass"] },
];

const chunks: Chunk[] = [...projects, ...work].flatMap((d) =>
  chunkDocument({ docId: d.id, docTitle: d.title, path: d.path, body: d.raw }),
);


async function score(label: string, stemmed: boolean) {
  const lexical = buildBm25(
    chunks.map((c) => ({
      id: c.id,
      text: stemmed ? tokenise(c.searchText).map(stem).join(" ") : c.searchText,
    })),
  );
  const vector = new LocalTrigramBackend(chunks);
  const byId = new Map(chunks.map((c) => [c.id, c]));
  let hits = 0;
  const misses: string[] = [];
  for (const { q, docs } of HOLDOUT) {
    const qq = stemmed ? tokenise(q).map(stem).join(" ") : q;
    const lists = [
      { leg: "bm25", ids: searchBm25(lexical, qq, 20).map((s) => s.id) },
      { leg: "vec", ids: await vector.search(q, 20) },
    ];
    if (fuse(lists).slice(0, 5).some((f) => docs.includes(byId.get(f.id)!.docId))) hits += 1;
    else misses.push(q);
  }
  console.log(`  ${label.padEnd(22)} ${hits}/${HOLDOUT.length}`);
  for (const m of misses) console.log(`      miss: ${m}`);
}

(async () => {
  console.log(`  held-out queries: ${HOLDOUT.length}\n`);
  await score("baseline", false);
  await score("stemming", true);
})();
