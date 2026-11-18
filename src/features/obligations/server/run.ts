import "server-only";

import { data } from "@/data";
import type {
  ProducerRunRecorded,
  RequestContext,
  ScheduledJobContext,
} from "@/data/contracts";
import type { StorageWriteAttribution } from "@/data/contracts/storage";
import {
  evaluateProducerObligations,
  planProducerRun,
  wantedDeadlineAlerts,
  type RunTrigger,
} from "@/domain/producer";
import { civilDateInZone } from "@/domain/storage/clock-display";
import type { IsoTimestamp } from "@/types/common";

/**
 * An evaluation run — Rules 8.11, 8.13; D-78 #11.
 *
 * **The adapter fetches; the domain decides; the adapter writes.** One run
 * evaluates the whole organization **as of today in its own time zone**, with
 * the rule versions in force that day (Rule 1.23); the plan comes back from
 * `src/domain/producer` and goes into `src/data` in one write with one audit
 * row.
 */

/** **Check now**, or the run a product change sets off — P3 or P6 (Rule 8.11). */
export async function checkObligationsFor(
  ctx: RequestContext,
  at: IsoTimestamp,
  attribution: StorageWriteAttribution,
  trigger: Exclude<RunTrigger, "nightly_job">,
): Promise<ProducerRunRecorded> {
  const inputs = await data.producerObligations.inputs(ctx);
  const today = civilDateInZone(at, inputs.timeZone);
  const plan = planProducerRun(
    evaluateProducerObligations(inputs.evaluation, today),
    inputs.current,
    trigger,
  );
  return data.producerObligations.run(ctx, { plan, attribution });
}

/**
 * The nightly job — every organization with a declared product, as T-60
 * `scheduled_job`: its run, then its deadline alerts raised and resolved
 * (Rule 8.13). An organization with no product is not in the plan, so it has
 * no run and no audit row.
 */
export async function runProducerObligationsJob(
  job: ScheduledJobContext,
  at: IsoTimestamp,
): Promise<{ readonly evaluated: number; readonly raised: number }> {
  const plan = await data.jobs.producerObligationPlan(job);
  let evaluated = 0;
  let raised = 0;
  for (const organization of plan.organizations) {
    const today = civilDateInZone(at, organization.inputs.timeZone);
    await data.jobs.recordProducerObligations(
      job,
      organization.organizationId,
      planProducerRun(
        evaluateProducerObligations(organization.inputs.evaluation, today),
        organization.inputs.current,
        "nightly_job",
      ),
    );
    evaluated += 1;
    const reading = await data.jobs.deadlineAlertSubjects(
      job,
      organization.organizationId,
    );
    const recorded = await data.jobs.recordDeadlineAlerts(
      job,
      organization.organizationId,
      wantedDeadlineAlerts(reading.subjects, plan.configuration, today),
      at,
    );
    raised += recorded.raised;
  }
  return { evaluated, raised };
}
