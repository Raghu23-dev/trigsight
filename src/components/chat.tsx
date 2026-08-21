"use client";

import { useCallback, useRef, useState } from "react";
import { CitationChip } from "./citation-chip";
import { segment, type Allowlist } from "../lib/citation-token";

/**
 * Grounded chat.
 *
 * Accessibility note that drove the markup: a naive `aria-live="polite"` on a
 * streaming transcript makes a screen reader announce every token as it arrives,
 * which is unusable. The transcript is therefore `role="log" aria-live="off"`, and
 * a separate visually-hidden `role="status"` element announces discrete state
 * changes only ("answering", "answer complete").
 */

interface Turn {
  readonly role: "user" | "assistant";
  readonly content: string;
}

const SUGGESTIONS = [
  "How do you stop a reconnecting client duplicating events?",
  "Was the failure caused by input size or output size?",
  "How do approval gates avoid failing open?",
  "Why fuse retrieval by rank instead of score?",
];

export function Chat({ allowlist }: { allowlist: Allowlist }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [state, setState] = useState<"idle" | "answering" | "error">("idle");
  const [notice, setNotice] = useState("");
  const abort = useRef<AbortController | null>(null);

  const send = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (q.length === 0 || state === "answering") return;

      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;

      const history: Turn[] = [...turns, { role: "user", content: q }];
      setTurns(history);
      setInput("");
      setState("answering");
      setNotice("Answering");

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages: history }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const body: unknown = await res.json().catch(() => null);
          const message =
            typeof body === "object" && body !== null && "error" in body
              ? String((body as { error: unknown }).error)
              : `request failed (${res.status})`;
          throw new Error(message);
        }

        const contentType = res.headers.get("content-type") ?? "";

        // Retrieval-only mode: no model credentials configured. Surfaced plainly
        // rather than rendered as an answer, so the reader is never misled about
        // whether a model spoke.
        if (contentType.includes("application/json")) {
          const body = (await res.json()) as { note?: string };
          setTurns([
            ...history,
            {
              role: "assistant",
              content:
                body.note ??
                "Retrieval ran, but no model is configured in this environment.",
            },
          ]);
          setState("idle");
          setNotice("Retrieval complete");
          return;
        }

        setTurns([...history, { role: "assistant", content: "" }]);
        await consumeStream(res, (delta) => {
          setTurns((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === "assistant") {
              next[next.length - 1] = { role: "assistant", content: last.content + delta };
            }
            return next;
          });
        });

        setState("idle");
        setNotice("Answer complete");
      } catch (err) {
        if (controller.signal.aborted) return;
        setState("error");
        setNotice("Something went wrong");
        setTurns([
          ...history,
          {
            role: "assistant",
            content:
              err instanceof Error
                ? `That did not work: ${err.message}`
                : "That did not work.",
          },
        ]);
      }
    },
    [state, turns],
  );

  return (
    <section className="mt-10">
      <div
        role="log"
        aria-live="off"
        aria-label="Conversation"
        className="space-y-6"
      >
        {turns.map((turn, i) => (
          <Message key={i} turn={turn} allowlist={allowlist} />
        ))}
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {notice}
      </p>

      {turns.length === 0 && (
        <ul className="flex flex-col gap-2">
          {SUGGESTIONS.map((s) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => void send(s)}
                className="w-full rounded border border-border bg-surface px-3 py-2.5 text-left text-sm text-fg-muted transition-colors hover:border-accent-dim hover:text-fg"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="mt-8 flex gap-2"
      >
        <label htmlFor="chat-input" className="sr-only">
          Ask about this work
        </label>
        <input
          id="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about the engineering…"
          maxLength={1200}
          autoComplete="off"
          className="min-w-0 flex-1 rounded border border-border bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-fg-subtle focus-visible:border-accent"
        />
        <button
          type="submit"
          disabled={state === "answering" || input.trim().length === 0}
          className="rounded border border-border bg-surface-raised px-4 py-2.5 font-mono text-2xs uppercase tracking-wider text-fg transition-colors hover:border-accent-dim disabled:opacity-40"
        >
          {state === "answering" ? "…" : "Ask"}
        </button>
      </form>

      <p className="mt-3 font-mono text-2xs leading-relaxed text-fg-subtle">
        Answers are grounded in the case studies on this site. Every citation links
        to the exact sentence that supports it, verified at build time.
      </p>
    </section>
  );
}

function Message({ turn, allowlist }: { turn: Turn; allowlist: Allowlist }) {
  if (turn.role === "user") {
    return (
      <div>
        <p className="font-mono text-2xs uppercase tracking-wider text-fg-subtle">You</p>
        <p className="mt-1.5 text-fg">{turn.content}</p>
      </div>
    );
  }

  const segments = segment(turn.content, allowlist);
  const prose = segments.filter((s) => s.type === "text").map((s) => s.text).join("");
  const citations = segments.filter((s) => s.type === "citation");

  return (
    <div>
      <p className="font-mono text-2xs uppercase tracking-wider text-accent">Answer</p>
      <div className="mt-1.5 whitespace-pre-wrap leading-relaxed text-fg-muted">
        {prose}
      </div>
      {citations.length > 0 && (
        <div className="mt-4">
          <p className="font-mono text-2xs uppercase tracking-wider text-fg-subtle">
            Sources — {citations.length} verified
          </p>
          {citations.map(
            (s, i) => s.citation !== undefined && <CitationChip key={i} citation={s.citation} />,
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Consume an OpenAI-style SSE stream.
 *
 * Buffers by `\n\n` frame rather than by line, because a chunk boundary can land
 * mid-frame and line-splitting a partial frame corrupts the JSON.
 */
async function consumeStream(res: Response, onDelta: (delta: string) => void): Promise<void> {
  const reader = res.body?.getReader();
  if (reader === undefined) return;

  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      for (const line of frame.split("\n")) {
        if (!line.startsWith("data:")) continue;
        // Per the SSE spec the space after "data:" is optional — strip it only
        // when present rather than assuming a fixed offset.
        const payload = line.slice(5).replace(/^ /, "");
        if (payload === "[DONE]") return;
        try {
          const parsed = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const delta = parsed.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta.length > 0) onDelta(delta);
        } catch {
          // A frame that is not JSON is a keep-alive or comment; ignore it.
        }
      }
    }
  }
}
