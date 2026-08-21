import { data } from "@/data";
import type { CreateAuditEvent, RequestContext } from "@/data/contracts";
import type { AuditActorType } from "@/domain/taxonomy/audit-actor-type";
import type { JsonObject } from "@/types/common";

/**
 * **Every export is itself an audited act** — Rule 12.18, and `UX_SPEC.md` §3.20
 * says so on the screen that offers it.
 *
 * It goes through `auditEvents.write`, not `append`. Under Supabase `audit_event`
 * INSERT belongs to no tenant role — the rows come from a `security definer`
 * trigger and never from a user statement (Rules 12.3, 12.4) — and the mock's
 * policy matrix mirrors that faithfully, so `append` refuses every caller. `write`
 * is that door, elevated on the write and on nothing else: the actor, the tenant
 * and the correlation id all still come from `ctx`, so an elevated write cannot
 * claim to be someone else. `src/data/contracts/audit.ts` names an export as one
 * of the writes it exists for.
 *
 * **It throws rather than logging and continuing.** The denial writer deliberately
 * swallows a failure, because turning a correct refusal into a 500 tells the user
 * the product is broken. An export is the opposite case: `TECHNICAL_SPEC.md`
 * §10.4's posture is that an unauditable act does not happen, and a compliance
 * export that left the building with no record of who took it is exactly the
 * thing Rule 12.18 exists to prevent. The caller turns this into a problem
 * response and produces no file.
 */

/**
 * T-60 from the request context — **never a value application code chose.**
 *
 * `src/lib/auth/record-denial.ts` performs the same derivation for denials and
 * does not export it, so this is a second copy of a rule T-60 says should exist
 * once. The real fix is for `auditEvents.write` to set `actorType` from `ctx` the
 * way the Postgres trigger reads it from `set_config`, which would make it
 * impossible for any caller to supply one; that is a contract change and it is
 * raised in this unit's build notes rather than made here.
 */
function actorTypeFor(ctx: RequestContext): AuditActorType {
  return ctx.isPlatformAdmin ? "platform_admin" : "user";
}

export interface AuditExportRecord {
  /** What left the building. */
  readonly rowCount: number;
  readonly format: string;
  /** The filters the export was produced under — Rule 12.18's "in what scope". */
  readonly scope: JsonObject;
  readonly requestId: string | null;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}

export async function recordAuditExport(
  ctx: RequestContext,
  record: AuditExportRecord,
): Promise<void> {
  const at = new Date().toISOString();

  const event: CreateAuditEvent = {
    actorUserId: ctx.userId,
    actorType: actorTypeFor(ctx),
    actorLabel: null,
    // T-43 carries `export.generated`. No value is invented here
    // (TAXONOMY.md §1.1).
    eventType: "export.generated",
    // The subject is the person who took the copy: Rule 12.18 records **who**
    // exported what, and the log itself has no single row to point at.
    entityTable: "user",
    entityId: ctx.userId,
    occurredAt: at,
    recordedAt: at,
    beforeState: null,
    afterState: {
      export: "audit",
      format: record.format,
      rowCount: record.rowCount,
      scope: record.scope,
    },
    changedFields: null,
    // A role and a date range are not a jurisdiction rule, so no rule version
    // governed this act.
    governingRuleVersionId: null,
    ruleVersionsApplied: null,
    correlationId: ctx.correlationId,
    requestId: record.requestId,
    ipAddress: record.ipAddress,
    userAgent: record.userAgent,
    reason: "export_generated:/audit",
  };

  await data.auditEvents.write(ctx, event);
}
