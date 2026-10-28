import "server-only";

import { data } from "@/data";
import type { CreateAuditEvent, RequestContext } from "@/data/contracts";
import type { AuditActorType } from "@/domain/taxonomy/audit-actor-type";
import type { JsonObject } from "@/types/common";

/**
 * **Every export is itself an audited act** — Rule 12.18: who exported what,
 * when, in what scope and in what format. Written for `/audit` since `b1a-03`,
 * and for every list export since `b1a-08` (D-50) — one writer, so the rows
 * read the same whichever list a file came from.
 *
 * It goes through `auditEvents.write`, not `append`. Under Supabase
 * `audit_event` INSERT belongs to no tenant role — the rows come from a
 * `security definer` trigger and never from a user statement (Rules 12.3,
 * 12.4) — and the mock's policy matrix mirrors that faithfully, so `append`
 * refuses every caller. `write` is that door, elevated on the write and on
 * nothing else: the actor, the tenant and the correlation id all still come
 * from `ctx`, so an elevated write cannot claim to be someone else.
 *
 * **It throws rather than logging and continuing.** An export is the case
 * where an unauditable act does not happen (`TECHNICAL_SPEC.md` §10.4): a
 * compliance export that left the building with no record of who took it is
 * exactly what Rule 12.18 exists to prevent. The caller turns this into a
 * problem response and produces no file.
 */

/**
 * T-60 from the request context — **never a value application code chose.**
 * The same derivation `src/lib/auth/record-denial.ts` performs for denials.
 */
function actorTypeFor(ctx: RequestContext): AuditActorType {
  return ctx.isPlatformAdmin ? "platform_admin" : "user";
}

export interface ExportRecord {
  /** Which list left the building — `audit`, `batteries`, `shipments`, `review`. */
  readonly exportName: string;
  /** The list's route, for the row's reason. */
  readonly route: string;
  readonly rowCount: number;
  readonly format: string;
  /** The filters the export was produced under — Rule 12.18's "in what scope". */
  readonly scope: JsonObject;
  readonly requestId: string | null;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}

export async function recordExport(
  ctx: RequestContext,
  record: ExportRecord,
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
    // exported what, and a list has no single row to point at.
    entityTable: "user",
    entityId: ctx.userId,
    occurredAt: at,
    recordedAt: at,
    beforeState: null,
    afterState: {
      export: record.exportName,
      format: record.format,
      rowCount: record.rowCount,
      scope: record.scope,
    },
    changedFields: null,
    // A role and a filter are not a jurisdiction rule, so no rule version
    // governed this act.
    governingRuleVersionId: null,
    ruleVersionsApplied: null,
    correlationId: ctx.correlationId,
    requestId: record.requestId,
    ipAddress: record.ipAddress,
    userAgent: record.userAgent,
    reason: `export_generated:${record.route}`,
  };

  await data.auditEvents.write(ctx, event);
}
