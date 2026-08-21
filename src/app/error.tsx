"use client";

import { useEffect } from "react";

import { ErrorPanel } from "@/features/shell/errors/error-panel";

/**
 * The root error boundary — `TECHNICAL_SPEC.md` §10.3, spec 01 §D2.
 *
 * It catches what happens above both route groups, and anything in a segment
 * whose own boundary is not in play. The root layout still renders around it, so
 * the theme, the font and the toaster survive.
 *
 * The two group boundaries are the ones that normally fire:
 * `src/app/(app)/error.tsx` keeps the shell, and the auth group has its own with
 * no shell at all.
 */
export default function RootError({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    console.error("[root] error", error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col px-4 md:px-6 lg:px-8">
      <ErrorPanel error={error} reference={error.digest} onRetry={reset} />
    </main>
  );
}
