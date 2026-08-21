"use client";

import { useEffect } from "react";

import { ErrorPanel } from "@/features/shell/errors/error-panel";

/**
 * The authenticated group's error boundary — `TECHNICAL_SPEC.md` §10.3,
 * spec 01 §D2.
 *
 * **It replaces the segment, not the layout**, so the shell, the navigation and
 * the command palette stay reachable: a person whose battery list failed to load
 * can still open the dashboard, and does not have to go back through sign-in to
 * do it.
 *
 * `reset` re-runs the failed render, which is the right retry for a transient
 * read — the mock's seeded `INTEGRATION` failure is exactly that shape.
 */
export default function AppSegmentError({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    // Nothing is swallowed. The boundary shows a sentence; the console keeps the
    // detail the sentence deliberately does not carry.
    console.error("[app] segment error", error);
  }, [error]);

  return <ErrorPanel error={error} reference={error.digest} onRetry={reset} />;
}
