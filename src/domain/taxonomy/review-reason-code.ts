/**
 * T-52 · Review reason code
 *
 * **Stored on:** `intake_session.review_reason_codes`
 * **Cardinality:** **multi-select** (`text[]`) · **Phase:** B1a
 *
 * States why a record is in the review queue, so the reviewer sees what to fix before opening the card, and so a backing-up queue can be read for its cause rather than its size.
 *
 * **Multi-select.** A record commonly carries more than one reason and every
 * applicable reason is recorded — a record that is both weakly matched and
 * low-confidence says so.
 *
 * **The gate verdict lives on `intake_session`, not on `label_extraction`**,
 * because the gate routes the record and not the field (`ERD.md` §5.5,
 * Rule 2.14).
 *
 * **Reason codes are diagnostic, never permissive.** No combination of them, and
 * no absence of them, allows a hard-gated field to commit without human
 * confirmation (Rules 2.13, 2.15, 2.17).
 *
 * **A record leaves the queue in exactly two ways: a human confirms it, or a
 * human voids it with a stated reason** (Rule 2.23). It never times out into a
 * confirmed state and it never ages out.
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-52, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const REVIEW_REASON_CODES = [
  "field_confidence_below_threshold",
  "catalog_match_score_below_threshold",
  "catalog_match_ambiguous",
  "no_catalog_match",
  "no_fields_extracted",
  "field_validation_failed",
  "extraction_failed",
  "session_abandoned",
] as const;

export type ReviewReasonCode = (typeof REVIEW_REASON_CODES)[number];

/**
 * Stored value to display label. **The only place a T-52 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const REVIEW_REASON_CODE_LABELS: Readonly<
  Record<ReviewReasonCode, string>
> = {
  field_confidence_below_threshold: "Low confidence on a field",
  catalog_match_score_below_threshold: "Weak catalog match",
  catalog_match_ambiguous: "Ambiguous catalog match",
  no_catalog_match: "No catalog match",
  no_fields_extracted: "Label unreadable",
  field_validation_failed: "Value failed validation",
  extraction_failed: "Extraction did not complete",
  session_abandoned: "Left unfinished",
};
