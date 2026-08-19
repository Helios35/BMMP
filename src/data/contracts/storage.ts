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
}

export type ContainerRepository = Repository<
  Container,
  CreateContainer,
  UpdateContainer,
  ContainerQuery
>;

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
