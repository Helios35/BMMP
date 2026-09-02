import { data } from "@/data";
import type { CreateAuditEvent, RequestContext } from "@/data/contracts";
import type { AppliedRuleVersion } from "@/domain/rules/outcome";
import type { AuditActorType } from "@/domain/taxonomy/audit-actor-type";
import type { AuditEventType } from "@/domain/taxonomy/audit-event-type";
import type { IsoTimestamp, JsonObject, Uuid } from "@/types/common";

/**
 * Audit rows for the record write paths — Rules 12.3, 12.5, 12.7; T-43, T-60.
 *
 * Two actors and nothing in between. **A person did it** (`userEvent`): the
 * actor is `ctx.userId`, the type is derived from `ctx` and never chosen here.
 * **Rule evaluation did it** (`systemEvent`): the actor is a label naming the
 * step, because a DDR flag is set by the domain from a confirmed finding
 * (Rule 6.4) and a re-classification is decided by a rule version (Rule 3.15)
 * — attributing either to the person who clicked would say a human set a legal
 * boolean, which Rule 6.8 forbids for every role including P6.
 *
 * `eventType` is typed `AuditEventType`. Where no T-43 value fits, the caller
 * writes nothing and marks the site `// TODO(T-43)` — a near neighbour is a
 * wrong row that gets filed and believed.
 *
 * ## The definer door
 *
 * `audit_event` INSERT belongs to no tenant role (`TECHNICAL_SPEC.md` §9.5) —
 * under Supabase a `security definer` trigger writes these rows when the
 * `damage_assessment`, `classification_decision` and `battery_record` rows
 * change. The mock has no triggers, so this module writes the same rows through
 * `auditEvents.write`, the door `src/lib/auth/record-denial.ts` uses. Actor and
 * correlation id still come from `ctx`; nothing here can claim to be someone
 * else.
 *
 * Request attribution (`requestId`, `ipAddress`, `userAgent`) is null on every
 * row from this module: it has no request to read and must stay callable from
 * an integration test with a hand-built context. Under Supabase the trigger
 * fills it from `set_config` locals.
 */

/**
 * T-60, derived from the request context and never chosen by application
 * code. **A support grant that is invisible in the log is not a recorded
 * support grant** (Rules 1.18, 12.7). The same one-liner as
 * `src/lib/auth/record-denial.ts`, which keeps its own copy private.
 */
function actorTypeFor(ctx: RequestContext): AuditActorType {
  return ctx.isPlatformAdmin ? "platform_admin" : "user";
}

export interface AuditEventFacts {
  readonly eventType: AuditEventType;
  readonly entityTable: string;
  readonly entityId: Uuid;
  readonly occurredAt: IsoTimestamp;
  readonly beforeState?: JsonObject | null;
  readonly afterState?: JsonObject | null;
  readonly changedFields?: readonly string[] | null;
  readonly governingRuleVersionId?: Uuid | null;
  readonly ruleVersionsApplied?: readonly AppliedRuleVersion[] | null;
  readonly reason?: string | null;
}

function baseEvent(
  ctx: RequestContext,
  facts: AuditEventFacts,
): Omit<CreateAuditEvent, "actorUserId" | "actorType" | "actorLabel"> {
  return {
    eventType: facts.eventType,
    entityTable: facts.entityTable,
    entityId: facts.entityId,
    occurredAt: facts.occurredAt,
    recordedAt: facts.occurredAt,
    beforeState: facts.beforeState ?? null,
    afterState: facts.afterState ?? null,
    changedFields: facts.changedFields ?? null,
    governingRuleVersionId: facts.governingRuleVersionId ?? null,
    ruleVersionsApplied: facts.ruleVersionsApplied ?? null,
    correlationId: ctx.correlationId,
    requestId: null,
    ipAddress: null,
    userAgent: null,
    reason: facts.reason ?? null,
  };
}

/** A row for something a person did: `actorUserId` is the caller (Rule 12.5). */
export function userEvent(
  ctx: RequestContext,
  facts: AuditEventFacts,
): CreateAuditEvent {
  return {
    ...baseEvent(ctx, facts),
    actorUserId: ctx.userId,
    actorType: actorTypeFor(ctx),
    actorLabel: null,
  };
}

/**
 * A row for something rule evaluation did in response to a person's act. The
 * label names the step (`condition_evaluation`, `reclassification:…`) so the
 * trail says which evaluator produced the row rather than leaving an empty
 * attribution (Rule 12.5).
 */
export function systemEvent(
  ctx: RequestContext,
  actorLabel: string,
  facts: AuditEventFacts,
): CreateAuditEvent {
  return {
    ...baseEvent(ctx, facts),
    actorUserId: null,
    actorType: "system",
    actorLabel,
  };
}

/** Write one row through the definer door. Nothing is swallowed. */
export async function writeAuditEvent(
  ctx: RequestContext,
  event: CreateAuditEvent,
): Promise<void> {
  await data.auditEvents.write(ctx, event);
}
