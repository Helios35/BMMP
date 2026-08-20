/**
 * T-45 · Classification decision status
 *
 * **Stored on:** `classification_decision.status`
 * **Cardinality:** single-select · **Phase:** B1a
 *
 * Tracks whether a waste classification decision is derivable, derived and governing, or replaced — because exactly one decision governs a battery record at a time and the replaced ones are the audit trail.
 *
 * **`blocked` is a real state, not an error.** A missing input blocks and is never
 * assumed (Rules 3.4, 3.10), and no document issues from it (Rules 3.12, 5.3).
 *
 * **Exactly one `active` decision per record** — never zero once identified, never
 * two (Rule 3.1), enforced by a partial unique index rather than asserted.
 *
 * A decision is never edited. Re-deciding inserts a superseding row (Rule 3.14).
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-45, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const CLASSIFICATION_DECISION_STATUSES = [
  "pending",
  "blocked",
  "active",
  "superseded",
] as const;

export type ClassificationDecisionStatus =
  (typeof CLASSIFICATION_DECISION_STATUSES)[number];

/**
 * Stored value to display label. **The only place a T-45 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const CLASSIFICATION_DECISION_STATUS_LABELS: Readonly<
  Record<ClassificationDecisionStatus, string>
> = {
  pending: "Pending",
  blocked: "Blocked",
  active: "Active",
  superseded: "Superseded",
};
