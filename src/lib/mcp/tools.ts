/**
 * MCP tool implementations.
 *
 * These are VERIFICATION tools, not description tools. The distinction is the
 * whole point of exposing MCP from a portfolio at all.
 *
 * A description tool answers "tell me about Raghuram" — which a résumé already
 * does, better and faster. A verification tool answers "what evidence supports the
 * claim that he has done X?" and returns passages with links, so an agent can
 * check rather than trust.
 *
 * The risk this design targets is specific: an agent reads a portfolio's MCP
 * output and repeats an unsupported claim downstream. Every answer here is bound
 * to text that exists in a document, using the same verified allowlist the site's
 * own citations use.
 */

import { chunkDocument, type Chunk } from "../retrieval/chunk";
import { tokenise } from "../retrieval/bm25";
import { Retriever, LocalTrigramBackend } from "../retrieval/retrieve";
import { normalise } from "../normalise";

export interface Doc {
  readonly id: string;
  readonly title: string;
  readonly path: string;
  readonly summary: string;
  readonly category: string;
  readonly period: string;
  readonly stack: readonly string[];
  readonly metrics: ReadonlyArray<{ label: string; value: string; verified: boolean }>;
  readonly body: string;
}

export interface Evidence {
  readonly docId: string;
  readonly title: string;
  readonly passage: string;
  readonly url: string;
}

/**
 * Fraction of meaningful query terms that must appear in a passage for it to count
 * as evidence. Set by measurement rather than taste: see
 * bench/mcp/calibrate-overlap.ts.
 */
const MIN_TERM_OVERLAP = 0.34;

/**
 * Technology names that are also ordinary English words.
 *
 * For these, a word-boundary match in prose proves nothing: "go and check", "a rust-free
 * measurement", "the r value", "swift feedback". The tool corroborates them against the declared
 * stacks before reporting them as discussed.
 *
 * Deliberately a small explicit list rather than a heuristic. A heuristic that guesses which names
 * are ambiguous would be wrong in both directions, and this tool's whole value is that it does not
 * confirm experience that does not exist.
 */
const AMBIGUOUS_TECH_WORDS = new Set([
  "go",
  "rust",
  "r",
  "c",
  "d",
  "swift",
  "dart",
  "julia",
  "elm",
  "nim",
  "crystal",
  "processing",
  "pascal",
  "ada",
  "basic",
]);

export class Tools {
  private readonly chunks: Chunk[];
  private readonly retriever: Retriever;

  constructor(
    private readonly docs: readonly Doc[],
    private readonly origin: string,
  ) {
    this.chunks = docs.flatMap((d) =>
      chunkDocument({ docId: d.id, docTitle: d.title, path: d.path, body: d.body }),
    );
    this.retriever = new Retriever(this.chunks, new LocalTrigramBackend(this.chunks));
  }

  /** Every case study, with metrics flagged by whether they are independently checkable. */
  listWork(): unknown {
    return {
      count: this.docs.length,
      work: this.docs.map((d) => ({
        id: d.id,
        title: d.title,
        category: d.category,
        period: d.period,
        summary: d.summary,
        stack: d.stack,
        metrics: d.metrics,
        url: `${this.origin}${d.path}`,
      })),
    };
  }

  /**
   * Evidence for a claimed skill or technology.
   *
   * Returns passages that mention it, with deep links. If nothing is found it says
   * so plainly and lists what IS covered, so a calling agent can self-correct
   * rather than conclude the skill is merely undocumented.
   */
  async findEvidence(claim: string, limit = 5): Promise<unknown> {
    const hits = await this.retriever.retrieve(claim, { limit, tokenBudget: 100_000 });

    // RELEVANCE FLOOR — without this the tool lies.
    //
    // A vector leg is a nearest-neighbour search: it always returns its closest
    // chunks, however far away they are. So an unrelated claim ("quantum
    // cryptography on ion traps") still comes back with results, and reporting
    // supported=true for those is exactly the unsupported-claim propagation this
    // server exists to prevent.
    //
    // The floor requires genuine lexical overlap: at least one meaningful query
    // term must actually appear in the passage. Semantic similarity alone is not
    // sufficient evidence for a factual claim about someone's experience.
    // BOTH SIDES STEMMED, or the comparison is between different alphabets.
    //
    // `tokenise` stems, so a claim about "reservations" yields the term `reservation`. Testing that
    // against raw chunk text works only by accident — a stem is usually a prefix of the word it
    // came from, so `includes` finds it — and breaks the moment a suffix rule is not a plain
    // truncation: `policies` stems to `policy`, which appears nowhere in a document that says
    // "policies". The floor would then silently reject real evidence.
    //
    // Comparing token sets rather than substrings also removes a separate accident this had all
    // along: `includes` matched a term inside an unrelated word.
    const terms = tokenise(claim);
    const grounded = hits.filter((h) => {
      if (terms.length === 0) return false;
      const chunkTerms = new Set(tokenise(h.chunk.normalised));
      const overlap = terms.filter((t) => chunkTerms.has(t)).length;
      return overlap / terms.length >= MIN_TERM_OVERLAP;
    });

    const evidence: Evidence[] = grounded.map((h) => ({
      docId: h.chunk.docId,
      title: h.chunk.docTitle,
      passage: h.chunk.text,
      url: `${this.origin}${h.chunk.path}`,
    }));

    if (evidence.length === 0) {
      return {
        claim,
        supported: false,
        evidence: [],
        note: "No supporting passage found. This does not appear in the documented work.",
        availableTopics: this.docs.map((d) => ({ id: d.id, title: d.title, category: d.category })),
      };
    }

    return {
      claim,
      supported: true,
      evidenceCount: evidence.length,
      evidence,
      caveat:
        "Passages are retrieved from case studies on the site. Quote them directly rather than paraphrasing, and follow the url to read surrounding context.",
    };
  }

  /**
   * Whether a specific technology appears in the documented work, and where.
   *
   * Deliberately distinguishes "named in a stack list" from "discussed in prose".
   * A technology listed in frontmatter but never explained is weaker evidence than
   * one whose trade-offs are written about, and an honest tool says which it is.
   */
  checkStack(technology: string): unknown {
    const needle = normalise(technology);

    // Word-boundary matching, not substring.
    //
    // A naive `includes` reports "Rust" as discussed because "trust" contains it,
    // and "Go" matches "going", "algorithm", "category". For a tool whose purpose
    // is verifying claims, a false positive is the worst possible output — it
    // confirms experience that does not exist. Caught by probing with Rust.
    const boundary = new RegExp(
      `(^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`,
    );

    const inStack = this.docs
      .filter((d) => d.stack.some((s) => boundary.test(normalise(s))))
      .map((d) => ({ docId: d.id, title: d.title, url: `${this.origin}${d.path}` }));

    // Word boundaries are not enough for a name that is also an ordinary English word.
    //
    // "Go" survives boundary matching in "asks the reader to go and check" — a sentence about
    // reading a link, in a document whose stack is TypeScript. The tool would report Go as
    // "discussed in prose — the reasoning is documented", which is the false positive this
    // function's own comment calls its worst possible output, arrived at from the other direction.
    //
    // So an ambiguous name must be corroborated: it counts as discussed only if some document
    // actually lists it in a stack. A name nobody builds with, appearing as a common word, is
    // English rather than a technology. Unambiguous names ("TypeScript", "Upstash") are unaffected,
    // because nothing gates them — the set below is only consulted for words that are both.
    const ambiguous = AMBIGUOUS_TECH_WORDS.has(needle);
    const corroborated = inStack.length > 0;

    const inProse =
      ambiguous && !corroborated
        ? []
        : this.chunks
            .filter((c) => boundary.test(c.normalised))
            .slice(0, 4)
            .map((c) => ({
              docId: c.docId,
              headings: c.headings,
              passage: c.text,
              url: `${this.origin}${c.path}`,
            }));

    return {
      technology,
      listedInStack: inStack,
      discussedInProse: inProse,
      assessment:
        inProse.length > 0
          ? "Discussed in prose — the reasoning is documented, not just the name."
          : inStack.length > 0
            ? "Listed in a project stack but not discussed in detail on this site."
            : "Not found in the documented work.",
    };
  }

  /** Full text of one case study, for an agent that wants to read rather than search. */
  readWork(docId: string): unknown {
    const doc = this.docs.find((d) => d.id === docId || d.id === `work/${docId}`);
    if (doc === undefined) {
      return {
        error: `Unknown document: ${docId}`,
        available: this.docs.map((d) => d.id),
      };
    }
    return {
      id: doc.id,
      title: doc.title,
      category: doc.category,
      period: doc.period,
      summary: doc.summary,
      stack: doc.stack,
      metrics: doc.metrics,
      url: `${this.origin}${doc.path}`,
      body: doc.body.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim(),
    };
  }
}

export const TOOL_SCHEMAS = [
  {
    name: "list_work",
    description:
      "List every documented engineering project with its category, period, stack and metrics. Metrics carry a 'verified' flag indicating whether the figure is independently reproducible. Start here to see what is covered.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "find_evidence",
    description:
      "Find passages that support a claim about this engineer's experience. Returns quoted text with deep links, or states plainly that no evidence exists. Use this instead of assuming — it is designed so you can verify rather than trust.",
    inputSchema: {
      type: "object",
      properties: {
        claim: {
          type: "string",
          description: "The claim or capability to find evidence for, e.g. 'built streaming systems'",
        },
        limit: { type: "number", description: "Maximum passages to return (default 5)" },
      },
      required: ["claim"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "check_stack",
    description:
      "Check whether a specific technology appears in the documented work, distinguishing technologies merely listed in a project stack from those whose trade-offs are actually discussed in prose. The latter is stronger evidence.",
    inputSchema: {
      type: "object",
      properties: {
        technology: { type: "string", description: "Technology name, e.g. 'Kafka' or 'Tree-sitter'" },
      },
      required: ["technology"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "read_work",
    description:
      "Read the full text of one case study. Use after list_work to go deep on a specific project.",
    inputSchema: {
      type: "object",
      properties: {
        docId: { type: "string", description: "Document id, e.g. 'work/experience-studio'" },
      },
      required: ["docId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
] as const;
