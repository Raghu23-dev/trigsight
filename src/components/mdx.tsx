"use client";

import * as runtime from "react/jsx-runtime";

/**
 * Renders Velite-compiled MDX.
 *
 * Velite outputs a function body string, evaluated once per document. This is the
 * documented Velite integration; the content is authored in-repo and never
 * user-supplied, so there is no untrusted input path here. Content from the model
 * takes a different route entirely — it is sanitised markdown, never MDX.
 */
const useMDXComponent = (code: string) => {
  const fn = new Function(code);
  return fn({ ...runtime }).default;
};

const components = {
  h2: (p: React.ComponentProps<"h2">) => (
    <h2
      className="mt-14 font-display text-xl tracking-tight text-fg first:mt-0"
      {...p}
    />
  ),
  h3: (p: React.ComponentProps<"h3">) => (
    <h3 className="mt-10 font-display text-lg tracking-tight text-fg" {...p} />
  ),
  p: (p: React.ComponentProps<"p">) => (
    <p className="mt-5 leading-[1.75] text-fg-muted" {...p} />
  ),
  ul: (p: React.ComponentProps<"ul">) => (
    <ul className="mt-5 list-disc space-y-2 pl-5 text-fg-muted" {...p} />
  ),
  li: (p: React.ComponentProps<"li">) => <li className="leading-relaxed" {...p} />,
  strong: (p: React.ComponentProps<"strong">) => (
    <strong className="font-semibold text-fg" {...p} />
  ),
  table: (p: React.ComponentProps<"table">) => (
    <div className="mt-8 overflow-x-auto rounded border border-border">
      <table className="w-full border-collapse text-sm" {...p} />
    </div>
  ),
  th: (p: React.ComponentProps<"th">) => (
    <th
      className="border-b border-border bg-surface px-4 py-2.5 text-left font-mono text-2xs uppercase tracking-wider text-fg-subtle"
      {...p}
    />
  ),
  td: (p: React.ComponentProps<"td">) => (
    <td className="border-b border-border/50 px-4 py-2.5 tabular text-fg-muted" {...p} />
  ),
  code: (p: React.ComponentProps<"code">) => (
    <code
      className="rounded-sm bg-surface-raised px-1.5 py-0.5 font-mono text-[0.85em] text-fg"
      {...p}
    />
  ),
};

export function MDX({ code }: { code: string }) {
  const Component = useMDXComponent(code);
  return <Component components={components} />;
}
