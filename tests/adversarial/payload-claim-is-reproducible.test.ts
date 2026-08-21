import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * REGRESSION: the published payload number must be one the committed harness produces.
 *
 * `src/generated/payload.json` is rendered on the homepage, so it is a public claim. It
 * recorded 110.4 KB while `bench/baseline/measure-payload.sh` reported 174.3 KB against
 * the same deployment — a 63.9 KB disagreement between the claim and the tool that is
 * supposed to justify it.
 *
 * Neither number was a lie. The docs describe excluding Next's legacy polyfill bundle
 * (it carries `noModule`, so no ES-module browser fetches it), but the script's regex
 * `<script[^>]+src="..."` matches tags where `src` comes before `noModule` — so the
 * exclusion existed in prose and in a manual adjustment, never in code. The harness
 * counted bytes no browser downloads; the published figure had them removed by hand.
 *
 * These tests pin the two properties that made the drift possible:
 *   1. the harness must implement the exclusion it claims,
 *   2. the published number must sit under the budget it is measured against.
 *
 * They cannot verify the 133.9 KB value itself — that needs a network fetch, which
 * belongs in the bench, not the suite. What they can prevent is the *mechanism* of the
 * drift: a harness silently disagreeing with the claim it backs.
 */

const root = join(import.meta.dirname, "..", "..");
const harness = readFileSync(join(root, "bench", "baseline", "measure-payload.sh"), "utf8");
const payload = JSON.parse(
  readFileSync(join(root, "src", "generated", "payload.json"), "utf8"),
) as {
  initialJsKb: number;
  budgetKb: number;
  method: string;
  note: string;
};

describe("the payload harness implements the exclusion it documents", () => {
  it("filters noModule scripts", () => {
    expect(harness).toMatch(/nomodule/i);
  });

  it("matches whole script tags, not just the src attribute", () => {
    // `<script[^>]+src="[^"]+"` stops at the src and cannot see a later noModule.
    expect(harness).not.toMatch(/'<script\[\^>\]\+src="\[\^"\]\+"'/);
    expect(harness).toMatch(/<script\[\^>\]\*src="\[\^"\]\+"\[\^>\]\*>/);
  });

  it("reports how many scripts it excluded, so a silent zero is visible", () => {
    expect(harness).toMatch(/nomodule_scripts_excluded/);
  });
});

describe("the two payload harnesses are not confusable", () => {
  /**
   * The real root cause. `bench/payload/measure.sh` measures a LOCAL build with brotli
   * applied locally at quality 11 (~110 KB); `bench/baseline/measure-payload.sh` fetches
   * the DEPLOYED site and counts real transfer (~134 KB). Both are correct. The published
   * table compares against 380.9 KB, measured on the comparable site's deployment — so
   * only the deployed-transfer figure is apples-to-apples, and the local one had been
   * published instead. A method-mixed comparison flatters whoever chose the methods.
   */
  it("payload.json records which method produced its number", () => {
    expect(payload.method).toBe("deployed-transfer");
  });

  it("payload.json names the deployed-transfer harness, not the local one", () => {
    expect(payload.note).toMatch(/bench\/baseline\/measure-payload\.sh/);
  });

  it("the local harness warns that it is not the published figure", () => {
    const local = readFileSync(join(root, "bench", "payload", "measure.sh"), "utf8");
    expect(local).toMatch(/not the published figure|pre-deploy|NOT comparable/i);
  });
});

describe("the published payload claim is internally consistent", () => {
  it("is under the budget it is measured against", () => {
    expect(payload.initialJsKb).toBeLessThanOrEqual(payload.budgetKb);
  });

  it("states that noModule is excluded, so the number is comparable", () => {
    expect(payload.note).toMatch(/nomodule/i);
  });

  it("points at a regeneration command that exists", () => {
    const referenced = payload.note.match(/bench\/\S+\.sh/)?.[0];
    expect(referenced, "note must name the script that regenerates it").toBeDefined();
    // The old note pointed at bench/payload/measure.sh, which has never existed. Assert on
    // statSync().isFile() rather than a readFileSync throw: a missing path and a directory
    // fail differently, and "the file is a real file" is the property that matters.
    expect(
      existsSync(join(root, referenced as string)) &&
        statSync(join(root, referenced as string)).isFile(),
      `payload.json points at ${referenced}, which is not a file`,
    ).toBe(true);
  });
});
