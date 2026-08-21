import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/" },
      // The chat endpoint costs an inference call per request. Crawlers have no
      // reason to hit it and every reason to hit it repeatedly.
      { userAgent: "*", disallow: ["/api/chat"] },
    ],
    sitemap: "https://trigsight.vercel.app/sitemap.xml",
  };
}
