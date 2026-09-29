"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Scroll-reveal wrapper.
 *
 * No reduced-motion branch here on purpose: globals.css already collapses every
 * transition/animation to 0.01ms under `prefers-reduced-motion: reduce`, so the
 * observer still fires and the class still toggles — the element just appears
 * instantly instead of animating. Duplicating that check per-component is the
 * anti-pattern the global rule exists to prevent.
 *
 * `once: true` semantics — an element that has revealed stays revealed, so
 * scrolling back up never re-hides content a visitor already read.
 */
export function Reveal({
  children,
  delayMs = 0,
  className = "",
}: {
  children: React.ReactNode;
  delayMs?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // LAZY INITIAL STATE, not a setState inside the effect — same shape of bug the
  // Scene component's history already found: computing the no-IntersectionObserver
  // fallback here is synchronous and free; doing it inside the effect body is a
  // cascading render caught by react-hooks/set-state-in-effect.
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");

  useEffect(() => {
    if (visible) return;
    const node = ref.current;
    if (node === null) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry !== undefined && entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div
      ref={ref}
      className={`reveal ${visible ? "is-visible" : ""} ${className}`}
      style={{ transitionDelay: visible ? `${delayMs}ms` : "0ms" }}
    >
      {children}
    </div>
  );
}
