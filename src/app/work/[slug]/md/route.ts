import { work, workBySlug } from "../../../../lib/content";

/**
 * Plain-markdown variant of a case study.
 *
 * Served because it is genuinely useful to an agent reading the site — markdown is
 * cheaper to parse than HTML and carries no layout noise. Deliberately NOT framed as
 * an SEO measure: llms.txt-style files have been measured as inert (97% received zero
 * requests) and search engines have explicitly declined to consume them.
 */
export const dynamic = "force-static";

export function generateStaticParams() {
  return work.map((w) => ({ slug: w.id.replace(/^work\//, "") }));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params;
  const doc = workBySlug(slug);
  if (doc === undefined) return new Response("Not found", { status: 404 });

  const header = [
    `# ${doc.title}`,
    "",
    `> ${doc.summary}`,
    "",
    `**Category:** ${doc.category}  `,
    `**Period:** ${doc.period}  `,
    `**Stack:** ${doc.stack.join(", ")}`,
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
