/**
 * T-53 · Intake step
 *
 * **Stored on:** `intake_session.current_step`
 * **Cardinality:** single-select · **Phase:** B1a
 *
 * Records which step of the fixed intake pipeline a session is on, so an interrupted session resumes where it stopped.
 *
 * **Single-select, system-assigned.** Users do not set it directly.
 *
 * **The order is fixed and code-orchestrated.** No step may be skipped,
 * reordered, run in parallel or chosen at runtime, and no model selects the next
 * step (Rules 2.2, 2.3).
 *
 * **The step index also lives in the URL** as `?step=` so the flow is
 * deep-linkable and resumable (`SITE_ARCHITECTURE.md` §1.3). The URL and this
 * column agree; the column is the durable one.
 *
 * **A step may be revisited.** Moving back from step 3 to step 2 is ordinary and
 * does not discard captured work.
 *
 * **Distinct from T-08.** T-08 is the session's lifecycle status; this is its
 * position in the flow. A session may be `awaiting_confirmation` (T-08) at
 * `extraction_review` (T-53).
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-53, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const INTAKE_STEPS = [
  "capture",
  "extraction_review",
  "confirm_and_place",
  "complete",
] as const;

export type IntakeStep = (typeof INTAKE_STEPS)[number];

/**
 * Stored value to display label. **The only place a T-53 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const INTAKE_STEP_LABELS: Readonly<Record<IntakeStep, string>> = {
  capture: "Photo",
  extraction_review: "Extraction review",
  confirm_and_place: "Confirm and place",
  complete: "Complete",
};
