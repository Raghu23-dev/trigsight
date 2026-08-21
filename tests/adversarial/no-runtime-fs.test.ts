import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * REGRESSION: no API route may read the filesystem at runtime.
 *
 * A serverless function bundle does not include the content/ directory, so
 * readFileSync("content/…") works locally and throws ENOENT in production. That
 * happened on the first deploy: /api/chat and /api/mcp both returned 500 while every
 * static page was fine — the worst shape of bug, because local testing cannot see it.
 *
 * Velite already carries the raw MDX in its build output, so the read was never
 * necessary. This test makes the mistake unrepeatable rather than relying on
 * remembering.
 */

function walk(dir: string): string[] {
  let out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (p.endsWith(".ts") || p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const FS_CALLS = /\b(readFileSync|readFile|readdirSync|createReadStream|statSync)\s*\(/;

describe("prevents: runtime filesystem access in a serverless route", () => {
  const routes = walk("src/app").filter((f) => f.endsWith("route.ts"));

  it("finds the API routes to check", () => {
    expect(routes.length).toBeGreaterThan(0);
  });

  for (const route of routes) {
    it(`${route} does not read the filesystem`, () => {
      const source = readFileSync(route, "utf8");
      // Strip comments first: the explanation of WHY we avoid fs mentions the API.
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      expect(code).not.toMatch(FS_CALLS);
      expect(code).not.toMatch(/from\s+"node:fs"/);
    });
  }
});

describe("prevents: shared libs pulling fs into a route bundle", () => {
  // src/lib is imported by routes, so an fs call there has the same effect.
  const libs = walk("src/lib");

  for (const lib of libs) {
    it(`${lib} does not read the filesystem`, () => {
      const code = readFileSync(lib, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      expect(code).not.toMatch(/from\s+"node:fs"/);
    });
  }
});
