import { INTAKE_FLOW_STEPS, stepIndex } from "@/domain/intake/steps";
import type { IntakeStep } from "@/domain/taxonomy/intake-step";

/**
 * The URLs of `/batteries/new` — `SITE_ARCHITECTURE.md` §1.3.
 *
 * **One place composes them.** The stepper, the resume notice, the *Resume
 * intake* link on a record and the route's own canonical redirect all name
 * the same URL shape, and four hand-written template strings would drift on
 * the first rename. Pure, so a server component and a client component read
 * the same function.
 *
 * `?step=` is one-based, as the stepper counts and as T-53 orders; the
 * session id is the durable position's key and the step is a view of it.
 */

export const INTAKE_ROUTE = "/batteries/new";

/** The `?step=` value for a flow step. `complete` is not a screen and has none. */
export function intakeStepParam(step: IntakeStep): number {
  return stepIndex(step);
}

/** `/batteries/new?session=<id>&step=<n>` — the canonical URL of one step of one session. */
export function intakeStepHref(sessionId: string, step: IntakeStep): string {
  return `${INTAKE_ROUTE}?session=${encodeURIComponent(sessionId)}&step=${intakeStepParam(step)}`;
}

/** The href for the stepper's `index` (zero-based), for a session or for none. */
export function intakeStepHrefAt(
  sessionId: string | null,
  index: number,
): string {
  const step = INTAKE_FLOW_STEPS[index];
  if (sessionId === null || step === undefined) return INTAKE_ROUTE;
  return intakeStepHref(sessionId, step);
}

/**
 * `?step=` as typed into an address bar, or `null` where it names nothing.
 *
 * A value off the list is not an error and not a guess — the route answers
 * with the session's own position (Rule 2.2).
 */
export function parseIntakeStepParam(
  value: string | null | undefined,
): number | null {
  if (value === undefined || value === null || !/^\d+$/.test(value))
    return null;
  const parsed = Number(value);
  return parsed >= 1 && parsed <= INTAKE_FLOW_STEPS.length ? parsed : null;
}
