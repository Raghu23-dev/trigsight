import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { citationFiles, documentFiles } from "../../bench/citations/discover.ts";

/**
 * REGRESSION + META-TESTS on the gate itself.
 *
 * A gate that verifies nothing passes everything. That is strictly worse than
 * having no gate, because it produces a green tick that means nothing.
 *
 * The first test here exists because of a real bug caught during development:
 * the file walker filtered to `.md`/`.mdx` before citation manifests were read,
 * so `*.citations.json` files were invisible and the gate reported
 * "citations: 0  bound: 0  unbound: 0" and exited 0 — a silent pass with the
 * real citations never checked.
 */

describe("prevents: the gate silently verifying nothing", () => {
  it("discovers citation manifests, not only content documents", () => {
    const found = citationFiles("content");
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((f) => f.endsWith(".citations.json"))).toBe(true);
  });

  it("does not treat a citation manifest as a content document", () => {
    expect(documentFiles("content").some((f) => f.endsWith(".citations.json"))).toBe(false);
  });

  it("finds at least one content document", () => {
    expect(documentFiles("content").length).toBeGreaterThan(0);
  });
});

describe("the gate's exit codes are load-bearing", () => {
  const run = (args: string[]): number => {
    try {
      execFileSync("npx", ["tsx", "bench/citations/verify.ts", ...args], { stdio: "pipe" });
      return 0;
    } catch (e) {
      return (e as { status?: number }).status ?? -1;
    }
  };

  it("exits 0 when every citation binds", () => {
    expect(run([])).toBe(0);
  });

  it("exits 1 when a fabricated citation is present", () => {
    expect(run(["--demo"])).toBe(1);
  });
});
