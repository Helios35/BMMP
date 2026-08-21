"use client";

import { useEffect } from "react";

import { INTENT_SURFACE_CLASSES } from "@/components/status/intent-classes";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The `(auth)` group's error boundary — `TECHNICAL_SPEC.md` §10.3.
 *
 * No shell and no navigation, because there is neither here. It states what
 * failed, what state things are in and what to do next, and it shows the digest
 * — Next's redacted correlation id for a server error — because this boundary
 * only ever catches a 5xx (§10.3 rule 2: the id on a 5xx, never on a 4xx).
 *
 * **It says nothing about credentials, accounts or organizations.** A caller
 * here has proved nothing, so an error that named any of them would disclose
 * across the boundary Rule 1.2 draws.
 */
export default function AuthError({
  error,
  reset,
}: {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    // Nothing is swallowed (`src/lib/errors.ts`). The boundary renders, and the
    // original still reaches the log with its stack intact.
    console.error("[auth] unhandled error in the (auth) group", error);
  }, [error]);

  return (
    <Alert
      className={cn(INTENT_SURFACE_CLASSES.critical, "gap-2 px-4 py-4")}
      role="alert"
    >
      <AlertTitle className="text-body-strong">
        Something went wrong.
      </AlertTitle>
      <AlertDescription className="grid gap-3 text-body text-current">
        <p>Nothing was changed. Try again.</p>
        {error.digest === undefined ? null : (
          <p className="text-caption">
            Quote this if you contact support:{" "}
            <span className="text-mono">{error.digest}</span>
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="min-h-11 self-start"
          onClick={reset}
        >
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  );
}
