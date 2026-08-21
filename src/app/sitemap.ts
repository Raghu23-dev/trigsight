import type { MetadataRoute } from "next";
import { work } from "../lib/content";

const BASE = "https://trigsight.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: BASE, changeFrequency: "monthly", priority: 1 },
    { url: `${BASE}/ask`, changeFrequency: "monthly", priority: 0.8 },
    ...work.map((w) => ({
      url: `${BASE}${w.path}`,
      changeFrequency: "yearly" as const,
      priority: 0.9,
    })),
  ];
}
