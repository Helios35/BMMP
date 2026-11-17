import { itemKey } from "@/domain/hazard/run";
import type {
  HazardRankingComputation,
  HazardRankingDraft,
} from "@/domain/hazard/run";
import type { HazardRankingScope } from "@/domain/taxonomy/hazard-ranking-scope";
import type { IsoTimestamp, Uuid } from "@/types/common";
import type { HazardRanking } from "@/types/condition";

/**
 * A run's drafts as stored rows — one builder, used by the live write and by
 * the fixture seed, so a seeded row and a written one cannot differ in shape.
 * No import from the store.
 */

export function rankedItemId(row: HazardRanking): Uuid {
  return row.batteryRecordId ?? row.containerId ?? row.lotId ?? "";
}

function ids(
  scope: HazardRankingScope,
  itemId: Uuid,
): Pick<HazardRanking, "batteryRecordId" | "containerId" | "lotId"> {
  return {
    batteryRecordId: scope === "battery_record" ? itemId : null,
    containerId: scope === "container" ? itemId : null,
    lotId: scope === "lot" ? itemId : null,
  };
}

export function rankingRowFrom(input: {
  readonly id: Uuid;
  readonly organizationId: Uuid;
  readonly runId: Uuid;
  readonly draft: HazardRankingDraft;
  readonly computation: HazardRankingComputation;
  readonly supersedes: Uuid | null;
  readonly createdAt: IsoTimestamp;
}): HazardRanking {
  const { draft } = input;
  return {
    id: input.id,
    organizationId: input.organizationId,
    runId: input.runId,
    scopeType: draft.scopeType,
    ...ids(draft.scopeType, draft.itemId),
    comparisonSet: draft.comparisonSet,
    rankPosition: draft.rankPosition,
    rankedSetSize: draft.rankedSetSize,
    levelWithCount: draft.levelWithCount,
    band: draft.band,
    basisStatement: draft.basisStatement,
    factorCodes: [...draft.factorCodes],
    factors: draft.factors.map((entry) => ({ ...entry })),
    why: {
      above: draft.why.above,
      below: draft.why.below,
      levelWithLabels: [...draft.why.levelWithLabels],
    },
    inputsSignature: draft.inputsSignature,
    schemeVersion: input.computation.schemeVersion,
    governingRuleVersionId: null,
    computedAt: input.computation.computedAt,
    isCurrent: true,
    supersedesHazardRankingId: input.supersedes,
    createdAt: input.createdAt,
  };
}

/** The current row per item, keyed `<scope>:<id>`. */
export function currentByItem(
  rows: readonly HazardRanking[],
): ReadonlyMap<string, HazardRanking> {
  return new Map(
    rows
      .filter((row) => row.isCurrent)
      .map((row) => [itemKey(row.scopeType, rankedItemId(row)), row]),
  );
}
