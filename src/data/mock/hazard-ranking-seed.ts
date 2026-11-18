import { computeHazardRanking } from "@/domain/hazard/run";
import { validateHazardRankingScheme } from "@/domain/hazard/scheme";
import type { AuditEvent } from "@/types/audit";
import type { HazardRanking } from "@/types/condition";

import * as FIXTURES from "./fixtures";
import {
  AUDIT,
  HAZARD_RANKING_RUN,
  ORG,
  hazardRankingRowId,
} from "./fixtures/ids";
import { PLATFORM_HAZARD_RANKING_SCHEME } from "./fixtures/platform-configuration";
import { gatherHazardRankingInputs } from "./hazard-ranking-inputs";
import { rankingRowFrom } from "./hazard-ranking-rows";

/**
 * Cascade's seeded ranking run — `b2-11`'s fixture item: "one ranking run at a
 * fixed timestamp, so the screens show a ranking before anyone presses Rank
 * now".
 *
 * **Computed, not typed.** The rows are what the real domain produces from
 * the fixture records at {@link FIXTURES.SEEDED_RANKING_AT}, through the same
 * input gathering and row builder a live run uses, so a seeded ranking can
 * never disagree with the records it read — and nothing reads "Changed since"
 * until a spec changes one. Written as the job, with its one
 * `hazard_ranking.computed` row (Rule 10.26). Ids are fixed.
 *
 * Rainier is not seeded: its one held battery reads "Not ranked yet" until a
 * run, which is the `not_ranked` subject.
 */

export interface HazardRankingSeed {
  readonly rankings: readonly HazardRanking[];
  readonly auditEvent: AuditEvent;
}

const RUN_LABEL = "hazard-ranking";

function buildSeed(): HazardRankingSeed {
  const validation = validateHazardRankingScheme(
    PLATFORM_HAZARD_RANKING_SCHEME,
  );
  if (!validation.ok) {
    throw new Error(
      `The fixture ranking scheme is invalid: ${validation.issues.join("; ")}`,
    );
  }
  const at = FIXTURES.SEEDED_RANKING_AT;
  const computation = computeHazardRanking(
    gatherHazardRankingInputs(
      {
        organizations: FIXTURES.organizations,
        users: FIXTURES.users,
        batteryRecords: FIXTURES.batteryRecords,
        catalogEntries: FIXTURES.catalogEntries,
        damageAssessments: FIXTURES.damageAssessments,
        recallMatches: FIXTURES.recallMatches,
        recallCheckRuns: FIXTURES.recallCheckRuns,
        containers: FIXTURES.containers,
        lots: FIXTURES.lots,
      },
      ORG.cascade,
    ),
    validation.scheme,
    at,
  );
  const runId = HAZARD_RANKING_RUN.cascadeSeeded;
  const rankings = computation.rows.map((draft, index) =>
    rankingRowFrom({
      id: hazardRankingRowId(index + 1),
      organizationId: ORG.cascade,
      runId,
      draft,
      computation,
      supersedes: null,
      createdAt: at,
    }),
  );
  const auditEvent: AuditEvent = {
    id: AUDIT.hazardRankingSeeded,
    sequenceNo: FIXTURES.auditEvents.length + 1,
    organizationId: ORG.cascade,
    actorUserId: null,
    actorType: "scheduled_job",
    actorLabel: RUN_LABEL,
    eventType: "hazard_ranking.computed",
    entityTable: "hazard_ranking",
    entityId: runId,
    occurredAt: at,
    recordedAt: at,
    beforeState: null,
    afterState: {
      runId,
      computedAt: at,
      schemeVersion: computation.schemeVersion,
      ranked: computation.rows.length,
      batteries: computation.counts.battery_record,
      containers: computation.counts.container,
      lots: computation.counts.lot,
    },
    changedFields: null,
    governingRuleVersionId: null,
    ruleVersionsApplied: null,
    correlationId: "corr-hazard-ranking-seed",
    requestId: null,
    ipAddress: null,
    userAgent: null,
    reason: null,
    createdAt: at,
  };
  return { rankings, auditEvent };
}

/** Built once per process — the fixtures it reads are fixed. */
export const HAZARD_RANKING_SEED: HazardRankingSeed = buildSeed();
