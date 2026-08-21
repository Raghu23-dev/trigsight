#!/usr/bin/env tsx
/**
 * THE BUILD GATE.
 *
 * Exits non-zero if any citation cannot be bound to a real passage in a real
 * document. Wired into `pnpm build` and CI, so an unverifiable claim about my
 * work cannot reach production.
 *
 * This implements success criteria 1 and 2 of docs/02-thesis.md.
 *
 * Usage:
 *   tsx bench/citations/verify.ts            verify the real content tree
 *   tsx bench/citations/verify.ts --demo     demonstrate a failing build
 */

import { readFileSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import { citationFiles, documentFiles } from "./discover.ts";
import { buildIndex, type DocumentInput } from "../../src/lib/passage-index.ts";
import { formatReport, verifyAll, type Citation } from "../../src/lib/verify-citations.ts";

const CONTENT_DIR = "content";
const OUT = "src/generated/citation-allowlist.json";

function frontmatter(body: string): Record<string, string> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(body);
  if (!m?.[1]) return {};
  const out: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (kv?.[1] !== undefined && kv[2] !== undefined) {
      out[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  return out;
}

function loadDocuments(): DocumentInput[] {
  return documentFiles(CONTENT_DIR).map((file) => {
    const body = readFileSync(file, "utf8");
    const fm = frontmatter(body);
    const id = relative(CONTENT_DIR, file).replace(/\.mdx?$/, "");
    return {
      id,
      path: `/${id}`,
      title: fm.title ?? id,
      body,
    };
  });
}

/**
 * Citations are authored alongside content in `content/**\/*.citations.json`.
 * Kept separate from the prose so a content edit and a citation edit are
 * distinguishable in review — and so the gate has an explicit list to check
 * rather than inferring intent from prose.
 */
function loadCitations(): Citation[] {
  const out: Citation[] = [];
  for (const file of citationFiles(CONTENT_DIR)) {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (!Array.isArray(parsed)) {
      console.error(`${file}: expected a JSON array of citations`);
      process.exit(2);
    }
    for (const c of parsed as Array<Record<string, unknown>>) {
      out.push({
        source: file,
        docId: String(c.docId ?? ""),
        passage: String(c.passage ?? ""),
        ...(typeof c.occurrence === "number" ? { occurrence: c.occurrence } : {}),
      });
    }
  }
  return out;
}

function main(): void {
  const demo = process.argv.includes("--demo");

  const docs = demo
    ? [
        {
          id: "work/demo",
          path: "/work/demo",
          title: "Demo",
          body: "The engine ran multi-step workflows with human-in-the-loop approval gates.",
        },
      ]
    : loadDocuments();

  const citations: Citation[] = demo
    ? [
        {
          source: "demo",
          docId: "work/demo",
          passage: "multi-step workflows with human-in-the-loop approval gates",
        },
        {
          source: "demo (deliberately fabricated)",
          docId: "work/demo",
          passage: "the engine served fourteen million concurrent users",
        },
      ]
    : loadCitations();

  const index = buildIndex(docs);
  const report = verifyAll(index, citations);

  console.log(`documents indexed: ${index.size}`);
  console.log(formatReport(report));

  if (!report.passed) {
    console.error("");
    console.error("BUILD FAILED — unverifiable claims cannot ship.");
    console.error("Fix each citation above: quote the document exactly, or correct the claim.");
    process.exit(1);
  }

  if (!demo) {
    const allowlist = Object.fromEntries(
      report.bound.map((b) => [
        `${b.citation.docId}::${b.citation.passage}`,
        { href: b.href, quote: b.quote, ambiguous: b.ambiguous },
      ]),
    );
    writeFileSync(OUT, `${JSON.stringify(allowlist, null, 2)}\n`);
    console.log(`\nwrote ${OUT} (${report.bound.length} verified citations)`);
  }

  console.log("\nOK — every citation is bound to a real passage.");
}

main();
