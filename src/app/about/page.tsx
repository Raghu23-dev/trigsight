import type { Metadata } from "next";
import { ViewTransition } from "react";
import Link from "next/link";
import { MDX } from "../../components/mdx";
import { pageBySlug } from "../../lib/content";
import { PAGE_TRANSITION } from "../../lib/page-transition";

export function generateMetadata(): Metadata {
  const doc = pageBySlug("about");
  return {
    title: doc?.title ?? "About",
    description: doc?.summary,
  };
}

export default function AboutPage() {
  const doc = pageBySlug("about");
  if (!doc) throw new Error("content/about.mdx is missing");

  return (
    <ViewTransition {...PAGE_TRANSITION}>
    <main className="mx-auto max-w-4xl px-6 py-20">
      <Link
        href="/"
        transitionTypes={["nav-back"]}
        className="font-mono text-2xs uppercase tracking-[0.2em] text-fg-subtle hover:text-fg"
      >
        ← Home
      </Link>

      <header className="mt-10">
        <h1 className="font-display text-3xl leading-tight tracking-tight text-fg">
          {doc.title}
        </h1>
      </header>

      <div className="mt-10 max-w-2xl">
        <MDX code={doc.body} />
      </div>
    </main>
    </ViewTransition>
  );
}
