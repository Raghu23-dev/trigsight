import { describe, expect, it } from "vitest";
import {
  resolveToken,
  segment,
  unresolvedTokens,
  type Allowlist,
} from "../../src/lib/citation-token.ts";

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

describe("trailing punctuation is tolerated, paraphrase is not", () => {
  /**
   * A model quoting a passage that ends a sentence completes it with a full stop. The allowlist
   * stores the passage without one, so exact matching rejected genuinely correct citations —
   * measured live at 2 of 3 failures, both punctuation-only.
   *
   * The relaxation is one character wide on purpose. These tests pin BOTH halves: that the
   * punctuation case now resolves, and that nothing looser does. A citation resolving to a
   * paraphrase is worse than one that fails, because it renders a chip that misquotes the source.
   */
  const allow: Allowlist = {
    "work/x::the ledger is shared across instances": {
      href: "/work/x#:~:text=the%20ledger%20is%20shared%20across%20instances",
      quote: "the ledger is shared across instances",
      ambiguous: false,
    },
  };

  it("resolves when the model adds a trailing full stop", () => {
    expect(resolveToken(allow, "work/x", "the ledger is shared across instances.")).not.toBeNull();
  });

  it("resolves for other trailing sentence punctuation", () => {
    for (const p of [",", ";", ":", "!", "?"]) {
      expect(resolveToken(allow, "work/x", `the ledger is shared across instances${p}`)).not.toBeNull();
    }
  });

  it("still resolves the exact passage", () => {
    expect(resolveToken(allow, "work/x", "the ledger is shared across instances")).not.toBeNull();
  });

  it("REJECTS a paraphrase", () => {
    expect(resolveToken(allow, "work/x", "the ledger is shared between instances")).toBeNull();
  });

  it("REJECTS a truncation", () => {
    expect(resolveToken(allow, "work/x", "the ledger is shared")).toBeNull();
  });

  it("REJECTS punctuation in the middle rather than the end", () => {
    expect(resolveToken(allow, "work/x", "the ledger is, shared across instances")).toBeNull();
  });

  it("REJECTS a passage attributed to the wrong document", () => {
    expect(resolveToken(allow, "work/y", "the ledger is shared across instances.")).toBeNull();
  });
});
