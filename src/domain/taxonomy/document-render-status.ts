/**
 * T-39 · Document render status
 *
 * **Stored on:** `document_render.status`
 * **Cardinality:** single-select · **Phase:** B1a
 *
 * Records whether a generated document is a draft, the live version, or one that has been replaced — because compliance documents are evidence and must never be edited in place.
 *
 * **Rule 5.28 governs `draft`:** a draft is watermarked not-valid, satisfies no
 * documentation obligation, never accompanies a shipment or a container, and closes
 * no Rule 5.3 precondition. Issuing is a separate deliberate act.
 *
 * Four values only. Rows exist only on a successful render — a failed render is an
 * `audit_event`, not a row (`TECHNICAL_SPEC.md` §10.4).
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-39, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const DOCUMENT_RENDER_STATUSES = [
  "draft",
  "issued",
  "superseded",
  "voided",
] as const;

export type DocumentRenderStatus = (typeof DOCUMENT_RENDER_STATUSES)[number];

/**
 * Stored value to display label. **The only place a T-39 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const DOCUMENT_RENDER_STATUS_LABELS: Readonly<
  Record<DocumentRenderStatus, string>
> = {
  draft: "Draft",
  issued: "Issued",
  superseded: "Superseded",
  voided: "Voided",
};
