/**
 * T-62 · Accumulation start source
 *
 * **Stored on:** `container.accumulation_start_source`
 * **Cardinality:** single-select, nullable · **Phase:** B1a
 *
 * Records how a container's accumulation start date was set, so an auditor can see why the date on the label is the date it is.
 *
 * **Null means the container has never held a battery.** It is set by the first
 * placement, never at creation, and **a value changes only when the start date
 * changes** — the new value names the event that changed it.
 *
 * **No value exists for resetting, extending or hand-editing a start date.**
 * Rules 4.6 and 4.9 make those impossible, so there is nothing to record. A
 * start date only ever moves earlier (Rules 4.9–4.12).
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-62, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const ACCUMULATION_START_SOURCES = [
  "first_placement",
  "inherited_on_receipt",
  "inherited_on_consolidation",
  "inherited_on_split",
] as const;

export type AccumulationStartSource =
  (typeof ACCUMULATION_START_SOURCES)[number];

/**
 * Stored value to display label. **The only place a T-62 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const ACCUMULATION_START_SOURCE_LABELS: Readonly<
  Record<AccumulationStartSource, string>
> = {
  first_placement: "First battery placed",
  inherited_on_receipt: "Earlier date received",
  inherited_on_consolidation: "Earliest date on consolidation",
  inherited_on_split: "Earliest date on split",
};
