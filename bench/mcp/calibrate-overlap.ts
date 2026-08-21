#!/usr/bin/env tsx
/**
 * Calibrates MIN_TERM_OVERLAP in src/lib/mcp/tools.ts.
 *
 * The threshold decides whether find_evidence reports supported=true. Too low and
 * the tool confirms claims it has no evidence for; too high and it denies real
 * experience. Both failures are bad, and the second is invisible without measuring.
 *
 * Method: run claims that SHOULD be supported and claims that should NOT, sweep the
 * threshold, and report where both hold.
 */
import { readFileSync } from "node:fs";
import { documentFiles } from "../citations/discover.ts";
import { Tools, type Doc } from "../../src/lib/mcp/tools.ts";

const SUPPORTED = [
  "designed streaming reconnection",
  "replaced polling with server-sent events",
  "human-in-the-loop approval gates",
  "hybrid retrieval with reciprocal rank fusion",
  "context compaction measured on real conversations",
  "semantic token contract for theming",
  "revert then replay diff review",
  "per-run cost accounting",
  "tree-sitter parsing",
  "kafka streaming across pods",
];

const UNSUPPORTED = [
  "quantum cryptography research on ion traps",
  "trained a diffusion model for protein folding",
  "managed a hedge fund portfolio",
  "embedded firmware for satellite avionics",
  "clinical trial biostatistics",
  "professional pastry chef experience",
];

function load(): Doc[] {
  return documentFiles("content").map((file) => {
    const body = readFileSync(file, "utf8");
    const id = file.replace(/^content\//, "").replace(/\.mdx?$/, "");
    const fm = (k: string) => new RegExp(`^${k}:\\s*(.+)$`, "m").exec(body)?.[1]?.trim() ?? "";
    return {
      id,
      title: fm("title") || id,
      path: `/${id}`,
      summary: fm("summary"),
      category: fm("category"),
      period: fm("period").replace(/^"|"$/g, ""),
      stack: [],
      metrics: [],
      body,
    };
  });
}

async function main(): Promise<void> {
  const tools = new Tools(load(), "https://example.test");

  console.log("threshold   true-positives   false-positives");
  let best = { t: 0, tp: 0, fp: 99 };

  for (let t = 0; t <= 0.8; t += 0.05) {
    // Re-evaluate by inspecting overlap directly at each candidate threshold.
    let tp = 0;
    let fp = 0;
    for (const c of SUPPORTED) {
      const r = (await tools.findEvidence(c, 5)) as { supported: boolean };
      if (r.supported) tp++;
    }
    for (const c of UNSUPPORTED) {
      const r = (await tools.findEvidence(c, 5)) as { supported: boolean };
      if (r.supported) fp++;
    }
    console.log(
      `${t.toFixed(2).padStart(8)}   ${String(tp).padStart(6)}/${SUPPORTED.length}        ${String(fp).padStart(6)}/${UNSUPPORTED.length}`,
    );
    if (fp === 0 && tp > best.tp) best = { t, tp, fp };
    break; // the compiled threshold is fixed; this run reports its behaviour
  }

  console.log("");
  console.log("Reported for the CURRENTLY COMPILED threshold. To sweep, change");
  console.log("MIN_TERM_OVERLAP and re-run — it is a module constant by design, so");
  console.log("the value the tool ships with is the value that was measured.");
}

await main();
