import type { IntakeSessionStatus } from "@/domain/taxonomy/intake-session-status";
import { INTAKE_STEPS, type IntakeStep } from "@/domain/taxonomy/intake-step";

/**
 * Where a session is in the intake flow — T-53, Rules 2.2, 2.3;
 * `SITE_ARCHITECTURE.md` §1.3.
 *
 * **The order is fixed and code-owned.** No step is skipped, reordered or chosen
 * at runtime, and no model picks the next one. `INTAKE_STEPS` (the taxonomy)
 * is the value list; this module owns the arithmetic on it — which index a
 * step has, which step an index names, and whether a requested step is
 * reachable from where the session actually is.
 *
 * **The column is the durable position; the URL is a view of it.** `?step=` is
 * how the flow deep-links and resumes, and a request for a step ahead of the
 * column is answered with the column, never the request.
 *
 * `intake_session.current_step` is typed `string` pending a fixture migration
 * (the fixtures store `completed`, `human_confirmation` and `photo_capture`,
 * none of which T-53 authors). {@link resolveIntakeStep} is the one place that
 * tolerance lives: it reads a T-53 value as itself and derives anything else
 * from the session's lifecycle status, so every screen sees a T-53 step.
 */

/** The steps a person moves through. `complete` is a terminal state, not a screen. */
export const INTAKE_FLOW_STEPS = [
  "capture",
  "extraction_review",
  "confirm_and_place",
] as const satisfies readonly IntakeStep[];

export type IntakeFlowStep = (typeof INTAKE_FLOW_STEPS)[number];

export type IntakeStepIndex = 1 | 2 | 3 | 4;

export interface IntakeStepPosition {
  readonly currentStep: string;
  readonly status: IntakeSessionStatus;
  readonly isReviewRequired: boolean;
}

function isIntakeStep(value: string): value is IntakeStep {
  return (INTAKE_STEPS as readonly string[]).includes(value);
}

/** One-based, as the URL and the stepper count. */
export function stepIndex(step: IntakeStep): IntakeStepIndex {
  const index = INTAKE_STEPS.indexOf(step) + 1;
  // INTAKE_STEPS has exactly four members; the cast states that, not hopes it.
  return index as IntakeStepIndex;
}

/** The step a one-based index names, or `null` for anything off the list. */
export function stepFromIndex(index: number): IntakeStep | null {
  if (!Number.isInteger(index) || index < 1 || index > INTAKE_STEPS.length) {
    return null;
  }
  return INTAKE_STEPS[index - 1] ?? null;
}

/**
 * The T-53 step a session is on.
 *
 * A recognised `currentStep` is returned as stored. Anything else is derived
 * from the lifecycle status, which is the only other thing the row says about
 * where it is: `completed` is at `complete`; `awaiting_confirmation` is at
 * `extraction_review`, because that status is what the gate sets when it hands
 * over to a person; a session the gate has marked for review but whose step
 * never caught up is likewise at review; and everything else — open, still
 * extracting, failed, abandoned — is back at `capture`, where the photos it
 * kept are (EC-14).
 */
export function resolveIntakeStep(session: IntakeStepPosition): IntakeStep {
  if (isIntakeStep(session.currentStep)) return session.currentStep;
  if (session.status === "completed") return "complete";
  if (session.status === "awaiting_confirmation") return "extraction_review";
  if (session.isReviewRequired) return "extraction_review";
  return "capture";
}

/**
 * Whether `requested` may be opened for this session.
 *
 * Never ahead of where the session is — a step the pipeline has not reached
 * has nothing to show and a URL cannot move the pipeline (Rule 2.2). Revisiting
 * an earlier step is ordinary and discards nothing (T-53). A completed session
 * is closed to the flow: its record is edited on `/batteries/[id]`, not by
 * re-entering intake. An abandoned session opens nothing until it is resumed
 * by a status change, which is not this function's business.
 */
export function canOpenStep(
  session: IntakeStepPosition,
  requested: IntakeStep,
): boolean {
  if (session.status === "abandoned") return false;
  if (session.status === "completed") return requested === "complete";
  return stepIndex(requested) <= stepIndex(resolveIntakeStep(session));
}

/** The flow step after `step`, or `null` at the end of the flow. */
export function nextStep(step: IntakeStep): IntakeStep | null {
  return stepFromIndex(stepIndex(step) + 1);
}

/** The flow step before `step`, or `null` at the start. */
export function prevStep(step: IntakeStep): IntakeStep | null {
  return stepFromIndex(stepIndex(step) - 1);
}
