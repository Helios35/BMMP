/**
 * T-25 · Lot status
 *
 * **Stored on:** `lot.status`
 * **Cardinality:** single-select · **Phase:** B1a
 *
 * Tracks a lot — a grouping of containers assembled for movement, grading or reporting — through its life.
 *
 * A lot is a grouping, not a place. It has no fill level and no storage clock of
 * its own (Rule 4.23). It reports the earliest accumulation start date among its
 * contents, and reads overdue where any content container is overdue (Rule 4.24).
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-25, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const LOT_STATUSES = [
  "open",
  "closed",
  "allocated",
  "shipped",
  "dissolved",
] as const;

export type LotStatus = (typeof LOT_STATUSES)[number];

/**
 * Stored value to display label. **The only place a T-25 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const LOT_STATUS_LABELS: Readonly<Record<LotStatus, string>> = {
  open: "Open",
  closed: "Closed",
  allocated: "Allocated",
  shipped: "Shipped",
  dissolved: "Dissolved",
};
