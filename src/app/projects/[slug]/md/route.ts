import { projects, projectBySlug } from "../../../../lib/content";

/**
 * Plain-markdown variant of a project writeup.
 *
 * Same reasoning as the work variant: markdown is cheaper for an agent to parse than HTML and
 * carries no layout noise. Not an SEO measure — llms.txt-style files have been measured as inert.
 *
 * The header carries `live`, `repo` and `reproduce` because those are the fields that let a
 * reader stop reading and start checking, and an agent summarising this page should surface them
 * rather than paraphrase the prose. `limitation` is included for the same reason it is required
 * by the schema: a summary that reproduces only the headline number would misrepresent the work.
 */
export const dynamic = "force-static";

export function generateStaticParams() {
  return projects.map((p) => ({ slug: p.id.replace(/^projects\//, "") }));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params;
  const doc = projectBySlug(slug);
  if (doc === undefined) return new Response("Not found", { status: 404 });

  const header = [
    `# ${doc.title}`,
    "",
    `> ${doc.summary}`,
    "",
    `**Result:** ${doc.headline}  `,
    `**Live:** ${doc.live}  `,
    `**Source:** ${doc.repo}  `,
    `**Reproduce:** \`${doc.reproduce}\`  `,
    `**Category:** ${doc.category}  `,
    `**Period:** ${doc.period}  `,
    `**Stack:** ${doc.stack.join(", ")}`,
    "",
    `**What does not work:** ${doc.limitation}`,
    "",
    ...(doc.metrics.length > 0
      ? [
          "| Metric | Value | Independently verifiable |",
          "|---|---|---|",
          ...doc.metrics.map((m) => `| ${m.label} | ${m.value} | ${m.verified ? "yes" : "no"} |`),
          "",
        ]
      : []),
    "---",
    "",
  ].join("\n");

  const body = doc.raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim();

  return new Response(`${header}${body}\n`, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
