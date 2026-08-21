import Link from "next/link";
import type { ReactElement, ReactNode } from "react";

import {
  INTENT_ICON,
  INTENT_SURFACE_CLASSES,
  INTENT_TEXT_CLASSES,
} from "@/components";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { isAppError } from "@/lib/errors";
import { cn } from "@/lib/utils";

/**
 * The chrome every dashboard region renders inside — `UX_SPEC.md` §3.4.
 *
 * **Each region on `/` fails, loads and empties on its own.** §3.4 is explicit
 * that *a failed alerts fetch never blanks the whole page*, so a region reads
 * its own data inside its own `<Suspense>` boundary, catches its own failure and
 * renders the states below. The segment-level `error.tsx` stays for a failure
 * that is genuinely the page's.
 *
 * These are region states, not `UX_SPEC.md` §2 components: the dashboard has no
 * §2 state table of its own, so nothing here invents one. What it does carry is
 * the `data-region-state` attribute the rest of the codebase already uses on its
 * components, so a test reads the state rather than guessing at classes.
 */

export type DashboardRegionState = "default" | "loading" | "error" | "empty";

export interface DashboardRegionProps {
  /** Stable, lowercase, kebab — it becomes the heading id and the test hook. */
  readonly id: string;
  readonly title: string;
  readonly state?: DashboardRegionState;
  /** A control or link belonging to the region heading, not to a row. */
  readonly headingAction?: ReactNode;
  readonly children: ReactNode;
}

export function DashboardRegion({
  id,
  title,
  state = "default",
  headingAction,
  children,
}: DashboardRegionProps): ReactElement {
  const headingId = `dashboard-region-${id}`;

  return (
    <section
      aria-labelledby={headingId}
      data-dashboard-region={id}
      data-region-state={state}
      className="flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id={headingId} className="text-h2">
          {title}
        </h2>
        {headingAction}
      </div>
      {children}
    </section>
  );
}

/**
 * A region that could not be read.
 *
 * `critical`, with **Retry**, and the heading stays rendered above it so the
 * reader keeps their place (`UX_SPEC.md` §2.7, §2.11). The correlation id
 * appears on a 5xx and never on a 4xx (`TECHNICAL_SPEC.md` §10.3).
 */
export function DashboardRegionError({
  message,
  correlationId,
  retryHref,
}: {
  readonly message: string;
  readonly correlationId?: string;
  readonly retryHref: string;
}): ReactElement {
  const Icon = INTENT_ICON.critical;

  return (
    <Card
      role="alert"
      data-region-state="error"
      className={cn("gap-0 border", INTENT_SURFACE_CLASSES.critical)}
    >
      <CardContent className="flex flex-col items-start gap-2 py-1">
        <div className="flex items-start gap-3">
          <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <p className="max-w-[72ch] text-body-strong">{message}</p>
        </div>
        {correlationId === undefined ? null : (
          <span data-correlation-id="true" className="text-mono">
            {correlationId}
          </span>
        )}
        <Button asChild variant="outline" size="lg" className="min-h-11">
          <Link href={retryHref}>Retry</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * A region with nothing in it — **all four parts** (`UX_SPEC.md` §5 preamble):
 * what is true, why, the single most useful next action, and who can take it
 * where this role cannot.
 *
 * `intent` is `neutral` by default and `ok` where the emptiness is a good state
 * — *"Nothing to review"* is an achievement, not an absence, and it is styled as
 * one.
 */
export function DashboardRegionEmpty({
  title,
  description,
  action,
  whoCanAct,
  intent = "neutral",
}: {
  readonly title: string;
  readonly description?: string;
  readonly action?: { readonly label: string; readonly href: string };
  readonly whoCanAct?: string;
  readonly intent?: "neutral" | "ok";
}): ReactElement {
  const Icon = INTENT_ICON[intent];

  return (
    <Card data-region-state="empty" data-intent={intent} className="gap-0">
      <CardContent className="flex flex-col gap-2 py-1">
        <div className="flex items-start gap-3">
          <Icon
            aria-hidden="true"
            className={cn(
              "mt-0.5 size-5 shrink-0",
              INTENT_TEXT_CLASSES[intent],
            )}
          />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="max-w-[72ch] text-body-strong">{title}</p>
            {description === undefined ? null : (
              <p className="max-w-[72ch] text-body">{description}</p>
            )}
            {whoCanAct === undefined ? null : (
              <p className="max-w-[72ch] text-caption text-muted-foreground">
                {whoCanAct}
              </p>
            )}
          </div>
        </div>
        {action === undefined ? null : (
          <div className="pt-1 pl-8">
            <Button asChild variant="outline" size="lg" className="min-h-11">
              <Link href={action.href}>{action.label}</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * A region's first paint.
 *
 * **The same shape as the loaded region, never a spinner on an empty page**
 * (`UX_SPEC.md` §2.7, §6.3) — the heading is already rendered by the caller, so
 * only the body is stood in for.
 */
export function DashboardRegionSkeleton({
  rows = 2,
  rowClassName = "h-20",
}: {
  readonly rows?: number;
  readonly rowClassName?: string;
}): ReactElement {
  return (
    <div data-region-state="loading" className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_unused, index) => (
        <Skeleton
          key={index}
          className={cn("w-full rounded-lg", rowClassName)}
        />
      ))}
    </div>
  );
}

export interface RegionFailure {
  readonly message: string;
  /** Present only on a 5xx. */
  readonly correlationId?: string;
}

/**
 * What a caught region failure tells the reader.
 *
 * **Nothing is swallowed** (`TECHNICAL_SPEC.md` §10.1): the caller logs the
 * cause and this turns it into the sentence the reader gets. An `AppError`
 * already carries a user message written to §10.3's rules; anything else gets
 * the region's own fallback rather than a stack trace, a SQL error or an
 * internal id.
 */
export function describeRegionFailure(
  cause: unknown,
  fallbackMessage: string,
): RegionFailure {
  if (!isAppError(cause)) return { message: fallbackMessage };
  return {
    message: cause.userMessage,
    ...(cause.httpStatus >= 500 && cause.correlationId !== undefined
      ? { correlationId: cause.correlationId }
      : {}),
  };
}
