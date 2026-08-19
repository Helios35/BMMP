/**
 * T-11 · Provenance source type
 *
 * **Stored on:** `battery_record.provenance_source_type`
 * **Cardinality:** single-select · **Phase:** B1a
 *
 * Records what the battery was removed from, so the link between a pack and its source equipment survives — the named failure mode in this industry is that this link gets severed at intake.
 *
 * B1a **captures** the source reference. Verification and the formal provenance
 * binding are B2 (Rules 2.30, 10.9) — no B1a surface may imply it has been
 * verified.
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-11, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const PROVENANCE_SOURCE_TYPES = [
  "vehicle_vin",
  "device_serial",
  "equipment_asset_id",
  "bulk_consignment",
  "unknown_provenance",
] as const;

export type ProvenanceSourceType = (typeof PROVENANCE_SOURCE_TYPES)[number];

/**
 * Stored value to display label. **The only place a T-11 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const PROVENANCE_SOURCE_TYPE_LABELS: Readonly<
  Record<ProvenanceSourceType, string>
> = {
  vehicle_vin: "Vehicle (VIN)",
  device_serial: "Device (serial number)",
  equipment_asset_id: "Equipment (asset ID)",
  bulk_consignment: "Bulk consignment",
  unknown_provenance: "Provenance not recorded",
};
