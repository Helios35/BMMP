/**
 * T-18 · Transport mode
 *
 * **Stored on:** `shipment.transport_mode`
 * **Cardinality:** single-select · **Phase:** B1a
 *
 * Records how a shipment travels, because mode changes the documentation required and because one mode is prohibited outright for damaged or defective material.
 *
 * **`air` is unavailable for any record carrying a DDR flag (T-30).** The block is
 * enforced at three layers — the UI does not offer the mode, the Server Action
 * refuses it, and a database trigger raises on the shipment transition. **There is
 * no override for any role, including P6** (Rules 6.7, 6.8).
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-18, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const TRANSPORT_MODES = ["ground", "rail", "vessel", "air"] as const;

export type TransportMode = (typeof TRANSPORT_MODES)[number];

/**
 * Stored value to display label. **The only place a T-18 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const TRANSPORT_MODE_LABELS: Readonly<Record<TransportMode, string>> = {
  ground: "Ground",
  rail: "Rail",
  vessel: "Vessel",
  air: "Air",
};
