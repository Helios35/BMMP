/**
 * T-38 · Document type
 *
 * **Stored on:** `document_render.document_type`
 * **Cardinality:** single-select · **Phase:** per row
 *
 * Names each kind of document the product generates, because document type determines the template, the required content, the retention period and who may see it.
 *
 * Every template, required phrase, marking text and marking size is
 * `jurisdiction_rule` data (TAXONOMY.md §1.2). **A required regulatory phrase is
 * reproduced verbatim, including its own casing** — it is never sentence-cased,
 * pluralised, truncated or improved by a display layer (§4.5).
 *
 * `shipping_paper`, `container_label`, `ddr_packet`, `shipment_record`,
 * `audit_export` and `training_record` are B1a; `evidence_pack`, `filing_packet`
 * and `annual_report` are B1b; `air_travel_packet` is B3.
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-38, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const DOCUMENT_TYPES = [
  "shipping_paper",
  "container_label",
  "ddr_packet",
  "shipment_record",
  "audit_export",
  "training_record",
  "evidence_pack",
  "filing_packet",
  "annual_report",
  "air_travel_packet",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/**
 * Stored value to display label. **The only place a T-38 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const DOCUMENT_TYPE_LABELS: Readonly<Record<DocumentType, string>> = {
  shipping_paper: "Shipping paper",
  container_label: "Container label",
  ddr_packet: "Damaged / defective packet",
  shipment_record: "Shipment record",
  audit_export: "Audit export",
  training_record: "Training record",
  evidence_pack: "Evidence pack",
  filing_packet: "Filing packet",
  annual_report: "Annual report",
  air_travel_packet: "Air travel packet",
};
