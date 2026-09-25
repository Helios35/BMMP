import type { RequestContext } from "./context";
import type {
  AppendInput,
  AppendOnlyRepository,
  BaseQuery,
  CreateInput,
  Repository,
  UpdateInput,
} from "./repository";
import type {
  Alert,
  Container,
  Lot,
  StorageClock,
  StorageEvent,
} from "@/types/storage";
import type { AlertType } from "@/domain/taxonomy/alert-type";
import type { ContainerStatus } from "@/domain/taxonomy/container-status";
import type { ContainerType } from "@/domain/taxonomy/container-type";
import type { HandlerActivityType } from "@/domain/taxonomy/handler-activity-type";
import type { LotStatus } from "@/domain/taxonomy/lot-status";
import type { StorageClockAlertBand } from "@/domain/taxonomy/storage-clock-alert-band";
import type { StorageClockStatus } from "@/domain/taxonomy/storage-clock-status";
import type { ContentsMoveOperation } from "@/domain/storage/accumulation";
import type { ResolvedRule } from "@/domain/rules/resolve";
import type { IsoTimestamp, Uuid } from "@/types/common";

/** Storage and container contracts — `ERD.md` §6. */

// --- container --------------------------------------------------------------

export type CreateContainer = CreateInput<
  Container,
  | "containerCode"
  | "accumulationStartedAt"
  | "accumulationStartSource"
  | "currentNetMassKg"
  | "currentContainerLabelId"
>;

/**
 * `accumulationStartedAt` is **not settable through this contract, by any role**.
 *
 * It is set by the first placement (Rule 4.4) and travels with the records
 * (Rules 4.9–4.12). There is no re-date control on any screen for any role,
 * because a re-date affordance is a way to restart a legal clock and the system
 * must make that impossible rather than merely discouraged
 * (`SITE_ARCHITECTURE.md` §5.5).
 *
 * `containerType` is effectively terminal once the container holds material:
 * changing it with contents present is unavailable, and the material moves to a
 * new container instead (Rule 4.28).
 */
export type UpdateContainer = UpdateInput<
  Container,
  | "containerCode"
  | "accumulationStartedAt"
  | "accumulationStartSource"
  | "currentNetMassKg"
>;

export interface ContainerQuery extends BaseQuery {
  readonly status?: ContainerStatus;
  readonly containerType?: ContainerType;
  readonly lotId?: Uuid;
  readonly shipmentId?: Uuid;
  /** `status = 'overdue'` — a hard state, not a warning (Rule 4.15). */
  readonly isOverdue?: boolean;
  /** Containers with an unresolved `alert` against them (`/containers?filter=alerting`). */
  readonly isAlerting?: boolean;
  /** Exact `storage_location` — the `/containers` location filter. */
  readonly storageLocation?: string;
  /**
   * The `/containers` clock-tier filter resolves to a **set** of containers: a
   * tier belongs to a clock, so the screen reads the clocks at that tier first
   * and narrows this list by the containers they run on.
   */
  readonly containerIds?: readonly Uuid[];
}

/** Who a person's request came from — stamped on the audit rows a storage write produces. */
export interface StorageWriteAttribution {
  readonly requestId: string | null;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}

/**
 * Batteries leaving one container for another — a move, a consolidation or a
 * split (Rules 4.9–4.12; T-16 `repackage` then `place`).
 *
 * **The adapter is the authority on the dates.** It reads each battery's
 * carried start from its own `place` events and the receiving container's
 * start from its own row, computes the result with `planReceipt`, and refuses
 * anything that would move a start later. The caller supplies intent, not
 * figures: which batteries, from where, to where, when — and the accumulation
 * rule for the date the receiving clock will start on, because choosing a
 * jurisdiction is not the adapter's job.
 */
export interface ContainerContentsMove {
  readonly operation: ContentsMoveOperation;
  readonly sourceContainerId: Uuid;
  readonly targetContainerId: Uuid;
  readonly batteryRecordIds: readonly Uuid[];
  /** The request instant: when the move happened, and when the receiving clock is evaluated (Rule 4.10). */
  readonly at: IsoTimestamp;
  /**
   * The accumulation rule in force at the site on the receiving container's
   * new start date (Rules 4.5, 12.20). Required whenever the move sets or
   * moves that start; the adapter refuses one not in force on the date it
   * computes. Null when the receiving start holds.
   */
  readonly accumulationRule: ResolvedRule | null;
  readonly attribution: StorageWriteAttribution;
}

export interface ContainerContentsMoveResult {
  readonly source: Container;
  readonly target: Container;
  readonly targetClock: StorageClock;
  /** The receiving start before the move. Null when it had never held a battery. */
  readonly previousTargetStart: IsoTimestamp | null;
  /** The receiving start was set or moved earlier. Never later. */
  readonly targetStartChanged: boolean;
  /** Receipt made the receiving container overdue on the spot (Rule 4.10; E-6). */
  readonly targetBecameOverdue: boolean;
  /** The source reached empty and its clock stopped (Rule 4.7). */
  readonly sourceEmptied: boolean;
}

/**
 * A storage event a person records without moving anything.
 *
 * - `inspect` — T-16, P1, P2 or P6.
 * - `remediate` — T-16, **P2 or P6 only, on an overdue container, with a typed
 *   statement of what was done and why** (Rule 4.17). It is an audited event
 *   and **changes no date and no status** — the container stays overdue and
 *   its alert stays open until the owner settles what a remediation clears
 *   (reported in `b1a-04-containers`' build-notes).
 *
 * No other T-16 value is recordable here. Which handling activities are
 * permitted is jurisdiction data (Rule 3.21) and none is carried yet, so the
 * rest are not offered and are refused if sent (Rule 3.22).
 */
export type ContainerStorageEvent =
  | {
      readonly kind: "inspect";
      readonly containerId: Uuid;
      readonly occurredAt: IsoTimestamp;
      readonly note: string | null;
      readonly at: IsoTimestamp;
      readonly attribution: StorageWriteAttribution;
    }
  | {
      readonly kind: "remediate";
      readonly containerId: Uuid;
      readonly occurredAt: IsoTimestamp;
      /** What was done with the contents, and why. Required, typed by a person. */
      readonly statement: string;
      readonly at: IsoTimestamp;
      readonly attribution: StorageWriteAttribution;
    };

/**
 * The two status moves a person makes on a container (T-24): **close** it —
 * *"Mark ready to ship"*, sealed and ready for shipment — and **retire** an
 * empty one whose clock has closed (Rule 4.30). Every other status is
 * system-assigned.
 */
export interface ContainerStatusChange {
  readonly containerId: Uuid;
  readonly status: Extract<ContainerStatus, "closed" | "retired">;
  readonly at: IsoTimestamp;
  readonly attribution: StorageWriteAttribution;
}

export interface ContainerRepository extends Repository<
  Container,
  CreateContainer,
  UpdateContainer,
  ContainerQuery
> {
  /**
   * **One operation, all or nothing.** Moves each battery's
   * `container_id`, appends a `repackage` event on the source and a `place`
   * event on the receiving container for each one, sets or moves the
   * receiving start earlier (T-62) and starts or re-bases its clock (T-64),
   * evaluates that clock as of `at` — raising the alert and the overdue hard
   * state when receipt makes it overdue — stops the source's clock if it
   * reaches empty, and writes every audit row. Under Supabase this is one
   * `security invoker` function; in the mock, one snapshot-and-restore.
   *
   * **The only writer of `battery_record.container_id` besides
   * `commitConfirmation`** — a move is a storage event, never a record edit.
   */
  moveContents(
    ctx: RequestContext,
    input: ContainerContentsMove,
  ): Promise<ContainerContentsMoveResult>;

  /** Append an inspection or a remediation, and its audit row, as one operation. */
  recordStorageEvent(
    ctx: RequestContext,
    input: ContainerStorageEvent,
  ): Promise<StorageEvent>;

  /** Close or retire a container, with its audit row, as one operation. */
  changeStatus(
    ctx: RequestContext,
    input: ContainerStatusChange,
  ): Promise<Container>;
}

// --- lot --------------------------------------------------------------------

export type CreateLot = CreateInput<
  Lot,
  "lotCode" | "chemistryMix" | "totalMassKg" | "totalEnergyWh"
>;

/** The three roll-ups are maintained by trigger, not by a caller. */
export type UpdateLot = UpdateInput<
  Lot,
  "lotCode" | "chemistryMix" | "totalMassKg" | "totalEnergyWh"
>;

export interface LotQuery extends BaseQuery {
  readonly status?: LotStatus;
}

export type LotRepository = Repository<Lot, CreateLot, UpdateLot, LotQuery>;

// --- storage_clock ----------------------------------------------------------

/**
 * Starting a clock stamps `maxDurationDays`, `dueAt`, `governingRuleVersionId`
 * and `evaluationTrace` **from the resolved rule version at that moment**
 * (Rule 4.5). The caller supplies the resolved values; it does not invent a
 * duration.
 */
export type CreateStorageClock = CreateInput<
  StorageClock,
  "stoppedAt" | "stopReason"
>;

/**
 * **The clock never pauses** (Rule 4.6). There is no hold, freeze, suspend or
 * extension in the schema or in this contract, and the absence is the
 * enforcement.
 *
 * The only movements are the alert ladder advancing and the clock stopping —
 * which is why the durable fields are all excluded here.
 */
export type UpdateStorageClock = UpdateInput<
  StorageClock,
  | "clockStartAt"
  | "clockStartBasis"
  | "timeZone"
  | "maxDurationDays"
  | "dueAt"
  | "governingRuleVersionId"
  | "evaluationTrace"
  | "subjectType"
  | "batteryRecordId"
  | "containerId"
>;

export interface StorageClockQuery extends BaseQuery {
  readonly status?: StorageClockStatus;
  readonly alertBand?: StorageClockAlertBand;
  readonly containerId?: Uuid;
  readonly batteryRecordId?: Uuid;
  /** `stopped_at is null` — the clocks still counting. */
  readonly isRunning?: boolean;
  /** `next_alert_at <= this` — what the alert job selects. */
  readonly nextAlertDueBefore?: IsoTimestamp;
}

export type StorageClockRepository = Repository<
  StorageClock,
  CreateStorageClock,
  UpdateStorageClock,
  StorageClockQuery
>;

// --- storage_event ----------------------------------------------------------

export type CreateStorageEvent = AppendInput<StorageEvent>;

export interface StorageEventQuery extends BaseQuery {
  readonly activityType?: HandlerActivityType;
  readonly containerId?: Uuid;
  readonly batteryRecordId?: Uuid;
  readonly lotId?: Uuid;
  readonly storageClockId?: Uuid;
  readonly occurredAfter?: IsoTimestamp;
  readonly occurredBefore?: IsoTimestamp;
}

export type StorageEventRepository = AppendOnlyRepository<
  StorageEvent,
  CreateStorageEvent,
  StorageEventQuery
>;

// --- alert ------------------------------------------------------------------

/**
 * Alerts are raised by the evaluation job and by triggers, **not typed by a
 * user** (`ERD.md` §6.5). The create shape exists so the job can write one.
 */
export type CreateAlert = CreateInput<
  Alert,
  "acknowledgedAt" | "acknowledgedBy" | "resolvedAt" | "resolutionReason"
>;

/**
 * **Acknowledgement and resolution only.** `alertType`, `severity`,
 * `triggerSnapshot`, `raisedAt` and `governingRuleVersionId` are frozen by
 * trigger after insert, and there is **no delete** — an alert is evidence
 * (Rule 12.9).
 *
 * An acknowledgement is itself an audited act (Rule 12.1).
 */
export interface AcknowledgeAlert {
  readonly acknowledgedAt?: IsoTimestamp;
  readonly acknowledgedBy?: Uuid;
  readonly resolvedAt?: IsoTimestamp;
  readonly resolutionReason?: string;
}

export interface AlertQuery extends BaseQuery {
  readonly alertType?: AlertType;
  readonly containerId?: Uuid;
  readonly batteryRecordId?: Uuid;
  readonly storageClockId?: Uuid;
  readonly shipmentId?: Uuid;
  readonly intakeSessionId?: Uuid;
  /** `acknowledged_at is null`. */
  readonly isUnacknowledged?: boolean;
  /** `resolved_at is null`. */
  readonly isOpen?: boolean;
  /** Filters to the alerts this role is routed (T-44). **Routing, not permission.** */
  readonly audienceRole?: string;
}

export interface AlertRepository extends Repository<
  Alert,
  CreateAlert,
  AcknowledgeAlert,
  AlertQuery
> {
  /**
   * Raise an alert idempotently on its `dedupeKey`.
   *
   * The key is stable per (subject, type, band), so a double cron run cannot
   * fire the same alert twice — and advancing `next_alert_at` happens in the
   * same transaction as the event append, which is what makes that true rather
   * than likely.
   *
   * Returns the existing open alert where one matches.
   */
  raiseIfAbsent(ctx: RequestContext, input: CreateAlert): Promise<Alert>;
}
