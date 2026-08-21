import { describe, expect, it } from "vitest";
import { segment, unresolvedTokens, type Allowlist } from "../../src/lib/citation-token.ts";

const allowlist: Allowlist = {
  "work/a::a real verified passage": {
    href: "/work/a#:~:text=a%20real%20verified%20passage",
    quote: "a real verified passage",
    ambiguous: false,
  },
};

describe("prevents: the model fabricating a link", () => {
  it("resolves a token present in the allowlist", () => {
    const segs = segment("Before [[cite:work/a|a real verified passage]] after", allowlist);
    const cite = segs.find((s) => s.type === "citation");
    expect(cite?.citation?.href).toContain("#:~:text=");
  });

  it("drops a token whose passage is not in the allowlist", () => {
    const segs = segment("Claim [[cite:work/a|invented passage]] here", allowlist);
    expect(segs.some((s) => s.type === "citation")).toBe(false);
  });

  it("drops a token for a document that does not exist", () => {
    const segs = segment("[[cite:work/nope|a real verified passage]]", allowlist);
    expect(segs.some((s) => s.type === "citation")).toBe(false);
  });

  it("never leaks raw token syntax to the reader", () => {
    const segs = segment("x [[cite:work/a|invented]] y", allowlist);
    expect(segs.map((s) => s.text).join("")).not.toContain("[[cite:");
  });

  it("cannot be tricked into emitting a URL the model chose", () => {
    // Even if the model tries to smuggle a URL as the passage, the lookup fails.
    const segs = segment("[[cite:work/a|https://evil.example/phish]]", allowlist);
    expect(segs.some((s) => s.type === "citation")).toBe(false);
  });

  it("reports unresolved attempts so they can be measured", () => {
    expect(unresolvedTokens("[[cite:work/a|nope]]", allowlist)).toHaveLength(1);
    expect(unresolvedTokens("[[cite:work/a|a real verified passage]]", allowlist)).toHaveLength(0);
  });
});

describe("segmentation", () => {
  it("preserves surrounding prose", () => {
    const segs = segment("A [[cite:work/a|a real verified passage]] B", allowlist);
    expect(segs[0]?.text).toBe("A ");
    expect(segs[segs.length - 1]?.text).toBe(" B");
  });

  it("handles text with no citations", () => {
    const segs = segment("just prose", allowlist);
    expect(segs).toHaveLength(1);
    expect(segs[0]?.type).toBe("text");
  });

  it("handles several citations in one answer", () => {
    const segs = segment(
      "[[cite:work/a|a real verified passage]] and [[cite:work/a|a real verified passage]]",
      allowlist,
    );
    expect(segs.filter((s) => s.type === "citation")).toHaveLength(2);
  });
});
