/**
 * T-32 · Disposition route
 *
 * **Stored on:** `battery_record.disposition_route`
 * **Cardinality:** single-select · **Phase:** B2
 *
 * Records where a battery is being sent, which is the operational consequence of its grade and the economics of its chemistry.
 *
 * B2 sets it; the column exists on `battery_record` from `0005`.
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-32, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const DISPOSITION_ROUTES = [
  "pending",
  "reuse",
  "repurpose",
  "material_recovery",
  "disposal",
  "return_to_producer",
] as const;

export type DispositionRoute = (typeof DISPOSITION_ROUTES)[number];

/**
 * Stored value to display label. **The only place a T-32 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const DISPOSITION_ROUTE_LABELS: Readonly<
  Record<DispositionRoute, string>
> = {
  pending: "Pending",
  reuse: "Reuse",
  repurpose: "Repurpose",
  material_recovery: "Material recovery",
  disposal: "Disposal",
  return_to_producer: "Return to producer",
};
