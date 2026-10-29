import { data } from "@/data";
import type { ScheduledJobContext } from "@/data/contracts";
import type { IsoTimestamp } from "@/types/common";

import { askSources, identitiesOf } from "./check";

/**
 * `POST /api/jobs/recall-sync` — the nightly check (Rule 10.10; D-73 #6;
 * `TECHNICAL_SPEC.md` §7.2).
 *
 * Every record in `confirmed`, `classified`, `reclassifying`, `stored`,
 * `quarantined` or `staged`, across organizations, checked the way a commit
 * checks it and written as the job — T-60 `scheduled_job`, no person. A
 * recall found again makes no second row (Rule 10.18), so a second run finds
 * nothing new; a source that did not answer last night is asked again
 * (Rule 10.17). One record at a time: an unauthenticated public source is a
 * courtesy (§12.3), and the fixture needs no more.
 */

export interface RecallSyncRun {
  /** Records checked. */
  readonly checked: number;
  /** Possible matches written for the first time. */
  readonly matched: number;
}

const NO_REQUEST = {
  requestId: null,
  ipAddress: null,
  userAgent: null,
} as const;

export async function runRecallSync(
  job: ScheduledJobContext,
  at: IsoTimestamp,
): Promise<RecallSyncRun> {
  const plan = await data.jobs.recallSyncPlan(job);
  let checked = 0;
  let matched = 0;
  for (const target of plan.targets) {
    const runs = await askSources(
      identitiesOf(target),
      plan.configuration,
      job.correlationId,
    );
    const recorded = await data.jobs.recordRecallCheck(
      job,
      target.organizationId,
      {
        batteryRecordId: target.record.id,
        trigger: "nightly",
        configurationVersion: plan.configuration.configurationVersion,
        runs,
        at,
        attribution: NO_REQUEST,
      },
    );
    checked += 1;
    matched += recorded.found.length;
  }
  return { checked, matched };
}
