import { readFileSync } from "node:fs";
import { projects, work } from "../../../src/lib/content";
import { chunkDocument, type Chunk } from "../../../src/lib/retrieval/chunk";
import { LocalTrigramBackend } from "../../../src/lib/retrieval/retrieve";
import { buildBm25, searchBm25 } from "../../../src/lib/retrieval/bm25";
import { fuse } from "../../../src/lib/retrieval/fuse";

const STOP = new Set(["a","an","and","are","as","at","be","but","by","for","if","in","into","is","it","of","on","or","that","the","then","there","to","was","were","will","with"]);
function tok(text: string, sufs: string[]): string[] {
  return (text.toLowerCase().match(/[a-z0-9][a-z0-9_-]*/g) ?? [])
    .filter(t => t.length > 1 && !STOP.has(t))
    .map(t => {
      if (t.endsWith("ss")) return t;
      if (t.length - 3 >= 4 && t.endsWith("ies")) return t.slice(0,-3) + "y";
      for (const s of sufs) if (t.length - s.length >= 4 && t.endsWith(s)) return t.slice(0,-s.length);
      return t;
    });
}
const golden = JSON.parse(readFileSync("bench/retrieval/golden.json","utf8")) as {queries:{q:string;docs:string[]}[]};
const HOLDOUT = [
  {q:"how are reservations released",docs:["projects/fusegrid"]},
  {q:"what do the probes check",docs:["projects/mcpgantlet"]},
  {q:"how are citations verified",docs:["projects/trigsight"]},
  {q:"which rules cite clauses",docs:["projects/mcpgantlet"]},
  {q:"how are permissions enforced",docs:["projects/onewayglass"]},
  {q:"what gets chunked",docs:["projects/trigsight"]},
  {q:"how are budgets exceeded",docs:["projects/fusegrid"]},
  {q:"what leaks counts",docs:["projects/onewayglass"]},
];
const chunks: Chunk[] = [...projects, ...work].flatMap(d => chunkDocument({docId:d.id,docTitle:d.title,path:d.path,body:d.raw}));
async function run(label: string, sufs: string[]) {
  const idx = buildBm25(chunks.map(c => ({id:c.id,text:tok(c.searchText,sufs).join(" ")})));
  const vec = new LocalTrigramBackend(chunks);
  const byId = new Map(chunks.map(c => [c.id,c]));
  const score = async (qs: {q:string;docs:string[]}[]) => {
    let h = 0;
    for (const {q,docs} of qs) {
      const lists = [{leg:"bm25",ids:searchBm25(idx,tok(q,sufs).join(" "),20).map(s=>s.id)},{leg:"vec",ids:await vec.search(q,20)}];
      if (fuse(lists).slice(0,5).some(f=>docs.includes(byId.get(f.id)!.docId))) h++;
    }
    return h;
  };
  const g = await score(golden.queries), ho = await score(HOLDOUT);
  console.log(`  ${label.padEnd(24)} golden ${g}/${golden.queries.length}  holdout ${ho}/${HOLDOUT.length}`);
}
(async () => {
  await run("plural only (s, es)", ["s","es"]);
  await run("plural + ing", ["s","es","ing","ings"]);
})();
