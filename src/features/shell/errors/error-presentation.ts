import { APP_ERROR_CODES, type AppErrorCode } from "@/lib/errors";

/**
 * What a user is told when something fails — `TECHNICAL_SPEC.md` §10.1, §10.3,
 * and spec 01 §D.
 *
 * `src/lib/errors.ts` owns the taxonomy and each error's own `userMessage`. This
 * owns the **boundary treatment**: the heading a full-page error carries, and
 * whether a correlation id is shown. Nothing here restates a rule and nothing
 * here invents a code.
 *
 * ## The four copy rules, and how they are met
 *
 * 1. Say what failed, what state the record is now in, and what to do next.
 * 2. **Show the reference on a 5xx only, never on a 4xx** — a validation
 *    message with an opaque id attached reads as a system fault when the user
 *    simply mistyped something.
 * 3. Never a stack trace, never a SQL error, never a provider name, never an
 *    internal id other than the reference.
 * 4. **Never state or imply a compliance outcome the system did not compute.**
 *    *"We could not classify this battery"* is correct; *"this battery is
 *    exempt"* when the rule failed to resolve is a legal problem rather than a
 *    copy problem (Rules 3.10, 3.12). And no error surface expresses a
 *    probability of ignition (Rules 1.25, 10.3).
 */

export interface ErrorPresentation {
  /** The heading. Plain language, and it never names a subsystem. */
  readonly title: string;
  /** What to do next. */
  readonly body: string;
  /** Whether the reference is offered — 5xx only (§10.3 rule 2). */
  readonly showsReference: boolean;
  /** Whether a **Try again** control is offered. */
  readonly retryable: boolean;
}

/**
 * Every code in `APP_ERROR_CODES`, and what a boundary makes of it.
 *
 * Several of these should never reach a full-page boundary at all — `VALIDATION`
 * belongs beside the field, `UNAUTHENTICATED` is a redirect, `FORBIDDEN` on a
 * route is a redirect with a toast, `NOT_FOUND` is `notFound()`. They are here
 * because *reaching* the boundary with one of them means something upstream did
 * not handle it, and the user still deserves a sentence rather than a blank
 * screen.
 */
export const ERROR_PRESENTATION: Readonly<
  Record<AppErrorCode, ErrorPresentation>
> = {
  VALIDATION: {
    title: "That didn't go through.",
    body: "Something in what was submitted wasn't accepted. Nothing was changed. Go back and check the highlighted fields.",
    showsReference: false,
    retryable: true,
  },
  UNAUTHENTICATED: {
    title: "You were signed out.",
    body: "Your work is here. Sign in again to pick up where you left off.",
    showsReference: false,
    retryable: false,
  },
  FORBIDDEN: {
    title: "That isn't available to your role.",
    body: "Nothing was changed. The dashboard is still open to you, and the person who manages roles for this organisation can tell you more.",
    showsReference: false,
    retryable: false,
  },
  NOT_FOUND: {
    title: "We couldn't find that record.",
    body: "It may have been removed, or the link may be wrong.",
    showsReference: false,
    retryable: false,
  },
  CONFLICT: {
    title: "This changed while you were working.",
    body: "Someone else got there first, so nothing you did was saved. Reload to see the current version and try again.",
    showsReference: false,
    retryable: true,
  },
  TENANT_SCOPE: {
    title: "That action is not available.",
    body: "Nothing was changed. If you keep seeing this, quote the reference below.",
    showsReference: true,
    retryable: false,
  },
  RULE_UNRESOLVED: {
    title: "No rule is on file for this.",
    body: "Nothing was decided and nothing was changed — the system will not fall back to a default. A Platform Admin has to publish the governing rule before this can go further.",
    showsReference: false,
    retryable: false,
  },
  INTEGRATION: {
    title: "We could not reach the records service.",
    body: "Nothing was changed. Try again, and quote the reference below if it keeps happening.",
    showsReference: true,
    retryable: true,
  },
  DOCUMENT_RENDER: {
    title: "The document could not be produced.",
    body: "Nothing was issued and nothing was changed. Try again, and quote the reference below if it keeps happening.",
    showsReference: true,
    retryable: true,
  },
  DOCUMENT_INTEGRITY: {
    title: "That document could not be verified.",
    body: "Do not rely on it. Nothing was changed. Quote the reference below.",
    showsReference: true,
    retryable: false,
  },
  DATA_INTEGRITY: {
    title: "Something went wrong.",
    body: "Nothing was changed. Try again, and quote the reference below if it keeps happening.",
    showsReference: true,
    retryable: true,
  },
  NOT_IMPLEMENTED: {
    title: "Something went wrong.",
    body: "This deployment is not configured to serve that. Nothing was changed. Quote the reference below.",
    showsReference: true,
    retryable: false,
  },
};

/** The treatment for anything that is not an `AppError` — a bug, not a handled condition. */
export const UNKNOWN_ERROR_PRESENTATION: ErrorPresentation =
  ERROR_PRESENTATION.DATA_INTEGRITY;

function isAppErrorCode(value: unknown): value is AppErrorCode {
  return (
    typeof value === "string" &&
    (APP_ERROR_CODES as readonly string[]).includes(value)
  );
}

/**
 * The treatment for an error that reached a boundary.
 *
 * **A boundary receives a client-side `Error`, not the `AppError` instance.** In
 * production Next.js replaces a server error's message and stack with a digest
 * before it crosses to the browser, so the `code` survives only where the error
 * was constructed on the client or the build is a development one. That is the
 * correct default — the alternative leaks server internals — so an error with no
 * readable code gets the generic 5xx treatment rather than a guess.
 */
export function presentError(error: unknown): ErrorPresentation {
  if (typeof error !== "object" || error === null) {
    return UNKNOWN_ERROR_PRESENTATION;
  }
  const code = (error as { code?: unknown }).code;
  return isAppErrorCode(code)
    ? ERROR_PRESENTATION[code]
    : UNKNOWN_ERROR_PRESENTATION;
}
