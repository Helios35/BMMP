/**
 * T-43 · Audit event type
 *
 * **Stored on:** `audit_event.event_type`
 * **Cardinality:** single-select per event · **Phase:** B1a
 *
 * Names what happened, in a stable vocabulary, so the audit log is queryable rather than a pile of prose.
 *
 * `<entity>.<past_tense_verb>`, lower `snake_case` both sides (TAXONOMY.md §4.1).
 *
 * **`denial.recorded` is required by Rule 12.6**: a blocked air-transport selection,
 * a rejected P5 write and a prohibited-activity attempt are all audited, not merely
 * refused. Attempted actions are evidence.
 *
 * `ERD.md` §10.2 additionally names `document.render_failed`,
 * `document.reprinted` and `document.viewed` on `audit_event.event_type`. Those
 * three are **not** in T-43's value set — see the build-notes for this unit; the
 * gap is reported rather than closed here, because inventing a value is a review
 * rejection (TAXONOMY.md §1.1).
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-43, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const AUDIT_EVENT_TYPES = [
  "intake_session.started",
  "intake_photo.captured",
  "label_extraction.completed",
  "catalog_entry.matched",
  "battery_record.routed_to_review",
  "battery_record.confirmed",
  "battery_record.status_changed",
  "classification_decision.recorded",
  "damage_assessment.recorded",
  "battery_record.ddr_flag_set",
  "container.status_changed",
  "storage_event.recorded",
  "storage_clock.status_changed",
  "shipment.status_changed",
  "document_render.issued",
  "document_render.superseded",
  "membership.role_changed",
  "jurisdiction_rule.version_activated",
  "override.recorded",
  "denial.recorded",
  "export.generated",
] as const;

export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

/**
 * Stored value to display label. **The only place a T-43 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const AUDIT_EVENT_TYPE_LABELS: Readonly<Record<AuditEventType, string>> =
  {
    "intake_session.started": "Intake started",
    "intake_photo.captured": "Photo captured",
    "label_extraction.completed": "Label read",
    "catalog_entry.matched": "Catalog matched",
    "battery_record.routed_to_review": "Routed to review",
    "battery_record.confirmed": "Identification confirmed",
    "battery_record.status_changed": "Record status changed",
    "classification_decision.recorded": "Waste classification recorded",
    "damage_assessment.recorded": "Damage assessment recorded",
    "battery_record.ddr_flag_set": "DDR flag set",
    "container.status_changed": "Container status changed",
    "storage_event.recorded": "Storage event recorded",
    "storage_clock.status_changed": "Storage clock changed",
    "shipment.status_changed": "Shipment status changed",
    "document_render.issued": "Document issued",
    "document_render.superseded": "Document superseded",
    "membership.role_changed": "Role changed",
    "jurisdiction_rule.version_activated": "Rule version activated",
    "override.recorded": "Override recorded",
    "denial.recorded": "Action denied",
    "export.generated": "Export generated",
  };
