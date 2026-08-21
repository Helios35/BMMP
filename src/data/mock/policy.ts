import type { RequestContext } from "@/data/contracts/context";
import type { RoleCode } from "@/domain/taxonomy/role";
import { PermissionError } from "@/lib/errors";

/**
 * The policy matrix, in code — `TECHNICAL_SPEC.md` §9.3 and §9.5.
 *
 * **The mock adapter has no row-level security, so it must enforce tenant scope
 * and role in code, using the same role sets Postgres uses.** Without this, the
 * Playwright suite passes on mock and leaks on Supabase, and the seam's whole
 * claim — that the same suite passes both ways — is false.
 *
 * This is a mirror, not a second source of truth. **Postgres is the enforcement
 * in production**; the tables below exist so the prototype behaves the same way
 * the real thing will, and so a screen built against the mock does not discover
 * a denial for the first time after migration.
 */

/** The writer sets from `TECHNICAL_SPEC.md` §9.3, as role codes. */
export const WRITER_SETS = {
  /** P1, P4 — intake, photos, extractions, decodes, battery records, damage assessments. */
  W_INTAKE: ["compliance_handler", "mobility_supplier_technician"],
  /** P1, P2 — containers, lots, clocks, storage events, container labels. */
  W_STORAGE: ["compliance_handler", "facility_manager"],
  /** P1 — shipments, shipping papers, classification decisions. */
  W_SHIP: ["compliance_handler"],
  /** P2 — organization, membership. */
  W_ORG: ["facility_manager"],
  /** P3 — producer obligations, deadlines, evidence packs (B1b). */
  W_PRODUCER: ["producer_compliance_officer"],
  /** P2, P5 — `audit_event` read. */
  R_AUDIT: ["facility_manager", "auditor"],
} as const satisfies Readonly<Record<string, readonly RoleCode[]>>;

export type WriterSetName = keyof typeof WRITER_SETS;

/** Every table the B1a contract reaches. */
export type PolicyTable =
  | "organization"
  | "user"
  | "membership"
  | "tos_acceptance"
  | "jurisdiction"
  | "jurisdiction_rule"
  | "rule_version"
  | "format_classification"
  | "battery_record"
  | "catalog_entry"
  | "intake_session"
  | "intake_photo"
  | "label_extraction"
  | "date_code_decode"
  | "container"
  | "lot"
  | "storage_clock"
  | "storage_event"
  | "alert"
  | "classification_decision"
  | "shipment"
  | "shipping_paper"
  | "container_label"
  | "document_render"
  | "damage_assessment"
  | "audit_event";

export type PolicyAction = "select" | "insert" | "update";

/**
 * `null` means "every member of the organization" — the `R` of the matrix.
 * A list means those roles only. `[]` means nobody but a platform admin.
 *
 * Every entry is implicitly `∨ app.is_platform_admin()`, exactly as every policy
 * in §9.5 is. **P5 appears in no writer set. That is the enforcement, not a
 * convention** (Rule 1.14).
 */
type PolicyRow = Readonly<Record<PolicyAction, readonly RoleCode[] | null>>;

const R: readonly RoleCode[] | null = null;

/** `TECHNICAL_SPEC.md` §9.5, transcribed. `delete` is absent everywhere by design. */
export const POLICY_MATRIX: Readonly<Record<PolicyTable, PolicyRow>> = {
  organization: { select: R, insert: [], update: WRITER_SETS.W_ORG },
  user: { select: R, insert: [], update: [] },
  membership: {
    select: R,
    insert: WRITER_SETS.W_ORG,
    update: WRITER_SETS.W_ORG,
  },
  // "self, any authenticated" on insert; no UPDATE and no DELETE policy. The
  // narrow lifecycle move lives behind setStatus() and is checked there.
  tos_acceptance: { select: R, insert: R, update: [] },

  // Platform tables: readable by every authenticated user, writable only by P6.
  jurisdiction: { select: R, insert: [], update: [] },
  jurisdiction_rule: { select: R, insert: [], update: [] },
  rule_version: { select: R, insert: [], update: [] },

  format_classification: {
    select: R,
    insert: [...WRITER_SETS.W_INTAKE, ...WRITER_SETS.W_PRODUCER],
    update: [],
  },
  battery_record: {
    select: R,
    insert: WRITER_SETS.W_INTAKE,
    update: WRITER_SETS.W_INTAKE,
  },
  catalog_entry: {
    select: R,
    insert: [...WRITER_SETS.W_INTAKE, ...WRITER_SETS.W_STORAGE],
    update: [...WRITER_SETS.W_INTAKE, ...WRITER_SETS.W_STORAGE],
  },
  intake_session: {
    select: R,
    insert: WRITER_SETS.W_INTAKE,
    update: WRITER_SETS.W_INTAKE,
  },
  intake_photo: { select: R, insert: WRITER_SETS.W_INTAKE, update: [] },
  label_extraction: { select: R, insert: WRITER_SETS.W_INTAKE, update: [] },
  date_code_decode: { select: R, insert: WRITER_SETS.W_INTAKE, update: [] },

  container: {
    select: R,
    insert: WRITER_SETS.W_STORAGE,
    update: WRITER_SETS.W_STORAGE,
  },
  lot: {
    select: R,
    insert: WRITER_SETS.W_STORAGE,
    update: WRITER_SETS.W_STORAGE,
  },
  storage_clock: {
    select: R,
    insert: WRITER_SETS.W_STORAGE,
    update: WRITER_SETS.W_STORAGE,
  },
  storage_event: { select: R, insert: WRITER_SETS.W_STORAGE, update: [] },
  // Raised by the evaluation job and by triggers, not typed by a user. The
  // update is acknowledge/resolve only; the rest is frozen after insert.
  alert: {
    select: R,
    insert: [],
    update: [...WRITER_SETS.W_STORAGE, ...WRITER_SETS.W_PRODUCER],
  },

  classification_decision: {
    select: R,
    insert: [...WRITER_SETS.W_SHIP, ...WRITER_SETS.W_INTAKE],
    update: [],
  },
  shipment: {
    select: R,
    insert: WRITER_SETS.W_SHIP,
    update: WRITER_SETS.W_SHIP,
  },
  shipping_paper: { select: R, insert: WRITER_SETS.W_SHIP, update: [] },
  container_label: { select: R, insert: WRITER_SETS.W_STORAGE, update: [] },
  document_render: {
    select: R,
    insert: [...WRITER_SETS.W_SHIP, ...WRITER_SETS.W_STORAGE],
    update: [],
  },
  damage_assessment: {
    select: R,
    insert: [...WRITER_SETS.W_INTAKE, ...WRITER_SETS.W_STORAGE],
    update: [],
  },

  // Read is P2, P5, P6 only — P1 cannot read the audit log (Rule 12.8).
  // Written by trigger under security definer, never by a user statement, which
  // is why `insert` is empty here and stays empty: the application-originated
  // rows — a denial, an export, a view — go through `auditEvents.write` and
  // `TenantTable.insertAsDefiner`, not through this matrix (Rules 12.3, 12.6).
  audit_event: { select: WRITER_SETS.R_AUDIT, insert: [], update: [] },
};

function permits(
  ctx: RequestContext,
  table: PolicyTable,
  action: PolicyAction,
): boolean {
  if (ctx.isPlatformAdmin) return true;
  const allowed = POLICY_MATRIX[table][action];
  if (allowed === null) return true;
  return allowed.includes(ctx.role);
}

/**
 * Refuse an action this role's Postgres policy would refuse.
 *
 * The message names the role and what was attempted, because **every denial
 * states its reason in plain language and a silently disabled control is a
 * defect** (Rule 1.26). The caller writes the accompanying `audit_event` —
 * attempts are evidence (Rules 1.16, 12.6).
 */
export function assertPolicy(
  ctx: RequestContext,
  table: PolicyTable,
  action: PolicyAction,
): void {
  if (permits(ctx, table, action)) return;
  throw new PermissionError({
    userMessage:
      `Your role cannot ${action === "select" ? "read" : action} ${table} records. ` +
      "Ask a Facility Manager or an Admin if you need this.",
    correlationId: ctx.correlationId,
    context: { table, action, role: ctx.role },
  });
}

/**
 * Whether the caller may act at all in this organization.
 *
 * In the mock this is the whole of tenancy. In Postgres it is
 * `app.is_member(organization_id)`, and a row belonging to another organization
 * is invisible rather than forbidden — which is why the read path returns
 * not-found rather than calling this (Rule 1.2).
 */
export function isMemberOf(
  ctx: RequestContext,
  organizationId: string,
): boolean {
  return ctx.isPlatformAdmin || ctx.organizationId === organizationId;
}
