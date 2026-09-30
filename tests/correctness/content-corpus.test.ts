import { describe, expect, it } from "vitest";
import { allChatDocuments, footer, nav, pages, skills } from "../../src/lib/content.ts";

describe("allChatDocuments", () => {
  it("includes the migrated pages and skills documents", () => {
    const ids = allChatDocuments().map((d) => d.id);
    expect(ids).toContain("about");
    expect(ids).toContain("home");
    expect(ids.filter((id) => id.startsWith("skills/")).length).toBe(8);
  });

  it("still includes the pre-existing work and project documents", () => {
    const ids = allChatDocuments().map((d) => d.id);
    expect(ids.some((id) => id.startsWith("work/"))).toBe(true);
    expect(ids.some((id) => id.startsWith("projects/"))).toBe(true);
  });

  it("never includes nav or footer, which have no citable body", () => {
    const ids = allChatDocuments().map((d) => d.id);
    expect(ids).not.toContain("nav");
    expect(ids).not.toContain("footer");
  });
});

describe("pages", () => {
  it("resolves the homepage to path '/', not '/home'", () => {
    const home = pages.find((p) => p.id === "home");
    expect(home?.path).toBe("/");
  });

  it("resolves about to path '/about'", () => {
    const about = pages.find((p) => p.id === "about");
    expect(about?.path).toBe("/about");
  });
});

describe("nav and footer", () => {
  it("are exposed as single objects, not arrays", () => {
    expect(Array.isArray(nav)).toBe(false);
    expect(Array.isArray(footer)).toBe(false);
  });

  it("carry the migrated link data", () => {
    expect(nav.primaryLinks.map((l) => l.label)).toEqual(["Projects", "About", "Ask"]);
    expect(footer.links.map((l) => l.label)).toContain("Email");
  });
});

describe("skills", () => {
  it("is sorted by order", () => {
    const orders = skills.map((s) => s.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it("has 8 categories, each with a citable body", () => {
    expect(skills).toHaveLength(8);
    for (const group of skills) expect(group.raw.length).toBeGreaterThan(0);
  });
});
