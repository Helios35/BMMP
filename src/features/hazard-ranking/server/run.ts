import "server-only";

import { data } from "@/data";
import type {
  HazardRankingRunRecorded,
  RequestContext,
  ScheduledJobContext,
} from "@/data/contracts";
import type { StorageWriteAttribution } from "@/data/contracts/storage";
import { computeHazardRanking } from "@/domain/hazard/run";
import type { IsoTimestamp } from "@/types/common";

/**
 * A ranking run — Rules 10.24, 10.26; D-77 #6.
 *
 * **The adapter fetches; the domain decides; the adapter writes.** The scheme
 * and the organization's inputs are read through `src/data`, the run is
 * computed by `src/domain/hazard`, and the rows go back through `src/data` in
 * one write with one audit row. All three kinds are ranked at once.
 */

/** **Rank now** — P2 or P6, for the organization they are in (Rule 10.24). */
export async function rankNowFor(
  ctx: RequestContext,
  at: IsoTimestamp,
  attribution: StorageWriteAttribution,
): Promise<HazardRankingRunRecorded> {
  const [scheme, inputs] = await Promise.all([
    data.platformConfiguration.readHazardRankingScheme(ctx),
    data.hazardRankings.inputs(ctx),
  ]);
  return data.hazardRankings.run(ctx, {
    computation: computeHazardRanking(inputs, scheme, at),
    attribution,
  });
}

/**
 * The ranking job — every organization, as T-60 `scheduled_job`. An
 * organization with nothing held and no current rows gets no run and no
 * audit row: there is nothing to rank and nothing to retire.
 */
export async function runHazardRankingJob(
  job: ScheduledJobContext,
  at: IsoTimestamp,
): Promise<{ readonly ranked: number }> {
  const plan = await data.jobs.hazardRankingPlan(job);
  let ranked = 0;
  for (const organization of plan.organizations) {
    const computation = computeHazardRanking(
      organization.inputs,
      plan.scheme,
      at,
    );
    if (computation.rows.length === 0 && !organization.hasCurrentRankings) {
      continue;
    }
    const recorded = await data.jobs.recordHazardRanking(
      job,
      organization.organizationId,
      computation,
    );
    ranked += recorded.ranked;
  }
  return { ranked };
}
