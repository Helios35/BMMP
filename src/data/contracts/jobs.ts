import type { IsoTimestamp } from "@/types/common";

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
  readonly job: "storage-clock-alerts";
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
