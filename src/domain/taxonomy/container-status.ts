/**
 * T-24 · Container status
 *
 * **Stored on:** `container.status`
 * **Cardinality:** single-select · **Phase:** B1a
 *
 * Tracks whether a container is accepting material, ready to move, or out of service.
 *
 * **`overdue` is a hard state, not a warning** (Rule 4.15): the container accepts no
 * new items (Rule 4.16) and its contents leave only by shipment or by a remediation
 * recorded by P2 (Rule 4.17). A container can enter it on receipt, by inheriting an
 * earlier accumulation start date (Rule 4.10; EC-23).
 *
 * **There is no separate `empty` status.** Emptiness is read from the fill level and
 * from clock status `not_started` (T-26), not from a second value that could drift
 * out of step with them.
 *
 * The same word `overdue` appears here, on T-26 and on T-27, deliberately — one
 * condition, one word, so no builder infers a fourth state from a fourth name.
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-24, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const CONTAINER_STATUSES = [
  "open",
  "full",
  "overdue",
  "closed",
  "staged",
  "shipped",
  "retired",
] as const;

export type ContainerStatus = (typeof CONTAINER_STATUSES)[number];

/**
 * Stored value to display label. **The only place a T-24 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const CONTAINER_STATUS_LABELS: Readonly<
  Record<ContainerStatus, string>
> = {
  open: "Open",
  full: "Full",
  overdue: "Overdue",
  closed: "Closed",
  staged: "Staged for shipment",
  shipped: "Shipped",
  retired: "Retired",
};
