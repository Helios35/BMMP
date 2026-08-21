/**
 * T-46 · Damage assessment status
 *
 * **Stored on:** `damage_assessment.status`
 * **Cardinality:** single-select · **Phase:** B1a
 *
 * Records whether a battery record has been assessed for damage and what the current human-confirmed finding is, because that finding drives quarantine routing and the air-transport prohibition.
 *
 * **Neither assessed state is terminal**, deliberately. Rule 6.11 provides exactly
 * one clearing path — a superseding human assessment finding no indicator present,
 * with a stated reason and at least one supporting photograph — and the reversal
 * stays permanently visible alongside the current assessment in every export
 * (Rule 6.12).
 *
 * `not_assessed` blocks a shipment: an unassessed record is incomplete and cannot
 * join one (Rule 6.1).
 *
 * The word is **assessed**, never *measured* (`_ANCHORS.md` §7.5).
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-46, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const DAMAGE_ASSESSMENT_STATUSES = [
  "not_assessed",
  "assessed_sound",
  "assessed_damaged",
  "superseded",
] as const;

export type DamageAssessmentStatus =
  (typeof DAMAGE_ASSESSMENT_STATUSES)[number];

/**
 * Stored value to display label. **The only place a T-46 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const DAMAGE_ASSESSMENT_STATUS_LABELS: Readonly<
  Record<DamageAssessmentStatus, string>
> = {
  not_assessed: "Not assessed",
  assessed_sound: "Assessed sound",
  assessed_damaged: "Assessed damaged",
  superseded: "Superseded",
};
