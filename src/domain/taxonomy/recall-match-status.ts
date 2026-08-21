/**
 * T-35 · Recall match status
 *
 * **Stored on:** `recall_match.status`
 * **Cardinality:** single-select · **Phase:** B2
 *
 * Records whether a battery record matches a published recall, because a recall match carries immediate liability consequences for the holder.
 *
 * **A failed check is recorded as a pending state with a reason, never as an absent
 * row.** A source that could not be reached is recorded, not swallowed.
 *
 * A match is a candidate until a human confirms it (Rule 10.7). Removing a
 * confirmed association is held to Rule 6.11's discipline, so clearing a recall
 * flag cannot become a route around the air prohibition (Rule 6.24).
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-35, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const RECALL_MATCH_STATUSES = [
  "not_checked",
  "no_match",
  "possible_match",
  "confirmed_match",
  "dismissed",
] as const;

export type RecallMatchStatus = (typeof RECALL_MATCH_STATUSES)[number];

/**
 * Stored value to display label. **The only place a T-35 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const RECALL_MATCH_STATUS_LABELS: Readonly<
  Record<RecallMatchStatus, string>
> = {
  not_checked: "Not checked",
  no_match: "No match",
  possible_match: "Possible match — needs review",
  confirmed_match: "Confirmed match",
  dismissed: "Dismissed",
};
