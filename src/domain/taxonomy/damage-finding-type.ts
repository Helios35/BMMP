/**
 * T-29 · Damage finding type
 *
 * **Stored on:** `damage_assessment.finding_types`
 * **Cardinality:** multi-select, minimum one · **Phase:** B1a (recorded), B2 (model-assisted triage)
 *
 * Names each physical condition observed on a battery during inspection, because damage is one of the few things about a battery that is genuinely visible and it changes how the battery must be packaged and moved.
 *
 * **`none_observed` is a real finding, not an empty array.** An inspection that
 * found nothing is evidence that an inspection happened (Rule 6.3).
 *
 * The cosmetic versus damaged-or-defective split is two-valued and mechanical, by
 * design — the former three-way middle band was the builder judgment Rule 6.4
 * exists to prevent. See `DAMAGED_OR_DEFECTIVE_FINDING_TYPES` below.
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-29, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const DAMAGE_FINDING_TYPES = [
  "swelling",
  "puncture",
  "leakage",
  "thermal_evidence",
  "dent",
  "connector_damage",
  "corrosion",
  "surface_marking",
  "none_observed",
] as const;

export type DamageFindingType = (typeof DAMAGE_FINDING_TYPES)[number];

/**
 * Stored value to display label. **The only place a T-29 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const DAMAGE_FINDING_TYPE_LABELS: Readonly<
  Record<DamageFindingType, string>
> = {
  swelling: "Swelling",
  puncture: "Puncture",
  leakage: "Leakage",
  thermal_evidence: "Thermal evidence",
  dent: "Dent",
  connector_damage: "Connector damage",
  corrosion: "Corrosion",
  surface_marking: "Surface marking",
  none_observed: "None observed",
};

/**
 * The damaged-or-defective class of T-29.
 *
 * **Rule 6.4 makes this split two-valued and mechanical.** A confirmed finding
 * in this set sets the `damaged` DDR flag (T-30) automatically — never by a
 * separate judgment — which blocks air transport and routes the record to
 * quarantine (Rules 6.7, 6.17).
 */
export const DAMAGED_OR_DEFECTIVE_FINDING_TYPES = [
  "swelling",
  "puncture",
  "leakage",
  "thermal_evidence",
  "dent",
  "connector_damage",
] as const satisfies readonly DamageFindingType[];

/**
 * The cosmetic class of T-29. The casing is intact and nothing is escaping.
 * A cosmetic finding sets no DDR flag and blocks nothing.
 */
export const COSMETIC_FINDING_TYPES = [
  "corrosion",
  "surface_marking",
] as const satisfies readonly DamageFindingType[];
