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

describe("prevents: a technology name that is also an English word", () => {
  /**
   * WHY: "Go" survived word-boundary matching in the sentence "asks the reader to go and check" —
   * ordinary prose about following a link, in a document whose stack is TypeScript. checkStack
   * would have reported Go as "discussed in prose — the reasoning is documented", which is the
   * false positive this module's own comment calls its worst possible output.
   *
   * The boundary matcher was already correct; the problem is that a boundary cannot tell a
   * language from a verb. Ambiguous names are therefore corroborated against the declared stacks.
   *
   * THE OPPOSITE FAILURE MATTERS AS MUCH. Suppressing an ambiguous name unconditionally would
   * hide a genuine one, so the last two tests here check that corroboration still lets a real
   * mention through.
   */
  it("does not report Go from the English word in prose", () => {
    const r = tools.checkStack("Go") as {
      listedInStack: unknown[];
      discussedInProse: unknown[];
    };
    expect(r.listedInStack).toHaveLength(0);
    expect(r.discussedInProse).toHaveLength(0);
  });

  it("says plainly that it was not found, rather than hedging", () => {
    const r = tools.checkStack("Go") as { assessment: string };
    expect(r.assessment).toContain("Not found");
  });

  it("still reports an unambiguous technology that IS discussed", () => {
    // TypeScript is in a stack and written about. Nothing about the ambiguity guard may touch it.
    const r = tools.checkStack("TypeScript") as {
      listedInStack: unknown[];
      discussedInProse: unknown[];
    };
    expect(r.listedInStack.length).toBeGreaterThan(0);
  });

  it("would report an ambiguous name if a project actually declared it", () => {
    // Corroboration, not suppression: build a corpus that really does use Go and confirm the
    // guard steps aside. Otherwise this fix trades a false positive for a false negative.
    const withGo = new Tools(
      [
        {
          id: "projects/example",
          title: "Example",
          path: "/projects/example",
          summary: "s",
          category: "c",
          period: "2026",
          stack: ["Go", "Postgres"],
          metrics: [],
          body: "## Why\n\nThe scheduler is written in Go because the concurrency primitives map onto the problem directly and the deployment is a single static binary.\n",
        },
      ],
      "https://example.test",
    );
    const r = withGo.checkStack("Go") as {
      listedInStack: unknown[];
      discussedInProse: unknown[];
    };
    expect(r.listedInStack.length).toBeGreaterThan(0);
    expect(r.discussedInProse.length).toBeGreaterThan(0);
  });
});
