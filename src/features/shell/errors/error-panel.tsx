"use client";

import Link from "next/link";
import { CircleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { INTENT_TEXT_CLASSES } from "@/components/status/intent-classes";
import { cn } from "@/lib/utils";

import { presentError } from "./error-presentation";

/**
 * What every error boundary renders — spec 01 §D2, `TECHNICAL_SPEC.md` §10.3.
 *
 * One panel, four boundaries, so the sentence a user quotes to support is the
 * same one wherever the failure happened.
 *
 * **The reference is the only internal identifier that ever appears**, and only
 * on a 5xx. It is Next.js's own error digest, which is precisely the handle that
 * joins this screen to the server log line — the thing a support conversation
 * starts with. Where there is no digest, no reference is shown: inventing an id
 * that appears in no log is worse than showing none.
 *
 * No stack trace, no message from the thrown error, no provider name, no tenant
 * data. Nothing here expresses a compliance outcome the system did not compute,
 * and nothing expresses a probability of ignition (Rules 1.25, 3.10, 10.3).
 */

export interface ErrorPanelProps {
  readonly error: unknown;
  /** Next.js's error digest, where the runtime produced one. */
  readonly reference?: string | undefined;
  /** The boundary's `reset`, where the boundary has one. */
  readonly onRetry?: () => void;
  /** Where the "somewhere safe" link goes. */
  readonly homeHref?: string;
  readonly homeLabel?: string;
}

export function ErrorPanel({
  error,
  reference,
  onRetry,
  homeHref = "/",
  homeLabel = "Go to the dashboard",
}: ErrorPanelProps) {
  const presentation = presentError(error);
  const showsReference =
    presentation.showsReference && reference !== undefined && reference !== "";

  return (
    <section
      role="alert"
      data-error-panel
      className="mx-auto flex w-full max-w-[72ch] flex-col gap-4 py-12"
    >
      <h1
        id="page-title"
        tabIndex={-1}
        className="flex items-start gap-3 text-h1 lg:text-display"
      >
        <CircleAlert
          aria-hidden="true"
          className={cn("mt-1 size-7 shrink-0", INTENT_TEXT_CLASSES.critical)}
        />
        {presentation.title}
      </h1>

      <p className="text-body">{presentation.body}</p>

      {showsReference ? (
        <p className="text-caption text-muted-foreground">
          Reference{" "}
          <span data-error-reference className="font-mono select-all">
            {reference}
          </span>
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3 pt-2">
        {presentation.retryable && onRetry !== undefined ? (
          <Button
            type="button"
            size="lg"
            className="min-h-11"
            onClick={onRetry}
          >
            Try again
          </Button>
        ) : null}
        <Button asChild variant="outline" size="lg" className="min-h-11">
          <Link href={homeHref}>{homeLabel}</Link>
        </Button>
      </div>
    </section>
  );
}
