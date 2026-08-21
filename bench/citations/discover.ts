/**
 * File discovery for the citation gate.
 *
 * Extracted from verify.ts so it can be tested directly. It is tested because a
 * bug here is invisible: if discovery returns nothing, the gate reports
 * "0 citations, 0 unbound" and exits 0 — a green tick that verified nothing.
 * That exact bug occurred during development (the walker filtered to .md/.mdx
 * before citation manifests were read), so these functions now have their own
 * regression tests.
 */

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Every file under `dir`, recursively. Filtering is the caller's job. */
export function walk(dir: string): string[] {
  let out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else out.push(p);
  }
  return out;
}

/** Content documents only — excludes the sidecar citation manifests. */
export function documentFiles(dir: string): string[] {
  return walk(dir).filter(
    (f) => (f.endsWith(".mdx") || f.endsWith(".md")) && !f.endsWith(".citations.json"),
  );
}

/** Sidecar citation manifests. */
export function citationFiles(dir: string): string[] {
  return walk(dir).filter((f) => f.endsWith(".citations.json"));
}
