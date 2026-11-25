/**
 * T-71 · Filing item source
 *
 * **Stored on:** each item of a `producer.filings` payload — rule data, not a
 * column · **Cardinality:** single-select per item · **Phase:** B1b (from
 * `b1b-13`)
 *
 * Where one item of a state's filing is drawn from (Rule 8.18): a value the
 * platform holds — the organization, the person making the packet, the
 * products, their sales — a sentence the law requires, or an item the
 * platform doesn't keep. **Every item carries its citation**, and **`not_held`
 * is printed by name, never left out** (Rule 8.20).
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-71, which is the
 * single source of truth. This module owns the stored value, the value order
 * and the display label, and owns no transition.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const FILING_ITEM_SOURCES = [
  "producer_identity",
  "contact",
  "brands",
  "products",
  "products_outside",
  "chemistries",
  "units",
  "weight",
  "statement",
  "not_held",
] as const;

export type FilingItemSource = (typeof FILING_ITEM_SOURCES)[number];

/**
 * Stored value to display label. **The only place a T-71 label exists in this
 * codebase** (TAXONOMY.md §5.3).
 */
export const FILING_ITEM_SOURCE_LABELS: Readonly<
  Record<FilingItemSource, string>
> = {
  producer_identity: "Producer",
  contact: "Contact",
  brands: "Brands",
  products: "Products",
  products_outside: "Products it doesn't cover",
  chemistries: "Chemistries",
  units: "Units",
  weight: "Weight",
  statement: "Statement",
  not_held: "Not held here",
};
