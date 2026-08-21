/**
 * T-08 · Intake session status
 *
 * **Stored on:** `intake_session.status`
 * **Cardinality:** single-select · **Phase:** B1a
 *
 * Tracks a single pass through the intake flow so an interrupted intake can be resumed rather than lost.
 *
 * `failed` is a recoverable state, not a lost one: captured photos are retained and
 * the session resumes by retry or by the manual entry path (EC-14).
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-08, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const INTAKE_SESSION_STATUSES = [
  "open",
  "extracting",
  "awaiting_confirmation",
  "completed",
  "failed",
  "abandoned",
] as const;

export type IntakeSessionStatus = (typeof INTAKE_SESSION_STATUSES)[number];

/**
 * Stored value to display label. **The only place a T-08 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const INTAKE_SESSION_STATUS_LABELS: Readonly<
  Record<IntakeSessionStatus, string>
> = {
  open: "In progress",
  extracting: "Reading label",
  awaiting_confirmation: "Awaiting confirmation",
  completed: "Completed",
  failed: "Failed",
  abandoned: "Abandoned",
};
