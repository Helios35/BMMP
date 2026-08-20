/**
 * T-37 · Role
 *
 * **Stored on:** `membership.role`
 * **Cardinality:** single-select per membership · **Phase:** B1a
 *
 * Names what a person is permitted to do inside an organisation, and is the single vocabulary every permission check in the product reads from.
 *
 * **Role lives on `membership`, not on `user`.** One person can hold different roles
 * in different organisations; the roles do not combine and do not leak, and every
 * permission check resolves role in the context of the active organisation
 * (Rules 1.4, 1.5, 1.22; EC-2). **A `user.role` column is a defect.**
 *
 * **P6 is not a membership role.** Platform Admin is expressed as
 * `user.is_platform_admin` (`TECHNICAL_SPEC.md` §9.2), and platform scope alone
 * confers no tenant data access (Rule 1.17). The value exists in this vocabulary so
 * the capability map can name it.
 *
 * **P4 and P5 exist in the vocabulary at B1a** even though their surfaces arrive
 * later, so a later phase adds screens rather than migrating role values.
 *
 * **P5 is read-only, structurally** — it appears in no writer set, so no INSERT,
 * UPDATE or DELETE policy admits it (Rule 1.14; `TECHNICAL_SPEC.md` §9.4).
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-37, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const ROLE_CODES = [
  "compliance_handler",
  "facility_manager",
  "producer_compliance_officer",
  "mobility_supplier_technician",
  "auditor",
  "platform_admin",
] as const;

export type RoleCode = (typeof ROLE_CODES)[number];

/**
 * Stored value to display label. **The only place a T-37 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const ROLE_LABELS: Readonly<Record<RoleCode, string>> = {
  compliance_handler: "Compliance Handler",
  facility_manager: "Facility Manager",
  producer_compliance_officer: "Producer Compliance Officer",
  mobility_supplier_technician: "Mobility Supplier Technician",
  auditor: "Auditor / Underwriter",
  platform_admin: "Platform Admin",
};

/**
 * Persona ID for each role — **documentation only, never stored.**
 *
 * `P1` never appears as a stored value, an enum member, a URL parameter, a CSS
 * class or an API field. This mapping exists so `_ANCHORS.md` §2, the PRD, the
 * Site Architecture and the Business Rules — all of which state permissions by
 * persona ID — resolve against the stored vocabulary. **An agent that stores
 * `"P1"` has misread T-37**, and TAXONOMY.md §5.7 lists it as a review rejection.
 */
export const ROLE_PERSONA_IDS: Readonly<Record<RoleCode, string>> = {
  compliance_handler: "P1",
  facility_manager: "P2",
  producer_compliance_officer: "P3",
  mobility_supplier_technician: "P4",
  auditor: "P5",
  platform_admin: "P6",
};
