import type { RequestContext } from "./context";
import type { Page, PageRequest } from "./repository";
import type { StorageWriteAttribution } from "./storage";
import type {
  CurrentDeadline,
  CurrentObligation,
  DeadlineAlertDraft,
  DeadlineAlertSubject,
  ObligationAlertConfiguration,
  ProducerEvaluationInputs,
  ProducerRunCounts,
  ProducerRunPlan,
  RunTrigger,
} from "@/domain/producer";
import type { ObligationDeadlineStatus } from "@/domain/taxonomy/obligation-deadline-status";
import type { ProducerObligationStatus } from "@/domain/taxonomy/producer-obligation-status";
import type { IsoDate, IsoTimestamp, TimeZone, Uuid } from "@/types/common";
import type {
  ObligationDeadline,
  ProducerObligation,
  ProducerProduct,
} from "@/types/producer";

/**
 * Producer obligations — Rules 8.6–8.16; D-78; `TECHNICAL_SPEC.md` §9.5.
 *
 * Three repositories behind the seam, each with a Supabase twin that refuses
 * until unit 17:
 *
 * - `producerProducts` — what P3 declares, and the states it is sold in
 * - `producerObligations` — the run's reading half and its one writer
 * - `obligationDeadlines` — the dates, and marking one done or reopening it
 *
 * **The adapter fetches; `src/domain/producer` decides; the adapter writes**,
 * one run at a time with one audit row (Rule 8.11). Every change and every
 * denial writes an `audit_event` (Rule 8.15).
 */

// --- producer_product -----------------------------------------------------------------------

export interface ProducerProductQuery extends PageRequest {
  /** Removed products are kept (removal is a dated update); off by default. */
  readonly includeRemoved?: boolean;
}

export interface AddProducerProduct {
  readonly catalogEntryId: Uuid;
  readonly jurisdictionIds: readonly Uuid[];
  readonly at: IsoTimestamp;
  readonly attribution: StorageWriteAttribution;
}

export interface ChangeProducerProductStates {
  readonly jurisdictionIds: readonly Uuid[];
  readonly at: IsoTimestamp;
  readonly attribution: StorageWriteAttribution;
}

export interface RemoveProducerProduct {
  readonly reason: string;
  readonly at: IsoTimestamp;
  readonly attribution: StorageWriteAttribution;
}

export interface ProducerProductRepository {
  list(
    ctx: RequestContext,
    query: ProducerProductQuery,
  ): Promise<Page<ProducerProduct>>;
  get(ctx: RequestContext, id: Uuid): Promise<ProducerProduct | null>;
  /** P3 or P6. A published catalog entry, not already declared (Rule 8.6). */
  add(ctx: RequestContext, input: AddProducerProduct): Promise<ProducerProduct>;
  /** P3 or P6. Before and after on the audit row. */
  changeStates(
    ctx: RequestContext,
    id: Uuid,
    input: ChangeProducerProductStates,
  ): Promise<ProducerProduct>;
  /** P3 or P6, with a reason. A dated update — never a delete. */
  remove(
    ctx: RequestContext,
    id: Uuid,
    input: RemoveProducerProduct,
  ): Promise<ProducerProduct>;
}

// --- producer_obligation --------------------------------------------------------------------

export interface ProducerObligationQuery extends PageRequest {
  readonly jurisdictionId?: Uuid;
  readonly isCurrent?: boolean;
  readonly status?: ProducerObligationStatus;
}

/** Everything one run reads, for one organization. */
export interface ProducerRunInputs {
  readonly timeZone: TimeZone;
  readonly evaluation: ProducerEvaluationInputs;
  readonly current: {
    readonly obligations: readonly CurrentObligation[];
    readonly deadlines: readonly CurrentDeadline[];
  };
}

export interface ProducerRunWrite {
  readonly plan: ProducerRunPlan;
  readonly attribution: StorageWriteAttribution;
}

export interface ProducerRunRecorded {
  readonly runId: Uuid;
  readonly asOf: IsoDate;
  readonly trigger: RunTrigger;
  readonly evaluatedAt: IsoTimestamp;
  readonly counts: ProducerRunCounts;
  /** Open deadline alerts resolved because their deadline was withdrawn. */
  readonly alertsResolved: number;
}

/** When the organization's obligations were last checked, and why. */
export interface ProducerLastRun {
  readonly at: IsoTimestamp;
  readonly trigger: RunTrigger;
}

export interface ProducerObligationRepository {
  list(
    ctx: RequestContext,
    query: ProducerObligationQuery,
  ): Promise<Page<ProducerObligation>>;
  /** The run's reading half — products with their catalog facts, the rule data, the current rows. */
  inputs(ctx: RequestContext): Promise<ProducerRunInputs>;
  /**
   * **Check now** and a product change — P3 or P6 (Rule 8.11). Writes only
   * what changed, carries deadlines, never undoes a completion, and writes
   * one `producer_obligation.evaluated` row.
   */
  run(
    ctx: RequestContext,
    input: ProducerRunWrite,
  ): Promise<ProducerRunRecorded>;
  /** The latest run's time and trigger, or `null` before the first. */
  lastRun(ctx: RequestContext): Promise<ProducerLastRun | null>;
}

// --- obligation_deadline --------------------------------------------------------------------

export interface ObligationDeadlineQuery extends PageRequest {
  readonly producerObligationId?: Uuid;
  readonly status?: ObligationDeadlineStatus;
}

export interface CompleteObligationDeadline {
  /** The date it was met. Never after today in the organization's zone. */
  readonly completedOn: IsoDate;
  readonly note: string;
  readonly reference: string | null;
  readonly at: IsoTimestamp;
  readonly attribution: StorageWriteAttribution;
}

export interface ReopenObligationDeadline {
  readonly reason: string;
  readonly at: IsoTimestamp;
  readonly attribution: StorageWriteAttribution;
}

export interface ObligationDeadlineRepository {
  list(
    ctx: RequestContext,
    query: ObligationDeadlineQuery,
  ): Promise<Page<ObligationDeadline>>;
  get(ctx: RequestContext, id: Uuid): Promise<ObligationDeadline | null>;
  /** P3 or P6 — an open deadline, with a date and a note (Rule 8.12). Resolves its alerts. */
  complete(
    ctx: RequestContext,
    id: Uuid,
    input: CompleteObligationDeadline,
  ): Promise<ObligationDeadline>;
  /** P3 or P6 — a done deadline, with a reason (Rule 8.12). */
  reopen(
    ctx: RequestContext,
    id: Uuid,
    input: ReopenObligationDeadline,
  ): Promise<ObligationDeadline>;
}

// --- the nightly job ------------------------------------------------------------------------

export interface ProducerObligationJobPlan {
  readonly configuration: ObligationAlertConfiguration;
  /** Every organization with a declared product. */
  readonly organizations: readonly {
    readonly organizationId: Uuid;
    readonly inputs: ProducerRunInputs;
  }[];
}

export interface DeadlineAlertsRecorded {
  readonly raised: number;
  readonly resolved: number;
}

/** The deadlines one organization's alerts are decided from, after its run. */
export interface DeadlineAlertReading {
  readonly subjects: readonly DeadlineAlertSubject[];
}

export type { DeadlineAlertDraft };
