import { describe, expect, it } from "vitest";
import { buildIndex, renderToText } from "../../src/lib/passage-index.ts";
import { verifyAll, verifyCitation } from "../../src/lib/verify-citations.ts";

/**
 * ADVERSARIAL SUITE — tries to break the thesis.
 *
 * The thesis is that an unverifiable claim cannot ship. Each test below is an
 * attempt to smuggle one past the gate. Every test names the failure it prevents.
 */

const DOC = `---
title: Experience Studio
---

# Experience Studio

The platform converts prompts and design images into wireframes and deployable
React applications. It replaced polling with a streaming architecture that
scaled throughput tenfold at sub-150ms latency.

\`\`\`ts
const secret = "code blocks are not prose and must not be citable";
\`\`\`

Deployment spans five client environments.
`;

const index = buildIndex([
  { id: "work/experience-studio", path: "/work/experience-studio", title: "Experience Studio", body: DOC },
]);

const src = "test";

describe("prevents: a fabricated passage rendering as a real citation", () => {
  it("rejects a passage that does not exist in the document", () => {
    const r = verifyCitation(index, {
      source: src,
      docId: "work/experience-studio",
      passage: "It served fourteen million concurrent users worldwide",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("passage-not-found");
  });

  it("rejects a paraphrase — close is not cited", () => {
    // The document says "scaled throughput tenfold at sub-150ms latency".
    const r = verifyCitation(index, {
      source: src,
      docId: "work/experience-studio",
      passage: "scaled throughput by ten times at under 150 milliseconds",
    });
    expect(r.ok).toBe(false);
  });

  it("rejects a citation to a document that does not exist", () => {
    const r = verifyCitation(index, {
      source: src,
      docId: "work/invented-project",
      passage: "The platform converts prompts and design images into wireframes",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("unknown-document");
  });
});

describe("prevents: citing text that is not visible on the page", () => {
  it("does not index fenced code blocks", () => {
    const text = renderToText(DOC);
    expect(text).not.toContain("code blocks are not prose");
  });

  it("rejects a citation into a code block", () => {
    const r = verifyCitation(index, {
      source: src,
      docId: "work/experience-studio",
      passage: "code blocks are not prose and must not be citable",
    });
    expect(r.ok).toBe(false);
  });

  it("does not index frontmatter", () => {
    expect(renderToText(DOC)).not.toContain("---");
  });
});

describe("prevents: a citation so vague it identifies nothing", () => {
  it("rejects a passage below the minimum length", () => {
    const r = verifyCitation(index, {
      source: src,
      docId: "work/experience-studio",
      passage: "The platform",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("passage-too-short");
  });

  it("rejects an overlong passage that would break on any edit", () => {
    const r = verifyCitation(index, {
      source: src,
      docId: "work/experience-studio",
      passage: "x".repeat(400),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("passage-too-long");
  });
});

describe("prevents: a stale citation surviving a content edit", () => {
  it("fails once the cited sentence is reworded", () => {
    const citation = {
      source: src,
      docId: "work/experience-studio",
      passage: "Deployment spans five client environments",
    };
    expect(verifyCitation(index, citation).ok).toBe(true);

    const edited = buildIndex([
      {
        id: "work/experience-studio",
        path: "/work/experience-studio",
        title: "Experience Studio",
        body: DOC.replace("five client environments", "several client environments"),
      },
    ]);

    // This is the fragility of text fragments turned into a feature: the edit
    // cannot ship silently, because the build fails and names the citation.
    expect(verifyCitation(edited, citation).ok).toBe(false);
  });
});

describe("prevents: the build proceeding with any unbound citation", () => {
  it("reports passed=false when one of many citations fails", () => {
    const report = verifyAll(index, [
      {
        source: src,
        docId: "work/experience-studio",
        passage: "The platform converts prompts and design images into wireframes",
      },
      { source: src, docId: "work/experience-studio", passage: "a claim with no basis in the text" },
    ]);
    expect(report.total).toBe(2);
    expect(report.bound).toHaveLength(1);
    expect(report.unbound).toHaveLength(1);
    expect(report.passed).toBe(false);
  });

  it("passes only when every citation binds", () => {
    const report = verifyAll(index, [
      {
        source: src,
        docId: "work/experience-studio",
        passage: "The platform converts prompts and design images into wireframes",
      },
    ]);
    expect(report.passed).toBe(true);
  });

  it("treats an empty citation set as passing — nothing unverifiable was shipped", () => {
    expect(verifyAll(index, []).passed).toBe(true);
  });
});

describe("prevents: silently scrolling to the wrong occurrence", () => {
  const repeated = buildIndex([
    {
      id: "notes/repeat",
      path: "/notes/repeat",
      title: "Repeat",
      body: "The system is fully observable end to end. Later: the system is fully observable end to end.",
    },
  ]);

  it("flags an ambiguous passage and disambiguates it rather than guessing", () => {
    const r = verifyCitation(repeated, {
      source: src,
      docId: "notes/repeat",
      passage: "the system is fully observable end to end",
      occurrence: 1,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.ambiguous).toBe(true);
      expect(r.href).toContain("-,");
    }
  });
});

describe("prevents: a passage that only matches raw source, not rendered text", () => {
  it("binds a passage that crosses a newline in the source", () => {
    // In the source this spans two lines; rendered, it is one line.
    const r = verifyCitation(index, {
      source: src,
      docId: "work/experience-studio",
      passage: "into wireframes and deployable React applications",
    });
    expect(r.ok).toBe(true);
  });

  it("binds a passage whose case differs from the source", () => {
    const r = verifyCitation(index, {
      source: src,
      docId: "work/experience-studio",
      passage: "DEPLOYMENT SPANS FIVE CLIENT ENVIRONMENTS",
    });
    expect(r.ok).toBe(true);
  });
});
