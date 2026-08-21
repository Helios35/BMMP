/**
 * T-58 · Classification decision scope
 *
 * **Stored on:** `classification_decision.decision_scope`
 * **Cardinality:** single-select · **Phase:** B1a
 *
 * Names which subject a classification decision was made about, since the same table records decisions at three grains.
 *
 * **Single-select, and it names whichever of the three foreign keys is
 * non-null.** Exactly one is non-null; the scope and the key never disagree.
 *
 * **A record carries exactly one active decision** at `battery_record` scope
 * (Rule 3.1), enforced by a partial unique index on `status = 'active'`.
 *
 * **Classification runs only after identification is confirmed** (Rule 3.3) and
 * reads the rule version in force on the record's **intake date** in the
 * **site's** jurisdiction (Rules 3.5, 3.6).
 *
 * **A missing site jurisdiction profile blocks the decision and never defaults
 * it** (Rule 3.10; E-13). There is no fallback, no "assume federal" and no
 * placeholder citation.
 *
 * **Re-classification supersedes; it never overwrites** (Rule 3.14), and a new
 * rule version never retroactively re-classifies a departed shipment
 * (Rule 3.16).
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-58, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const CLASSIFICATION_DECISION_SCOPES = [
  "battery_record",
  "container",
  "shipment",
] as const;

export type ClassificationDecisionScope =
  (typeof CLASSIFICATION_DECISION_SCOPES)[number];

/**
 * Stored value to display label. **The only place a T-58 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const CLASSIFICATION_DECISION_SCOPE_LABELS: Readonly<
  Record<ClassificationDecisionScope, string>
> = {
  battery_record: "Battery record",
  container: "Container",
  shipment: "Shipment",
};
