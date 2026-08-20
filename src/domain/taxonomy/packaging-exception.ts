/**
 * T-20 · Packaging exception
 *
 * **Stored on:** `shipment.packaging_exceptions`
 * **Cardinality:** multi-select · **Phase:** B1a
 *
 * Records which packaging or testing exceptions a shipment qualifies for, because qualifying directly reduces the customer's packaging cost.
 *
 * Eligibility is determined from the rule version in force **on the shipment date**;
 * the system never assumes it (Rules 5.19, 5.20).
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-20, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const PACKAGING_EXCEPTIONS = [
  "recycling_disposal_ground",
  "damaged_defective_packaging",
  "none",
] as const;

export type PackagingException = (typeof PACKAGING_EXCEPTIONS)[number];

/**
 * Stored value to display label. **The only place a T-20 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const PACKAGING_EXCEPTION_LABELS: Readonly<
  Record<PackagingException, string>
> = {
  recycling_disposal_ground: "Recycling / disposal by ground",
  damaged_defective_packaging: "Damaged / defective packaging",
  none: "No exception applied",
};
