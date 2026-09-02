import type { CreateAuditEvent, RequestContext } from "@/data/contracts";
import type { AppliedRuleVersion } from "@/domain/rules/outcome";
import type { AuditActorType } from "@/domain/taxonomy/audit-actor-type";
import type { AuditEventType } from "@/domain/taxonomy/audit-event-type";
import type { IsoTimestamp, JsonObject, Uuid } from "@/types/common";

/**
 * The audit rows intake writes — Rules 2.4, 12.3, 12.5, 12.7; T-43, T-60.
 *
 * Two actors, built in two functions, so a row can never carry the wrong one:
 *
 * - **A pipeline step is the system.** Rule 12.5: automated steps write events
 *   exactly as human actions do, identified as the step that ran and carrying
 *   the model or rule version used. The label names the step and the provider
 *   or rule that produced the answer; `actorUserId` is null because nobody
 *   pressed anything.
 * - **A confirmation is a person.** Rule 2.21 forbids "confirmed by the
 *   system" as a value, and T-60 sets the actor type from the request context
 *   so a support grant is visible in the log (Rules 1.18, 12.7).
 *
 * Every row shares `ctx.correlationId`, which is what lets `/audit` show one
 * intake as one thread from the first photo to the placement (§11.1 step 6.8).
 *
 * **Only T-43's values are written.** Where a step has no type — a crop, a
 * failed extraction, a gate that routed nowhere, an abandonment — the call
 * site writes nothing and carries a `TODO(T-43)` marker, because a row filed
 * under a near-neighbour type is a row an auditor will misread
 * (TAXONOMY.md §1.1).
 */

/** The steps of the code-owned pipeline, and the commit-time evaluators. */
export type IntakePipelineStep =
  | "crop"
  | "extract"
  | "decode"
  | "match"
  | "gate"
  | "classify"
  | "assess"
  | "place"
  | "clock";

/** Who a person's request came from, as the route or action read it. */
export interface RequestAttribution {
  readonly requestId: string | null;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}

export const NO_ATTRIBUTION: RequestAttribution = {
  requestId: null,
  ipAddress: null,
  userAgent: null,
};

/**
 * T-60 from the request context — **never a value application code chose.**
 *
 * `src/lib/auth/record-denial.ts` performs the same derivation for denials and
 * does not export it, so this is a copy of a rule T-60 says should exist once.
 * The real fix is for `auditEvents.write` to set `actorType` from `ctx` the
 * way the Postgres trigger reads it from `set_config`; that is a contract
 * change and it is raised in this unit's build notes rather than made here.
 */
export function actorTypeFor(ctx: RequestContext): AuditActorType {
  return ctx.isPlatformAdmin ? "platform_admin" : "user";
}

/** `intake_pipeline:<step>:<provider>` — the step that ran and what produced its answer (Rule 12.5). */
export function systemActorLabel(
  step: IntakePipelineStep,
  provider: string,
): string {
  return `intake_pipeline:${step}:${provider}`;
}

interface EventBody {
  readonly eventType: AuditEventType;
  readonly entityTable: string;
  readonly entityId: Uuid;
  readonly at: IsoTimestamp;
  readonly beforeState?: JsonObject | null;
  readonly afterState: JsonObject | null;
  readonly changedFields?: readonly string[] | null;
  readonly governingRuleVersionId?: Uuid | null;
  readonly ruleVersionsApplied?: readonly AppliedRuleVersion[] | null;
  readonly reason?: string | null;
}

function body(ctx: RequestContext, input: EventBody) {
  return {
    eventType: input.eventType,
    entityTable: input.entityTable,
    entityId: input.entityId,
    occurredAt: input.at,
    recordedAt: input.at,
    beforeState: input.beforeState ?? null,
    afterState: input.afterState,
    changedFields: input.changedFields ?? null,
    governingRuleVersionId: input.governingRuleVersionId ?? null,
    ruleVersionsApplied: input.ruleVersionsApplied ?? null,
    correlationId: ctx.correlationId,
    reason: input.reason ?? null,
  };
}

/**
 * A pipeline step's row. System actor, no user, no request attribution — the
 * step ran on the server on the person's behalf, and the person's own act is
 * the row that started it.
 */
export function systemStepEvent(
  ctx: RequestContext,
  input: EventBody & {
    readonly step: IntakePipelineStep;
    /** The vision provider's code, or the rule key a rule-driven step evaluated. */
    readonly provider: string;
  },
): CreateAuditEvent {
  return {
    actorUserId: null,
    actorType: "system",
    actorLabel: systemActorLabel(input.step, input.provider),
    ...body(ctx, input),
    requestId: null,
    ipAddress: null,
    userAgent: null,
  };
}

/** A person's row. Actor from `ctx`, attribution from the request when the caller read it. */
export function userEvent(
  ctx: RequestContext,
  input: EventBody & { readonly attribution?: RequestAttribution },
): CreateAuditEvent {
  const attribution = input.attribution ?? NO_ATTRIBUTION;
  return {
    actorUserId: ctx.userId,
    actorType: actorTypeFor(ctx),
    actorLabel: null,
    ...body(ctx, input),
    requestId: attribution.requestId,
    ipAddress: attribution.ipAddress,
    userAgent: attribution.userAgent,
  };
}
