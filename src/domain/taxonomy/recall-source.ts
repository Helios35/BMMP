/**
 * T-36 · Recall source
 *
 * **Stored on:** `recall_match.source`
 * **Cardinality:** single-select · **Phase:** B2
 *
 * Names where a recall match came from, because sources differ in coverage, authority and refresh cadence.
 *
 * Recording a recall association is open to **P1, P2 or P6** — the handler is who
 * receives the notice and the effect is safety-increasing (Rule 6.23).
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-36, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const RECALL_SOURCES = [
  "consumer_product_agency",
  "vehicle_safety_agency",
  "manufacturer_notice",
  "manual_entry",
] as const;

export type RecallSource = (typeof RECALL_SOURCES)[number];

/**
 * Stored value to display label. **The only place a T-36 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const RECALL_SOURCE_LABELS: Readonly<Record<RecallSource, string>> = {
  consumer_product_agency: "Consumer product recall database",
  vehicle_safety_agency: "Vehicle safety recall database",
  manufacturer_notice: "Manufacturer notice",
  manual_entry: "Manual entry",
};
