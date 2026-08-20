import type { RequestContext } from "./context";
import type {
  AppendInput,
  AppendOnlyRepository,
  BaseQuery,
  CreateInput,
  Repository,
  UpdateInput,
} from "./repository";
import type { BatteryRecord } from "@/types/battery-record";
import type { CatalogEntry } from "@/types/catalog";
import type {
  DateCodeDecode,
  IntakePhoto,
  IntakeSession,
  LabelExtraction,
} from "@/types/intake";
import type { ApplicationClass } from "@/domain/taxonomy/application-class";
import type { BatteryRecordStatus } from "@/domain/taxonomy/battery-record-status";
import type { CatalogEntryStatus } from "@/domain/taxonomy/catalog-entry-status";
import type { Chemistry } from "@/domain/taxonomy/chemistry";
import type { ConfidenceBand } from "@/domain/taxonomy/confidence-band";
import type { DdrFlag } from "@/domain/taxonomy/ddr-flag";
import type { IntakeSessionStatus } from "@/domain/taxonomy/intake-session-status";
import type { LabelFieldCode } from "@/domain/taxonomy/label-field-code";
import type { Decimal, IsoTimestamp, Uuid } from "@/types/common";

/** Battery, catalog and intake contracts — `ERD.md` §5. */

// --- battery_record ---------------------------------------------------------

/**
 * `recordNumber` is allocated from `organization.battery_record_seq` in the
 * insert transaction.
 *
 * `ddrFlags` and `isAirTransportProhibited` are absent for the same reason they
 * are absent from the update shape: they are **set by rule evaluation from a
 * confirmed damage assessment** (Rules 6.4, 6.5), and an intake that could
 * declare a record air-eligible at creation would be a route around Rule 6.8.
 * A new record starts with no flags; the assessment sets them.
 */
export type CreateBatteryRecord = CreateInput<
  BatteryRecord,
  "recordNumber" | "ddrFlags" | "isAirTransportProhibited"
>;

/**
 * `ddrFlags` and `isAirTransportProhibited` are **set by rule evaluation, not by
 * a caller** (Rules 6.4, 6.5), and the second has **no override path for any
 * role, including P6** (Rule 6.8) — so neither is settable here. They move only
 * through a `damage_assessment`, which is the single clearing path Rule 6.11
 * defines.
 */
export type UpdateBatteryRecord = UpdateInput<
  BatteryRecord,
  "recordNumber" | "ddrFlags" | "isAirTransportProhibited"
>;

export interface BatteryRecordQuery extends BaseQuery {
  readonly status?: BatteryRecordStatus;
  readonly containerId?: Uuid;
  readonly catalogEntryId?: Uuid;
  readonly intakeSessionId?: Uuid;
  readonly chemistry?: Chemistry;
  /** A small mobility pack and a vehicle pack sit in the same list; this narrows it. */
  readonly applicationClass?: ApplicationClass;
  readonly serialNumber?: string;
  /** Any non-empty `ddr_flags`. */
  readonly hasDdrFlag?: boolean;
  readonly ddrFlag?: DdrFlag;
  readonly isAirTransportProhibited?: boolean;
  /** Excludes `voided` records, which are retained but sit outside every operational count. */
  readonly excludeVoided?: boolean;
}

export type BatteryRecordRepository = Repository<
  BatteryRecord,
  CreateBatteryRecord,
  UpdateBatteryRecord,
  BatteryRecordQuery
>;

// --- catalog_entry ----------------------------------------------------------

export type CreateCatalogEntry = CreateInput<
  CatalogEntry,
  "partNumberNormalized" | "verifiedBy" | "verifiedAt"
> & {
  /** Null proposes a global platform entry; only P6 may do that. */
  readonly organizationId: Uuid | null;
};

export type UpdateCatalogEntry = UpdateInput<
  CatalogEntry,
  "partNumberNormalized" | "organizationId"
>;

export interface CatalogQuery extends BaseQuery {
  readonly status?: CatalogEntryStatus;
  readonly manufacturerName?: string;
  readonly applicationClass?: ApplicationClass;
  readonly chemistry?: Chemistry;
  /** `organization_id is null` — the shared platform catalog. */
  readonly isGlobal?: boolean;
}

/** What retrieval is given. Ranking is not done here. */
export interface CatalogCandidateFilter {
  readonly manufacturerNormalized?: string;
  readonly partNumberNormalized?: string;
  readonly voltageV?: Decimal;
  readonly energyWh?: Decimal;
  readonly limit: number;
}

export interface CatalogRepository extends Repository<
  CatalogEntry,
  CreateCatalogEntry,
  UpdateCatalogEntry,
  CatalogQuery
> {
  /**
   * **Retrieval only. Ranking is pure domain code** (`TECHNICAL_SPEC.md` §11.1
   * step 4).
   *
   * Ranking lives in `src/domain/catalog/match.ts` rather than in SQL for one
   * specific reason: a Postgres trigram query would have to be approximated in
   * JavaScript by the mock, the two would diverge, and the Playwright suite
   * would pass on mock while behaving differently on Supabase. **One pure scorer
   * means both adapters produce identical rankings.**
   *
   * Returns a bounded candidate set. **Rule 2.19 forbids auto-selecting a top
   * candidate or silently narrowing a list to one** — several plausible entries
   * are presented and a human picks.
   */
  findCandidates(
    ctx: RequestContext,
    filter: CatalogCandidateFilter,
  ): Promise<readonly CatalogEntry[]>;
}

// --- intake_session ---------------------------------------------------------

export type CreateIntakeSession = CreateInput<
  IntakeSession,
  | "batteryRecordId"
  | "reviewedBy"
  | "reviewedAt"
  | "reviewOutcome"
  | "completedAt"
>;

export type UpdateIntakeSession = UpdateInput<
  IntakeSession,
  "correlationId" | "startedBy" | "startedAt" | "gateThresholdsApplied"
>;

export interface IntakeSessionQuery extends BaseQuery {
  readonly status?: IntakeSessionStatus;
  /** The `/review` queue. */
  readonly isReviewRequired?: boolean;
  readonly startedBy?: Uuid;
  readonly batteryRecordId?: Uuid;
  readonly correlationId?: string;
}

/**
 * Everything one confirmation commits, in one payload.
 *
 * The shape is deliberately whole rather than a sequence of calls: there is no
 * state in which a battery has a shipping-ready record but no classification
 * decision or no running clock (`TECHNICAL_SPEC.md` §11.1 step 6).
 */
export interface IntakeConfirmation {
  readonly intakeSessionId: Uuid;
  /** The confirmed record fields. Chemistry, model and condition are confirmed per field. */
  readonly batteryRecord: CreateBatteryRecord;
  /**
   * Which fields the human confirmed, and by whom.
   *
   * **Confirmation is per field and attributable — Rule 2.21 forbids "confirmed
   * by the system" as a value.**
   */
  readonly confirmedFields: readonly {
    readonly fieldCode: LabelFieldCode;
    readonly confirmedBy: Uuid;
    readonly confirmedAt: IsoTimestamp;
  }[];
  /** The catalog entry a human picked. Never auto-selected (Rule 2.19). */
  readonly catalogEntryId: Uuid | null;
  /** Where the record is placed. Placement starts the clock (Rule 4.4). */
  readonly containerId: Uuid | null;
}

export interface IntakeRepository extends Repository<
  IntakeSession,
  CreateIntakeSession,
  UpdateIntakeSession,
  IntakeSessionQuery
> {
  /**
   * **One transaction.** Writes `battery_record`, links `catalog_entry`, records
   * the confirmations, inserts `date_code_decode`, `damage_assessment` and
   * `classification_decision`, starts the `storage_clock`, closes the session,
   * and writes every `audit_event`. **All or nothing.**
   *
   * Splitting this into separate calls is how a half-committed intake reaches
   * production. If any step fails, none of it happened.
   */
  commitConfirmation(
    ctx: RequestContext,
    input: IntakeConfirmation,
  ): Promise<BatteryRecord>;
}

// --- intake_photo -----------------------------------------------------------

export type CreateIntakePhoto = AppendInput<IntakePhoto>;

export interface IntakePhotoQuery extends BaseQuery {
  readonly intakeSessionId?: Uuid;
  /** Non-null `parentIntakePhotoId` — the label crops. */
  readonly isCrop?: boolean;
  readonly parentIntakePhotoId?: Uuid;
  readonly photoType?: string;
}

export type IntakePhotoRepository = AppendOnlyRepository<
  IntakePhoto,
  CreateIntakePhoto,
  IntakePhotoQuery
>;

// --- label_extraction -------------------------------------------------------

export type CreateLabelExtraction = AppendInput<LabelExtraction>;

export interface LabelExtractionQuery extends BaseQuery {
  readonly intakeSessionId?: Uuid;
  readonly intakePhotoId?: Uuid;
  readonly extractionRunId?: Uuid;
  readonly fieldCode?: LabelFieldCode;
  readonly confidenceBand?: ConfidenceBand;
  readonly provider?: string;
}

/**
 * **One row per field per extraction.** A re-extraction appends a new run's rows
 * and never overwrites the previous run's (T-10), which is why this is
 * append-only and why there is no aggregate-confidence anything.
 */
export type LabelExtractionRepository = AppendOnlyRepository<
  LabelExtraction,
  CreateLabelExtraction,
  LabelExtractionQuery
>;

// --- date_code_decode -------------------------------------------------------

export type CreateDateCodeDecode = AppendInput<DateCodeDecode>;

export interface DateCodeDecodeQuery extends BaseQuery {
  readonly batteryRecordId?: Uuid;
  readonly intakeSessionId?: Uuid;
  readonly formatKey?: string;
}

export type DateCodeDecodeRepository = AppendOnlyRepository<
  DateCodeDecode,
  CreateDateCodeDecode,
  DateCodeDecodeQuery
>;
