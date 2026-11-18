import type { RequestContext } from "@/data/contracts/context";
import type {
  HazardRankingPlan,
  HazardRankingQuery,
  HazardRankingRepository,
  HazardRankingRunRecorded,
  HazardRankingRunWrite,
} from "@/data/contracts/hazard-rankings";
import type { ScheduledJobContext } from "@/data/contracts/jobs";
import type { Page } from "@/data/contracts/repository";
import type { StorageWriteAttribution } from "@/data/contracts/storage";
import {
  mayTakeHazardRankingAction,
  rolesForHazardRankingAction,
} from "@/domain/access/hazard-ranking-actions";
import { itemKey, type HazardRankingComputation } from "@/domain/hazard/run";
import { containsProhibitedRankingWord } from "@/domain/hazard/words";
import { HAZARD_RANKING_BANDS } from "@/domain/taxonomy/hazard-ranking-band";
import type { HazardRankingScope } from "@/domain/taxonomy/hazard-ranking-scope";
import { ROLE_LABELS } from "@/domain/taxonomy/role";
import { PermissionError, ValidationError } from "@/lib/errors";
import type { JsonObject, Uuid } from "@/types/common";
import type { HazardRanking } from "@/types/condition";

import { writeJobAudit, writeTriggerAudit } from "./audit-row";
import { now } from "./factory";
import { gatherHazardRankingInputs } from "./hazard-ranking-inputs";
import {
  currentByItem,
  rankedItemId,
  rankingRowFrom,
} from "./hazard-ranking-rows";
import { nextId } from "./ids";
import { mockPlatformConfiguration } from "./platform-configuration";
import { mockStore } from "./store";

/**
 * The hazard ranking, read and written — `HazardRankingRepository` and the
 * ranking job; Rules 10.19–10.26; T-33, T-34, T-43, T-67; D-77.
 *
 * **A run is the only writer** (T-33): rows go in through the definer door,
 * the organization's previous current rows are marked not current (the
 * trigger `TECHNICAL_SPEC.md` §9.5 names), and one `hazard_ranking.computed`
 * row names the person who pressed **Rank now** or the job — together, or
 * none of it (Rule 10.26). **Nothing here orders an item or picks a band**;
 * the domain computed every row this writes.
 *
 * A row that carries a word no ranking may carry is refused rather than
 * stored (Rules 1.25, 10.3) — the last line behind the domain's own.
 */

const store = () => mockStore();

function refuse(ctx: RequestContext): never {
  const who = rolesForHazardRankingAction("rank_now")
    .map((role) => ROLE_LABELS[role])
    .join(" or ");
  throw new PermissionError({
    userMessage: `Your role cannot run a hazard ranking. ${who} can.`,
    correlationId: ctx.correlationId,
    context: { action: "rank_now", role: ctx.role, rule: "10.24" },
  });
}

function invalid(ctx: RequestContext, detail: string): never {
  throw new ValidationError({
    userMessage: "The ranking could not be recorded. Nothing was changed.",
    correlationId: ctx.correlationId,
    context: { detail },
  });
}

/** A row that says what a ranking cannot say is a defect, refused rather than stored. */
function assertCoherent(
  ctx: RequestContext,
  computation: HazardRankingComputation,
): void {
  for (const draft of computation.rows) {
    if (draft.factors.length === 0) {
      invalid(ctx, `${draft.itemLabel} carries no factor (T-34)`);
    }
    if (
      draft.factorCodes.length !== draft.factors.length ||
      draft.factors.some(
        (entry, index) => entry.code !== draft.factorCodes[index],
      )
    ) {
      invalid(ctx, `${draft.itemLabel}'s factor codes and factors disagree`);
    }
    if (!(HAZARD_RANKING_BANDS as readonly string[]).includes(draft.band)) {
      invalid(ctx, `${draft.band} is not a T-33 band`);
    }
    if (
      draft.rankedSetSize < 1 ||
      draft.rankPosition < 1 ||
      draft.rankPosition > draft.rankedSetSize
    ) {
      invalid(ctx, `${draft.itemLabel}'s position is outside its set`);
    }
    const words = [
      draft.basisStatement,
      ...draft.factors.flatMap((entry) => [entry.value, entry.basis]),
    ];
    if (words.some(containsProhibitedRankingWord)) {
      invalid(ctx, `${draft.itemLabel} carries a word no ranking may carry`);
    }
  }
}

async function atomically<T>(write: () => Promise<T>): Promise<T> {
  const s = store();
  const savedRankings = [...s.hazardRankings.all()];
  const savedAudit = [...s.auditEvents.all()];
  try {
    return await write();
  } catch (cause) {
    s.hazardRankings.replaceAll(savedRankings);
    s.auditEvents.replaceAll(savedAudit);
    throw cause;
  }
}

type RunActor =
  | { readonly kind: "person"; readonly attribution: StorageWriteAttribution }
  | { readonly kind: "job"; readonly label: string };

function runSnapshot(recorded: HazardRankingRunRecorded): JsonObject {
  return {
    runId: recorded.runId,
    computedAt: recorded.computedAt,
    schemeVersion: recorded.schemeVersion,
    ranked: recorded.ranked,
    batteries: recorded.counts.battery_record,
    containers: recorded.counts.container,
    lots: recorded.counts.lot,
  };
}

async function writeRun(
  ctx: RequestContext,
  computation: HazardRankingComputation,
  actor: RunActor,
): Promise<HazardRankingRunRecorded> {
  assertCoherent(ctx, computation);
  return atomically(async () => {
    const s = store();
    const runId = nextId();
    const previous = s.hazardRankings
      .all()
      .filter((row) => row.organizationId === ctx.organizationId);
    const current = currentByItem(previous);
    // The trigger's one update: the superseded row stops being current.
    for (const row of current.values()) {
      await s.hazardRankings.updateAsDefiner(ctx, row.id, { isCurrent: false });
    }
    for (const draft of computation.rows) {
      await s.hazardRankings.insertAsDefiner(
        ctx,
        rankingRowFrom({
          id: nextId(),
          organizationId: ctx.organizationId,
          runId,
          draft,
          computation,
          supersedes:
            current.get(itemKey(draft.scopeType, draft.itemId))?.id ?? null,
          createdAt: now(),
        }),
      );
    }
    const recorded: HazardRankingRunRecorded = {
      runId,
      computedAt: computation.computedAt,
      schemeVersion: computation.schemeVersion,
      ranked: computation.rows.length,
      counts: computation.counts,
    };
    const body = {
      eventType: "hazard_ranking.computed" as const,
      entityTable: "hazard_ranking",
      entityId: runId,
      beforeState: null,
      afterState: runSnapshot(recorded),
    };
    if (actor.kind === "person") {
      await writeTriggerAudit(
        ctx,
        computation.computedAt,
        actor.attribution,
        body,
      );
    } else {
      await writeJobAudit(ctx, computation.computedAt, actor.label, body);
    }
    return recorded;
  });
}

function matches(row: HazardRanking, query: HazardRankingQuery): boolean {
  return (
    (query.scopeType === undefined || row.scopeType === query.scopeType) &&
    (query.batteryRecordId === undefined ||
      row.batteryRecordId === query.batteryRecordId) &&
    (query.containerId === undefined ||
      row.containerId === query.containerId) &&
    (query.lotId === undefined || row.lotId === query.lotId) &&
    (query.isCurrent === undefined || row.isCurrent === query.isCurrent) &&
    (query.band === undefined || row.band === query.band)
  );
}

export const mockHazardRankings: HazardRankingRepository = {
  async list(
    ctx: RequestContext,
    query: HazardRankingQuery,
  ): Promise<Page<HazardRanking>> {
    return store().hazardRankings.list(
      ctx,
      query,
      (row) => matches(row, query),
      (a, b) =>
        b.computedAt.localeCompare(a.computedAt) ||
        a.rankPosition - b.rankPosition,
    );
  },

  async inputs(ctx: RequestContext) {
    const s = store();
    // A read like any other: the latency, the seeded failure and the tenant
    // scope all apply to it through the table it is anchored on.
    await s.batteryRecords.list(ctx, { limit: 1 }, () => false);
    return gatherHazardRankingInputs(
      {
        organizations: s.organizations.all(),
        users: s.users.all(),
        batteryRecords: s.batteryRecords.all(),
        catalogEntries: s.catalogEntries.all(),
        damageAssessments: s.damageAssessments.all(),
        recallMatches: s.recallMatches.all(),
        recallCheckRuns: s.recallCheckRuns.all(),
        containers: s.containers.all(),
        lots: s.lots.all(),
      },
      ctx.organizationId,
    );
  },

  async run(ctx: RequestContext, input: HazardRankingRunWrite) {
    if (!mayTakeHazardRankingAction(ctx.role, "rank_now")) refuse(ctx);
    return writeRun(ctx, input.computation, {
      kind: "person",
      attribution: input.attribution,
    });
  },
};

// --- the job ----------------------------------------------------------------------------------

function jobScope(organizationId: Uuid, correlationId: string): RequestContext {
  return {
    userId: "00000000-0000-0000-0000-000000000000",
    organizationId,
    role: "auditor",
    isPlatformAdmin: false,
    correlationId,
  };
}

/** Every organization's inputs and the scheme in force. Read-only. */
export async function hazardRankingPlan(
  job: ScheduledJobContext,
): Promise<HazardRankingPlan> {
  const s = store();
  const scheme = await mockPlatformConfiguration.readHazardRankingScheme(
    jobScope("00000000-0000-0000-0000-000000000000", job.correlationId),
  );
  const source = {
    organizations: s.organizations.all(),
    users: s.users.all(),
    batteryRecords: s.batteryRecords.all(),
    catalogEntries: s.catalogEntries.all(),
    damageAssessments: s.damageAssessments.all(),
    recallMatches: s.recallMatches.all(),
    recallCheckRuns: s.recallCheckRuns.all(),
    containers: s.containers.all(),
    lots: s.lots.all(),
  };
  return {
    scheme,
    organizations: s.organizations.all().map((organization) => ({
      organizationId: organization.id,
      inputs: gatherHazardRankingInputs(source, organization.id),
      hasCurrentRankings: s.hazardRankings
        .all()
        .some((row) => row.isCurrent && row.organizationId === organization.id),
    })),
  };
}

/** One organization's run, written as the job — T-60 `scheduled_job`, no person. */
export async function recordHazardRankingForJob(
  job: ScheduledJobContext,
  organizationId: Uuid,
  computation: HazardRankingComputation,
): Promise<HazardRankingRunRecorded> {
  return writeRun(jobScope(organizationId, job.correlationId), computation, {
    kind: "job",
    label: job.job,
  });
}

/** An item's current row — what the list filters and sorts read. */
export function currentRankingOf(
  organizationId: Uuid,
  scope: HazardRankingScope,
  id: Uuid,
): HazardRanking | undefined {
  return store()
    .hazardRankings.all()
    .find(
      (row) =>
        row.isCurrent &&
        row.organizationId === organizationId &&
        row.scopeType === scope &&
        rankedItemId(row) === id,
    );
}
