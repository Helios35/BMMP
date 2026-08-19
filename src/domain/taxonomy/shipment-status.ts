/**
 * T-28 · Shipment status
 *
 * **Stored on:** `shipment.status`
 * **Cardinality:** single-select · **Phase:** B1a
 *
 * Tracks a shipment from assembly through dispatch to the closed record that retention obligations attach to.
 *
 * `ready` means every precondition in Rule 5.3 is satisfied and documents may be
 * generated. It falls back to `draft` if a precondition fails again.
 *
 * **A refused shipment is not a delivery.** `exception` means it departed and then
 * went wrong; Rule 5.26 does not fire, the records stay `shipped` rather than
 * closing out, and any return movement is a new shipment with its own documents
 * (EC-47).
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-28, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const SHIPMENT_STATUSES = [
  "draft",
  "ready",
  "documents_issued",
  "dispatched",
  "delivered",
  "exception",
  "closed",
  "cancelled",
] as const;

export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

/**
 * Stored value to display label. **The only place a T-28 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const SHIPMENT_STATUS_LABELS: Readonly<Record<ShipmentStatus, string>> =
  {
    draft: "Draft",
    ready: "Ready",
    documents_issued: "Documents issued",
    dispatched: "Dispatched",
    delivered: "Delivered",
    exception: "Exception",
    closed: "Closed",
    cancelled: "Cancelled",
  };
