/**
 * T-22 · Battery record status
 *
 * **Stored on:** `battery_record.status`
 * **Cardinality:** single-select · **Phase:** B1a
 *
 * Tracks where a battery record sits in its lifecycle, from unconfirmed intake through to disposition.
 *
 * `closed` and `voided` are terminal. A voided record is retained in full for audit
 * and excluded from every operational count and view.
 *
 * Transitions are `BUSINESS_RULES.md` § Status Definitions. This module owns the
 * value set and the label; it owns no transition.
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-22, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const BATTERY_RECORD_STATUSES = [
  "draft",
  "pending_review",
  "confirmed",
  "classified",
  "reclassifying",
  "stored",
  "quarantined",
  "staged",
  "shipped",
  "closed",
  "voided",
] as const;

export type BatteryRecordStatus = (typeof BATTERY_RECORD_STATUSES)[number];

/**
 * Stored value to display label. **The only place a T-22 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const BATTERY_RECORD_STATUS_LABELS: Readonly<
  Record<BatteryRecordStatus, string>
> = {
  draft: "Draft",
  pending_review: "Pending review",
  confirmed: "Confirmed",
  classified: "Classified",
  reclassifying: "Reclassifying",
  stored: "In storage",
  quarantined: "Quarantined",
  staged: "Staged for shipment",
  shipped: "Shipped",
  closed: "Closed",
  voided: "Voided",
};
