import "server-only";

import { headers } from "next/headers";

import { data } from "@/data";
import type { CreateAuditEvent, RequestContext } from "@/data/contracts";
import type { AppRoute } from "@/domain/access/routes";
import type { AuditActorType } from "@/domain/taxonomy/audit-actor-type";
import type { JsonObject, Uuid } from "@/types/common";

/**
 * **Every denial writes an `audit_event`** — `SITE_ARCHITECTURE.md` §5.3(8),
 * Rules 1.16 and 12.6. **Denials are evidence**, so an attempt that was refused
 * is a row, not a log line that rolls off.
 *
 * These go through `auditEvents.write`, not `auditEvents.append`. Under Supabase
 * `audit_event` INSERT belongs to no tenant role — the rows come from a
 * `security definer` trigger and never from a user statement (Rules 12.3, 12.4)
 * — so the caller who was just refused holds no INSERT and `append` refuses them
 * too. `write` is that `security definer` door, and it is elevated on the write
 * and on nothing else: actor and correlation id still come from `ctx`.
 */

/**
 * T-60, derived in exactly one place.
 *
 * T-60 is explicit that the actor type is set from the request context and never
 * by application code choosing a value. **A support grant that is invisible in
 * the log is not a recorded support grant** (Rules 1.18, 12.7), and `/audit`
 * marks these rows as platform actions and filters on them.
 */
function actorTypeFor(ctx: RequestContext): AuditActorType {
  return ctx.isPlatformAdmin ? "platform_admin" : "user";
}

interface RequestAttribution {
  readonly requestId: string | null;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}

async function requestAttribution(): Promise<RequestAttribution> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  const firstAddress = forwarded?.split(",")[0]?.trim();
  return {
    requestId: headerList.get("x-request-id"),
    ipAddress:
      firstAddress === undefined || firstAddress === "" ? null : firstAddress,
    userAgent: headerList.get("user-agent"),
  };
}

/**
 * Write the row, and **never throw into the request.**
 *
 * This is the one place `src/lib/errors.ts`'s "nothing is swallowed" bends, and
 * it bends because the alternative is worse: a failed audit write turning a
 * clean redirect into a 500 tells the user the product is broken when what
 * actually happened is that they were correctly refused. **The catch logs — it
 * does not ignore** — and it logs at `error` with the correlation id so the gap
 * is findable rather than invisible.
 */
async function writeDenialEvent(
  ctx: RequestContext,
  input: CreateAuditEvent,
): Promise<void> {
  try {
    await data.auditEvents.write(ctx, input);
  } catch (cause) {
    console.error(
      `[audit] denial event was not recorded (correlationId=${ctx.correlationId}, reason=${input.reason})`,
      cause,
    );
  }
}

function baseEvent(
  ctx: RequestContext,
  attribution: RequestAttribution,
  at: string,
): Omit<
  CreateAuditEvent,
  "entityTable" | "entityId" | "afterState" | "reason"
> {
  return {
    actorUserId: ctx.userId,
    actorType: actorTypeFor(ctx),
    actorLabel: null,
    // T-43. `denial.recorded` is the only audit event type this unit writes;
    // sign-in, the organization switch and consent have no T-43 value yet and a
    // builder never invents one (TAXONOMY.md §1.1).
    eventType: "denial.recorded",
    occurredAt: at,
    recordedAt: at,
    beforeState: null,
    changedFields: null,
    // A role restriction is not a jurisdiction rule, so no rule version applied.
    governingRuleVersionId: null,
    ruleVersionsApplied: null,
    correlationId: ctx.correlationId,
    requestId: attribution.requestId,
    ipAddress: attribution.ipAddress,
    userAgent: attribution.userAgent,
  };
}

/**
 * §5.3(4) — a member of this organization reached a route their role cannot
 * open.
 *
 * The subject is the actor's own access: no other row was touched, and
 * `entityId` is not nullable, so it names the user.
 */
export async function recordRouteDenial(
  ctx: RequestContext,
  route: AppRoute,
): Promise<void> {
  const attribution = await requestAttribution();
  const at = new Date().toISOString();
  const afterState: JsonObject = {
    route,
    role: ctx.role,
    capability: "none",
    outcome: "redirected_to_dashboard",
  };

  await writeDenialEvent(ctx, {
    ...baseEvent(ctx, attribution, at),
    entityTable: "user",
    entityId: ctx.userId,
    afterState,
    reason: `route_access_denied:${route}`,
  });
}

/**
 * §5.3(5) / E-15 — an identifier resolved as not found.
 *
 * **The reason string is neutral by design.** It is identical whether the row is
 * absent or belongs to another organization, because `NotFoundError` does not
 * know the difference and the audit row must not know it either (Rule 1.2).
 * Recording the requested identifier is safe: the row lives in the caller's own
 * organization and says only that this user asked for something and got nothing.
 */
export async function recordNotFound(
  ctx: RequestContext,
  entityTable: string,
  entityId: Uuid,
): Promise<void> {
  const attribution = await requestAttribution();
  const at = new Date().toISOString();
  const afterState: JsonObject = { outcome: "not_found" };

  await writeDenialEvent(ctx, {
    ...baseEvent(ctx, attribution, at),
    entityTable,
    entityId,
    afterState,
    reason: "record_not_found",
  });
}

/**
 * Rules 1.16, 12.6 — a rejected write, from the Server Action guard or from a
 * caught `PermissionError`.
 *
 * `attempted` names the action rather than the route, because two actions on one
 * route are refused for different reasons and a log that cannot tell them apart
 * is a log an auditor cannot use.
 */
export async function recordWriteDenial(
  ctx: RequestContext,
  route: AppRoute,
  attempted: string,
): Promise<void> {
  const attribution = await requestAttribution();
  const at = new Date().toISOString();
  const afterState: JsonObject = {
    route,
    role: ctx.role,
    attempted,
    outcome: "rejected",
  };

  await writeDenialEvent(ctx, {
    ...baseEvent(ctx, attribution, at),
    entityTable: "user",
    entityId: ctx.userId,
    afterState,
    reason: `write_denied:${route}:${attempted}`,
  });
}
