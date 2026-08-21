import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { MDX } from "../../../components/mdx";
import { work, workBySlug } from "../../../lib/content";

export function generateStaticParams() {
  return work.map((w) => ({ slug: w.id.replace(/^work\//, "") }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const doc = workBySlug(slug);
  if (!doc) return {};
  return {
    title: doc.title,
    description: doc.summary,
    openGraph: { title: doc.title, description: doc.summary, type: "article" },
    // Advertise the plain-markdown variant. An agent that prefers markdown can
    // discover it from the HTML rather than guessing at a URL convention.
    alternates: { types: { "text/markdown": `${doc.path}/md` } },
  };
}

export default async function WorkPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const doc = workBySlug(slug);
  if (!doc) notFound();

  return (
    <article className="mx-auto max-w-3xl px-6 py-20">
      <Link
        href="/"
        className="font-mono text-2xs uppercase tracking-[0.2em] text-fg-subtle transition-colors hover:text-accent"
      >
        ← index
      </Link>

      <header className="mt-10 border-b border-border pb-10">
        <p className="font-mono text-2xs uppercase tracking-[0.2em] text-accent">
          {doc.category}
        </p>
        <h1 className="mt-4 font-display text-3xl leading-[1.1] tracking-tight text-fg">
          {doc.title}
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-fg-muted">{doc.summary}</p>

        {doc.metrics.length > 0 && (
          <dl className="mt-10 grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3">
            {doc.metrics.map((m) => (
              <div key={m.label}>
                <dd className="tabular text-2xl text-fg">{m.value}</dd>
                <dt className="mt-1 font-mono text-2xs uppercase leading-snug tracking-wider text-fg-subtle">
                  {m.label}
                </dt>
              </div>
            ))}
          </dl>
        )}

        <ul className="mt-10 flex flex-wrap gap-2">
          {doc.stack.map((s) => (
            <li
              key={s}
              className="rounded-sm border border-border bg-surface px-2 py-1 font-mono text-2xs text-fg-muted"
            >
              {s}
            </li>
          ))}
        </ul>
      </header>

      <div className="mt-12">
        <MDX code={doc.body} />
      </div>
    </article>
  );
}
