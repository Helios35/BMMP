import "server-only";

import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import type { ResolvedRule } from "@/domain/rules/resolve";
import {
  carriedAccumulationStart,
  planReceipt,
  type ContentsMoveOperation,
} from "@/domain/storage/accumulation";
import { civilDateInZone } from "@/domain/storage/clock-display";
import { ACCUMULATION_RULE_KEY } from "@/domain/storage/placement";
import { organizationSites } from "@/features/settings/sites";
import { RuleResolutionError } from "@/lib/errors";
import type { Uuid } from "@/types/common";
import type { Container } from "@/types/storage";
import type { Organization } from "@/types/tenancy";

/**
 * The accumulation rule a move's receiving clock starts from — Rules 4.5,
 * 12.20.
 *
 * **The period is the one in force at the site on the accumulation start
 * date**, and after a move that date is the earliest any arriving battery
 * carries — not today. So the date is planned first, with the same pure
 * functions the adapter uses, and the rule is resolved for that calendar day
 * in the receiving container's zone. The adapter re-derives the date from its
 * own rows and refuses a rule not in force on it, so a stale read here fails
 * loudly rather than dating a clock from the wrong version.
 *
 * Returns null when the receiving start holds and a clock is already running
 * — nothing needs a period then.
 */

/** A placement's history is short; the bound only caps a pathological row. */
const EVENTS_PER_BATTERY = 100;

export async function resolveReceivingRule(
  ctx: RequestContext,
  input: {
    readonly operation: ContentsMoveOperation;
    readonly organization: Organization;
    readonly source: Container;
    readonly target: Container;
    readonly batteryRecordIds: readonly Uuid[];
  },
): Promise<ResolvedRule | null> {
  const carried = [];
  for (const batteryRecordId of input.batteryRecordIds) {
    const events = await data.storageEvents.list(ctx, {
      batteryRecordId,
      limit: EVENTS_PER_BATTERY,
    });
    const start = carriedAccumulationStart({
      events: events.items,
      containerAccumulationStartedAt: input.source.accumulationStartedAt,
    });
    if (start !== null) carried.push(start);
  }
  // The adapter states the refusal for a battery with no date on record.
  if (carried.length === 0) return null;

  const plan = planReceipt({
    operation: input.operation,
    target: {
      accumulationStartedAt: input.target.accumulationStartedAt,
      accumulationStartSource: input.target.accumulationStartSource,
    },
    carriedStarts: carried,
  });

  const running = await data.storageClocks.list(ctx, {
    containerId: input.target.id,
    isRunning: true,
    limit: 1,
  });
  const clock = running.items[0];
  if (clock !== undefined && !plan.startChanged) return null;

  const timeZone = clock?.timeZone ?? input.target.siteTimeZone;
  const [site] = organizationSites(input.organization, [input.target]).filter(
    (candidate) => candidate.containerCount > 0,
  );
  const jurisdictionId =
    site?.jurisdictionId ?? input.organization.primaryJurisdictionId;
  const asOf = civilDateInZone(plan.accumulationStartedAt, timeZone);

  if (jurisdictionId === null) {
    throw new RuleResolutionError({
      userMessage:
        "This site has no jurisdiction profile, so no accumulation period can be read for it. Nothing was moved.",
      correlationId: ctx.correlationId,
      context: { rule: "3.10", containerId: input.target.id },
    });
  }

  const resolution = await data.ruleVersions.resolve(ctx, {
    ruleKeys: [ACCUMULATION_RULE_KEY],
    jurisdictionId,
    asOf,
  });
  const rule = resolution.ok
    ? resolution.resolved.rules[ACCUMULATION_RULE_KEY]
    : resolution.partial.rules[ACCUMULATION_RULE_KEY];
  if (rule === undefined) {
    throw new RuleResolutionError({
      userMessage: `No accumulation period is on record for this site on ${asOf}, the date the receiving container's clock would start from. Nothing was moved.`,
      correlationId: ctx.correlationId,
      context: { rule: "4.5", asOf, containerId: input.target.id },
    });
  }
  return rule;
}
