/**
 * T-14 · Waste classification basis code
 *
 * **Stored on:** `classification_decision.basis_codes`
 * **Cardinality:** multi-select, minimum one · **Phase:** B1a
 *
 * Records *why* a record landed in the waste classification it did, so an auditor can read the reasoning rather than trusting the outcome.
 *
 * `chemistry_unconfirmed` is the only basis code valid alongside `undetermined`.
 *
 * `manual_override` is P6-only, requires a stated reason on the decision row, is
 * written as a superseding decision rather than an edit, and is separately
 * listable in the audit export (Rules 3.26–3.28).
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-14, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const CLASSIFICATION_BASIS_CODES = [
  "federal_default",
  "jurisdiction_override",
  "chemistry_out_of_scope",
  "damage_state",
  "handler_size_threshold",
  "handler_election",
  "chemistry_unconfirmed",
  "manual_override",
] as const;

export type ClassificationBasisCode =
  (typeof CLASSIFICATION_BASIS_CODES)[number];

/**
 * Stored value to display label. **The only place a T-14 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const CLASSIFICATION_BASIS_CODE_LABELS: Readonly<
  Record<ClassificationBasisCode, string>
> = {
  federal_default: "Federal default treatment",
  jurisdiction_override: "State or local rule applies",
  chemistry_out_of_scope: "Chemistry outside the light category",
  damage_state: "Damaged, defective or recalled",
  handler_size_threshold: "Handler size threshold reached",
  handler_election: "Handler elected fuller treatment",
  chemistry_unconfirmed: "Chemistry not confirmed",
  manual_override: "Manual override by platform admin",
};
