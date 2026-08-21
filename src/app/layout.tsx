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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="relative min-h-dvh overflow-x-hidden bg-bg text-fg">{children}</body>
    </html>
  );
}
