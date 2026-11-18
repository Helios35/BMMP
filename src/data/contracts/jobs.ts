import type { IsoTimestamp, Uuid } from "@/types/common";

import type { HazardRankingComputation } from "@/domain/hazard/run";

import type {
  HazardRankingPlan,
  HazardRankingRunRecorded,
} from "./hazard-rankings";
import type {
  DeadlineAlertDraft,
  DeadlineAlertReading,
  DeadlineAlertsRecorded,
  ProducerObligationJobPlan,
  ProducerRunRecorded,
} from "./producer";
import type { ProducerRunPlan } from "@/domain/producer";
import type {
  RecallCheckRecorded,
  RecallCheckRecording,
  RecallSyncPlan,
} from "./recalls";

/**
 * Scheduled jobs — `TECHNICAL_SPEC.md` §7.2 (`POST /api/jobs/*`), §11.2.
 *
 * **The one context in this contract that is not a person's.** A cron
 * invocation has no session, no user and no single organization: it is the
 * platform acting on every tenant's clocks at once. It is therefore its own
 * shape rather than a `RequestContext` with invented fields — a job that
 * claimed a user id would be a job whose audit rows named someone who did
 * nothing. Every row it writes is T-60 `scheduled_job`, with no actor user,
 * and every write lands inside the organization that owns the row.
 *
 * Under Supabase this is a `security definer` function called by the route
 * handler with the service-role key, which `TECHNICAL_SPEC.md` §9.5 already
 * reserves for server-only route handlers that write their own audit rows.
 */
export interface ScheduledJobContext {
  /** T-60 `actor_label` on every row the job writes. */
  readonly job:
    | "storage-clock-alerts"
    | "recall-sync"
    | "hazard-ranking"
    | "producer-obligations";
  /** Threads one run through every row it writes. */
  readonly correlationId: string;
}

/** `TECHNICAL_SPEC.md` §7.2 — `200 { evaluated, fired }`. */
export interface StorageClockAlertRun {
  /** Clocks whose `nextAlertAt` had come due and were evaluated. */
  readonly evaluated: number;
  /** Alerts raised. A second run over the same instant fires none. */
  readonly fired: number;
}

export interface ScheduledJobRepository {
  /**
   * The producer-obligations job's reading half — Rules 8.11, 8.13; D-78 #10,
   * #11. Every organization with a declared product, with its run inputs, and
   * the alert configuration in force. An organization with no product is not
   * in the plan, so it gets no run and no audit row.
   */
  producerObligationPlan(
    job: ScheduledJobContext,
  ): Promise<ProducerObligationJobPlan>;

  /** One organization's run, written as the job — the same write path as **Check now**. */
  recordProducerObligations(
    job: ScheduledJobContext,
    organizationId: Uuid,
    plan: ProducerRunPlan,
  ): Promise<ProducerRunRecorded>;

  /** One organization's open deadlines, after its run, for its alerts to be decided from. */
  deadlineAlertSubjects(
    job: ScheduledJobContext,
    organizationId: Uuid,
  ): Promise<DeadlineAlertReading>;

  /**
   * Raise the wanted alerts not already open and resolve the open ones no
   * longer wanted (Rule 8.13). Idempotent on the dedupe key.
   */
  recordDeadlineAlerts(
    job: ScheduledJobContext,
    organizationId: Uuid,
    wanted: readonly DeadlineAlertDraft[],
    at: IsoTimestamp,
  ): Promise<DeadlineAlertsRecorded>;

  /**
   * The ranking job's reading half — Rule 10.24; D-77 #6. Every
   * organization's ranking inputs, and the scheme in force. The domain
   * computes each organization's run; it is written back one organization at
   * a time with `recordHazardRanking`.
   */
  hazardRankingPlan(job: ScheduledJobContext): Promise<HazardRankingPlan>;

  /**
   * One organization's run, written as the job — T-60 `scheduled_job`, no
   * person — with the same write path as **Rank now** (Rule 10.26).
   */
  recordHazardRanking(
    job: ScheduledJobContext,
    organizationId: Uuid,
    computation: HazardRankingComputation,
  ): Promise<HazardRankingRunRecorded>;

  /**
   * The nightly recall check's reading half — Rule 10.10; D-73 #6. Every
   * record in `confirmed`, `classified`, `reclassifying`, `stored`,
   * `quarantined` or `staged`, across organizations, with its catalog entry,
   * and the recall-match configuration the run applies. The sources are
   * asked outside this seam; the run is written back one record at a time
   * with `recordRecallCheck`.
   */
  recallSyncPlan(job: ScheduledJobContext): Promise<RecallSyncPlan>;

  /**
   * One record's nightly check, written as the job — T-60 `scheduled_job`,
   * no person — inside the organization that owns the record.
   */
  recordRecallCheck(
    job: ScheduledJobContext,
    organizationId: Uuid,
    input: RecallCheckRecording,
  ): Promise<RecallCheckRecorded>;

  /**
   * Fire every due storage-clock alert — Rules 4.13–4.15, 4.6.
   *
   * Picks unstopped clocks with `nextAlertAt <= at`, across organizations,
   * and runs **the same evaluation and write path as the on-write re-tier**
   * for each, per organization. It only ever moves `nextAlertAt` forward, so
   * **a second run fires nothing**; it never pauses, extends or restarts a
   * clock (Rule 4.6).
   */
  runStorageClockAlerts(
    job: ScheduledJobContext,
    at: IsoTimestamp,
  ): Promise<StorageClockAlertRun>;
}
