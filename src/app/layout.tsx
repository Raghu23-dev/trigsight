import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Raghuram P — AI infrastructure",
    template: "%s · Raghuram P",
  },
  description:
    "I build the AI tools other engineers build with. Multi-agent orchestration, retrieval, and real-time streaming at scale.",
  metadataBase: new URL("https://trigsight.vercel.app"),
  openGraph: {
    type: "website",
    siteName: "Raghuram P",
    url: "https://trigsight.vercel.app",
  },
  robots: { index: true, follow: true },
};

/**
 * Structured data. Person and WebSite only — the two types a search engine actually
 * uses for an individual's site. Padding this with speculative schema types was
 * measured as having no effect and is skipped.
 */
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Person",
      "@id": "https://trigsight.vercel.app/#person",
      name: "Raghuram P",
      jobTitle: "GenAI Full-Stack Engineer",
      description:
        "Builds AI infrastructure: multi-agent orchestration, hybrid retrieval, and real-time streaming backbones.",
      url: "https://trigsight.vercel.app",
      sameAs: ["https://github.com/Raghu23-dev", "https://www.linkedin.com/in/raghuram-p"],
      knowsAbout: [
        "Multi-agent orchestration",
        "Retrieval-augmented generation",
        "Real-time streaming architecture",
        "LLM infrastructure",
      ],
    },
    {
      "@type": "WebSite",
      "@id": "https://trigsight.vercel.app/#website",
      url: "https://trigsight.vercel.app",
      name: "Raghuram P",
      author: { "@id": "https://trigsight.vercel.app/#person" },
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          // Static object defined above; no user input reaches this.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
      </head>
      <body className="relative min-h-dvh overflow-x-hidden bg-bg text-fg">{children}</body>
    </html>
  );
}
