import { describe, expect, it } from "vitest";
import { buildFragment, encodePassage, findOccurrences, normalise } from "../../src/lib/normalise.ts";

/**
 * These cases come directly from the probe in
 * bench/baseline/probe-text-fragment-matching.mjs. Each one is a case where
 * comparing raw source would give the wrong answer.
 */
describe("normalise — matches what the browser matches", () => {
  it("collapses newlines, so a passage crossing a line break still matches", () => {
    const source = "workflows with\nhuman-in-the-loop approval gates";
    expect(normalise(source)).toBe("workflows with human-in-the-loop approval gates");
  });

  it("collapses runs of spaces and tabs", () => {
    expect(normalise("Multiple   spaces\tcollapse")).toBe("multiple spaces collapse");
  });

  it("collapses non-breaking spaces (MDX authoring artefact)", () => {
    expect(normalise("2K+ daily users")).toBe("2k+ daily users");
  });

  it("casefolds, because fragment matching is case-insensitive per spec", () => {
    expect(normalise("HUMAN-IN-THE-LOOP")).toBe(normalise("human-in-the-loop"));
  });

  it("strips zero-width characters that are invisible in review", () => {
    expect(normalise("real​time⁠ streaming")).toBe("realtime streaming");
  });

  it("preserves smart quotes and em dashes, which match correctly", () => {
    expect(normalise("“Smart quotes” and em—dashes")).toBe(
      "“smart quotes” and em—dashes",
    );
  });

  it("trims", () => {
    expect(normalise("   padded   ")).toBe("padded");
  });
});

describe("encodePassage", () => {
  it("percent-encodes the dash, which the spec requires and encodeURIComponent skips", () => {
    expect(encodePassage("human-in-the-loop")).toBe("human%2Din%2Dthe%2Dloop");
  });

  it("percent-encodes commas, which are grammar separators in the directive", () => {
    expect(encodePassage("first, second")).toBe("first%2C%20second");
  });

  it("encodes spaces", () => {
    expect(encodePassage("two words")).toBe("two%20words");
  });
});

describe("findOccurrences", () => {
  it("finds every occurrence, not just the first", () => {
    expect(findOccurrences("the cat and the hat", "the")).toHaveLength(2);
  });

  it("finds overlapping occurrences", () => {
    // "aa" appears at 0, 1, 2 in "aaaa" — a naive +needle.length stride misses two.
    expect(findOccurrences("aaaa", "aa")).toHaveLength(3);
  });

  it("returns empty for an absent needle", () => {
    expect(findOccurrences("abc", "xyz")).toHaveLength(0);
  });

  it("returns empty for an empty needle rather than matching everywhere", () => {
    expect(findOccurrences("abc", "")).toHaveLength(0);
  });
});

describe("buildFragment", () => {
  const doc = normalise(
    "The engine drives agents through workflows. It serves 2K+ daily users. " +
      "The engine drives agents through other workflows too.",
  );

  it("emits a plain directive for a unique passage", () => {
    const { directive, ambiguous } = buildFragment(doc, "it serves 2k+ daily users");
    expect(ambiguous).toBe(false);
    expect(directive).toBe(":~:text=it%20serves%202k%2B%20daily%20users");
  });

  it("adds a prefix when the passage repeats, so the reader lands on the right one", () => {
    // "the engine drives agents through" appears twice.
    const { directive, ambiguous } = buildFragment(doc, "the engine drives agents through", 1);
    expect(ambiguous).toBe(true);
    expect(directive).toContain("-,");
  });

  it("throws rather than emitting a broken fragment when the passage is absent", () => {
    expect(() => buildFragment(doc, "this text is not present anywhere")).toThrow(/not found/);
  });
});
