import { describe, expect, it } from "vitest";
import { findBoundaryIssues } from "../../src/lib/inline-boundary.ts";
import { buildIndex } from "../../src/lib/passage-index.ts";
import { verifyCitation } from "../../src/lib/verify-citations.ts";

/**
 * REGRESSION: the verifier once bound passages the browser cannot match.
 *
 * A passage crossing inline markup renders as several DOM nodes, so a text
 * fragment fails even though the flattened text contains it. End-to-end checking
 * found 2 of 34 citations in this state — a silent failure of exactly the kind
 * this project exists to prevent.
 */

const body = `The failure was **output truncation**, not input size.
Rendered output is **state**, and prose is **history**.
This sentence has no markup at all and spans a full clause.
A wholly **bold phrase that is long enough to cite on its own** appears here.
Some \`inline_code()\` sits mid-sentence.`;

const index = buildIndex([{ id: "t", path: "/t", title: "T", body }]);
const src = "test";

describe("prevents: binding a passage the browser cannot match", () => {
  it("rejects a passage spanning bold markup", () => {
    const r = verifyCitation(index, {
      source: src,
      docId: "t",
      passage: "The failure was output truncation, not input size",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("crosses-inline-boundary");
  });

  it("rejects a passage spanning two bold runs", () => {
    const r = verifyCitation(index, {
      source: src,
      docId: "t",
      passage: "Rendered output is state, and prose is history",
    });
    expect(r.ok).toBe(false);
  });

  it("rejects a passage spanning inline code", () => {
    const r = verifyCitation(index, {
      source: src,
      docId: "t",
      passage: "Some inline_code() sits mid-sentence",
    });
    expect(r.ok).toBe(false);
  });

  it("names the offending markup so the fix is obvious", () => {
    const r = verifyCitation(index, {
      source: src,
      docId: "t",
      passage: "The failure was output truncation, not input size",
    });
    if (!r.ok) {
      expect(r.detail).toContain("output truncation");
      expect(r.detail).toContain("inside one element");
    }
  });
});

describe("does not over-reject", () => {
  it("accepts a passage with no markup", () => {
    const r = verifyCitation(index, {
      source: src,
      docId: "t",
      passage: "This sentence has no markup at all and spans a full clause",
    });
    expect(r.ok).toBe(true);
  });

  it("accepts a passage lying wholly inside one inline element", () => {
    // Entirely within <strong>, so it is one node and matches fine.
    const r = verifyCitation(index, {
      source: src,
      docId: "t",
      passage: "bold phrase that is long enough to cite on its own",
    });
    expect(r.ok).toBe(true);
  });

  it("reports no issues for text outside the document", () => {
    expect(findBoundaryIssues(body, "text that is not present here")).toHaveLength(0);
  });
});
