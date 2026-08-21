"use client";

import { lazy, Suspense, useEffect, useState } from "react";

/**
 * Scene gate.
 *
 * Everything three.js is behind a dynamic import that only resolves once every
 * guard passes, so the ~110 KB of WebGL never enters the initial payload — and on a
 * device that should not run it, never downloads at all.
 *
 * The guards, in the order they run and why:
 *
 * 1. `prefers-reduced-motion` — skip entirely. A reduced-motion user asked for no
 *    animation, and a "calmer" animation is still animation.
 * 2. `navigator.connection.saveData` — a user on metered data should not spend it
 *    on decoration.
 * 3. WebGL2 capability probe — R3F context-creation failures surface as async
 *    rejections that cannot be caught by an error boundary, so capability is tested
 *    on a throwaway canvas first.
 * 4. Coarse device-memory / core-count heuristic — a weak GPU renders this at a
 *    frame rate that reads as broken. Absence reads as intent; stutter does not.
 * 5. `requestIdleCallback` — mount after the hero has painted, so the scene can
 *    never compete with LCP.
 */

const Field = lazy(() => import("./field"));

type Decision = "pending" | "mount" | "skip";

function canRun(): boolean {
  if (typeof window === "undefined") return false;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;

  const conn = (
    navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
  ).connection;
  if (conn?.saveData === true) return false;
  if (conn?.effectiveType === "slow-2g" || conn?.effectiveType === "2g") return false;

  // Capability probe on a throwaway canvas. Cheaper than mounting R3F and finding
  // out, and catchable — unlike R3F's own failure path.
  try {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2");
    if (gl === null) return false;
    // Release immediately; a leaked context counts against the browser's limit.
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    return false;
  }

  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (typeof mem === "number" && mem <= 2) return false;
  if (typeof navigator.hardwareConcurrency === "number" && navigator.hardwareConcurrency <= 2) {
    return false;
  }

  return true;
}

export function Scene() {
  // LAZY INITIAL STATE, not a setState inside the effect.
  //
  // `canRun()` reads `navigator` and `window`, so it cannot run during a server render — hence
  // the typeof guard, which yields "pending" on the server and a real decision on the client's
  // first render.
  //
  // The earlier version started at "pending" and called setDecision("skip") synchronously inside
  // the effect. That is a cascading render for every visitor whose device fails a guard — which
  // is exactly the low-powered device the guard exists to protect. Caught by ESLint's
  // react-hooks/set-state-in-effect rule, which had never run because `next lint` was removed in
  // Next 16 and the script had been silently broken.
  const [decision, setDecision] = useState<Decision>(() =>
    typeof window === "undefined" ? "pending" : canRun() ? "pending" : "skip",
  );

  useEffect(() => {
    if (decision === "skip") return;

    const idle =
      (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
        .requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 400));

    const handle = idle(() => setDecision("mount"), { timeout: 2500 });
    return () => {
      const cancel = (window as Window & { cancelIdleCallback?: (h: number) => void })
        .cancelIdleCallback;
      if (cancel !== undefined) cancel(handle as number);
      else window.clearTimeout(handle as number);
    };
  }, [decision]);

  if (decision !== "mount") return null;

  return (
    <Suspense fallback={null}>
      <Field />
    </Suspense>
  );
}
