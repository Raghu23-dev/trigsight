import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { MDX } from "../../../components/mdx";
import { projects, projectBySlug } from "../../../lib/content";

export function generateStaticParams() {
  return projects.map((p) => ({ slug: p.id.replace(/^projects\//, "") }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const doc = projectBySlug(slug);
  if (!doc) return {};
  return {
    title: doc.title,
    description: doc.summary,
    openGraph: { title: doc.title, description: doc.summary, type: "article" },
    alternates: { types: { "text/markdown": `${doc.path}/md` } },
  };
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const doc = projectBySlug(slug);
  if (!doc) notFound();

  return (
    <article className="mx-auto max-w-3xl px-6 py-20">
      <Link
        href="/projects"
        className="font-mono text-2xs uppercase tracking-[0.2em] text-fg-subtle hover:text-fg"
      >
        ← Projects
      </Link>

      <header className="mt-10">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-mono text-2xs uppercase tracking-[0.2em] text-fg-subtle">
            {doc.category}
          </span>
          <span className="font-mono text-2xs text-fg-subtle">{doc.period}</span>
        </div>
        <h1 className="mt-4 font-display text-3xl leading-tight tracking-tight text-fg">
          {doc.title}
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-fg-muted">{doc.summary}</p>

        {/* Verify-it-yourself strip. A reader who wants to check rather than read should not
            have to hunt for the live URL or the command. */}
        <div className="mt-8 grid gap-px overflow-hidden rounded border border-border bg-border sm:grid-cols-3">
          <a
            href={doc.live}
            rel="noreferrer noopener"
            className="bg-surface px-4 py-3 transition-colors hover:bg-surface-raised"
          >
            <span className="font-mono text-2xs uppercase tracking-wider text-fg-subtle">
              Live
            </span>
            <span className="mt-1 block truncate font-mono text-xs text-accent">
              {doc.live.replace(/^https:\/\//, "")}
            </span>
          </a>
          <a
            href={doc.repo}
            rel="noreferrer noopener"
            className="bg-surface px-4 py-3 transition-colors hover:bg-surface-raised"
          >
            <span className="font-mono text-2xs uppercase tracking-wider text-fg-subtle">
              Source
            </span>
            <span className="mt-1 block truncate font-mono text-xs text-accent">
              {doc.repo.replace(/^https:\/\/github\.com\//, "")}
            </span>
          </a>
          <div className="bg-surface px-4 py-3">
            <span className="font-mono text-2xs uppercase tracking-wider text-fg-subtle">
              Reproduce
            </span>
            <span className="mt-1 block truncate font-mono text-xs text-fg-muted">
              {doc.reproduce}
            </span>
          </div>
        </div>

        {doc.metrics.length > 0 && (
          <dl className="mt-px grid gap-px overflow-hidden rounded border border-border bg-border sm:grid-cols-4">
            {doc.metrics.map((m) => (
              <div key={m.label} className="bg-surface px-4 py-3">
                <dt className="font-mono text-2xs uppercase tracking-wider text-fg-subtle">
                  {m.label}
                </dt>
                <dd className="mt-1 font-mono text-sm text-fg">{m.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </header>

      <div className="mt-14">
        <MDX code={doc.body} />
      </div>

      <aside className="mt-16 border-l-2 border-warn pl-5">
        <h2 className="font-mono text-2xs uppercase tracking-[0.2em] text-fg-subtle">
          What does not work
        </h2>
        <p className="mt-3 leading-relaxed text-fg-muted">{doc.limitation}</p>
      </aside>

      {doc.stack.length > 0 && (
        <footer className="mt-14 border-t border-border pt-6">
          <ul className="flex flex-wrap gap-2">
            {doc.stack.map((tech) => (
              <li
                key={tech}
                className="rounded border border-border px-2 py-1 font-mono text-2xs text-fg-subtle"
              >
                {tech}
              </li>
            ))}
          </ul>
        </footer>
      )}
    </article>
  );
}
