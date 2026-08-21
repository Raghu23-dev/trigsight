import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { documentFiles } from "../../bench/citations/discover.ts";
import { Tools, type Doc } from "../../src/lib/mcp/tools.ts";

/**
 * ADVERSARIAL: the MCP server must not confirm claims it has no evidence for.
 *
 * The failure this guards against is concrete and was observed during development:
 * a vector leg is a nearest-neighbour search, so it always returns its closest
 * chunks however unrelated. find_evidence reported supported=true for "quantum
 * cryptography research on ion traps" — an agent consuming that would repeat a
 * fabricated credential downstream.
 */

function load(): Doc[] {
  return documentFiles("content").map((f) => {
    const body = readFileSync(f, "utf8");
    const id = f.replace(/^content\//, "").replace(/\.mdx?$/, "");
    const stack = [...body.matchAll(/^ {2}- (.+)$/gm)].map((m) => m[1]?.trim() ?? "");
    return {
      id,
      title: id,
      path: `/${id}`,
      summary: "",
      category: "",
      period: "",
      stack,
      metrics: [],
      body,
    };
  });
}

const tools = new Tools(load(), "https://example.test");

describe("prevents: confirming experience that does not exist", () => {
  const fabricated = [
    "quantum cryptography research on ion traps",
    "trained a diffusion model for protein folding",
    "managed a hedge fund portfolio",
    "embedded firmware for satellite avionics",
    "professional pastry chef experience",
  ];

  for (const claim of fabricated) {
    it(`reports unsupported: ${claim}`, async () => {
      const r = (await tools.findEvidence(claim)) as { supported: boolean; note?: string };
      expect(r.supported).toBe(false);
      expect(r.note).toContain("does not appear");
    });
  }

  it("lists what IS covered so a calling agent can self-correct", async () => {
    const r = (await tools.findEvidence("underwater welding")) as {
      availableTopics?: unknown[];
    };
    expect(r.availableTopics?.length).toBeGreaterThan(0);
  });

  it("returns unsupported for an empty claim rather than everything", async () => {
    const r = (await tools.findEvidence("")) as { supported: boolean };
    expect(r.supported).toBe(false);
  });
});

describe("still confirms real experience", () => {
  const real = [
    "replaced polling with server-sent events",
    "human-in-the-loop approval gates",
    "hybrid retrieval with reciprocal rank fusion",
    "context compaction measured on real conversations",
    "per-run cost accounting",
  ];

  for (const claim of real) {
    it(`reports supported: ${claim}`, async () => {
      const r = (await tools.findEvidence(claim)) as {
        supported: boolean;
        evidence?: Array<{ url: string; passage: string }>;
      };
      expect(r.supported).toBe(true);
      expect(r.evidence?.[0]?.url).toContain("https://example.test/work/");
      expect(r.evidence?.[0]?.passage.length).toBeGreaterThan(0);
    });
  }
});

describe("prevents: substring false positives in check_stack", () => {
  it("does not report Rust because 'trust' contains it", () => {
    const r = tools.checkStack("Rust") as {
      listedInStack: unknown[];
      discussedInProse: unknown[];
    };
    expect(r.listedInStack).toHaveLength(0);
    expect(r.discussedInProse).toHaveLength(0);
  });

  it("does not report Go because 'going' or 'category' contain it", () => {
    const r = tools.checkStack("Go") as {
      listedInStack: unknown[];
      discussedInProse: unknown[];
    };
    expect(r.discussedInProse).toHaveLength(0);
  });

  it("distinguishes stack-listed from prose-discussed", () => {
    const kafka = tools.checkStack("Kafka") as { assessment: string };
    expect(kafka.assessment).toContain("Discussed in prose");

    const treesitter = tools.checkStack("Tree-sitter") as {
      assessment: string;
      listedInStack: unknown[];
    };
    expect(treesitter.listedInStack.length).toBeGreaterThan(0);
    expect(treesitter.assessment).toContain("not discussed in detail");
  });

  it("says plainly when a technology is absent", () => {
    const r = tools.checkStack("COBOL") as { assessment: string };
    expect(r.assessment).toContain("Not found");
  });
});

describe("read_work", () => {
  it("returns a document and strips frontmatter", () => {
    const r = tools.readWork("work/experience-studio") as { body?: string; title?: string };
    expect(r.body).toBeDefined();
    expect(r.body).not.toContain("summary:");
  });

  it("lists available ids for an unknown document rather than failing opaquely", () => {
    const r = tools.readWork("work/nonexistent") as { error?: string; available?: string[] };
    expect(r.error).toContain("Unknown document");
    expect(r.available?.length).toBeGreaterThan(0);
  });
});
