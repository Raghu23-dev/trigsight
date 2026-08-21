import type { MetadataRoute } from "next";
import { projects, work } from "../lib/content";

const BASE = "https://trigsight.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: BASE, changeFrequency: "monthly", priority: 1 },
    { url: `${BASE}/ask`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/projects`, changeFrequency: "monthly", priority: 0.9 },
    ...projects.map((p) => ({
      url: `${BASE}${p.path}`,
      changeFrequency: "monthly" as const,
      // Higher than the work pages: these are the only entries a reader can independently
      // verify, so they are the ones worth landing on first.
      priority: 0.95,
    })),
    ...work.map((w) => ({
      url: `${BASE}${w.path}`,
      changeFrequency: "yearly" as const,
      priority: 0.9,
    })),
  ];
}
