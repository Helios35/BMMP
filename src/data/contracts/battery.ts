import type { CreateAuditEvent } from "./audit";
import type { CreateDamageAssessment } from "./condition";
import type { RequestContext } from "./context";
import type { CreateClassificationDecision } from "./documents";
import type {
  AppendInput,
  AppendOnlyRepository,
  BaseQuery,
  CreateInput,
  Repository,
  SortRequest,
  UpdateInput,
} from "./repository";
import type { CreateStorageClock, CreateStorageEvent } from "./storage";
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
import type { CellFormFactor } from "@/domain/taxonomy/cell-form-factor";
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

/**
 * What `/batteries` may be sorted by. **`format_category` is deliberately not
 * here and never will be**: a format band is a `format_classification` keyed on
 * `(battery_record, jurisdiction, rule_version)`, one record carries several,
 * and a column that sorts by one of them has asserted an organization-wide
 * format value (`SITE_ARCHITECTURE.md` §7.6b).
 */
export type BatteryRecordSortField =
  "recordNumber" | "manufacturerName" | "assessedCondition" | "createdAt";

export interface BatteryRecordQuery
  extends BaseQuery, SortRequest<BatteryRecordSortField> {
  readonly status?: BatteryRecordStatus;
  readonly containerId?: Uuid;
  /**
   * The `/batteries` storage-clock-tier filter resolves to a **set** of
   * containers, not to one: a tier is a property of a container's clock, so the
   * screen reads the clocks at that tier first and narrows this list by the
   * containers they belong to. Union with {@link BatteryRecordQuery.containerId},
   * never a replacement for it.
   */
  readonly containerIds?: readonly Uuid[];
  readonly catalogEntryId?: Uuid;
  /** `catalog_entry_id is not null` — the catalog-matched filter on `/batteries`. */
  readonly isCatalogMatched?: boolean;
  readonly intakeSessionId?: Uuid;
  readonly chemistry?: Chemistry;
  /** A small mobility pack and a vehicle pack sit in the same list; this narrows it. */
  readonly applicationClass?: ApplicationClass;
  /**
   * T-49 governs `battery_record.assessed_condition` (D-38). **Stays `string`
   * to match the column**, which is `string` pending the fixture migration
   * `BUILD_NOTES_b1a-doc-defects.md` §2.2 asks for — narrowing the filter ahead
   * of the field would make the filter unable to select the fixtures.
   */
  readonly assessedCondition?: string;
  readonly serialNumber?: string;
  /** Any non-empty `ddr_flags`. */
  readonly hasDdrFlag?: boolean;
  readonly ddrFlag?: DdrFlag;
  readonly isAirTransportProhibited?: boolean;
  /** Excludes `voided` records, which are retained but sit outside every operational count. */
  readonly excludeVoided?: boolean;
  /**
   * Excludes `draft` records — T-22: *"Created within an intake session, not
   * yet submitted. Visible only in that session."* The list is not that
   * session.
   */
  readonly excludeDrafts?: boolean;
  /** The `/batteries` date range, over `created_at`. Half-open, both bounds optional. */
  readonly loggedAfter?: IsoTimestamp;
  readonly loggedBefore?: IsoTimestamp;
}

/**
 * What a confirmed damage assessment sets on the record — the two legal
 * booleans and the version that set them (`TECHNICAL_SPEC.md` §3.2, Rules 6.4,
 * 6.5), plus the assessed condition and its human confirmation.
 */
export interface ConditionOutcome {
  /** T-49. */
  readonly assessedCondition: string;
  readonly ddrFlags: readonly DdrFlag[];
  readonly isAirTransportProhibited: boolean;
  readonly conditionRuleVersionId: Uuid | null;
  readonly conditionConfirmedBy: Uuid;
  readonly conditionConfirmedAt: IsoTimestamp;
}

export interface BatteryRecordRepository extends Repository<
  BatteryRecord,
  CreateBatteryRecord,
  UpdateBatteryRecord,
  BatteryRecordQuery
> {
  /**
   * **The one door through which `ddrFlags` and `isAirTransportProhibited`
   * move.** `update` strips both (Rules 6.4, 6.5, 6.8): they are set by rule
   * evaluation from a confirmed damage assessment, never by a caller editing a
   * record. This method takes the determination the domain produced from that
   * assessment and writes it — the caller supplies a determination, not a
   * flag, and the determination names the person who confirmed the finding.
   *
   * Under Supabase this is the trigger that fires on a `damage_assessment`
   * insert; the contract exposes it so the mock can hold the same invariant.
   */
  applyConditionOutcome(
    ctx: RequestContext,
    id: Uuid,
    outcome: ConditionOutcome,
  ): Promise<BatteryRecord>;
}

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

export type CatalogEntrySortField =
  "manufacturerName" | "modelName" | "partNumber" | "updatedAt";

export interface CatalogQuery
  extends BaseQuery, SortRequest<CatalogEntrySortField> {
  readonly status?: CatalogEntryStatus;
  readonly manufacturerName?: string;
  readonly applicationClass?: ApplicationClass;
  readonly chemistry?: Chemistry;
  /**
   * T-04, the physical cell shape — the `/catalog` form-factor filter.
   *
   * **T-04 is not T-06.** `format_category` is a jurisdiction-dependent band on
   * `format_classification` and is not filterable here, or anywhere in B1a.
   */
  readonly cellFormFactor?: CellFormFactor;
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
  /** Status is neither `completed` nor `abandoned` — the drafts a person can pick up. */
  readonly isOpen?: boolean;
}

/**
 * Everything one confirmation commits, in one payload.
 *
 * The shape is deliberately whole rather than a sequence of calls: there is no
 * state in which a battery has a shipping-ready record but no classification
 * decision or no running clock (`TECHNICAL_SPEC.md` §11.1 step 6).
 *
 * **The rows arrive already decided.** The pipeline orchestrator runs the pure
 * evaluators in `src/domain` and hands the adapter what to persist; the adapter
 * validates the preconditions it can see (the three attributable confirmations,
 * the container's admission) and writes all of it or none of it. Under Supabase
 * this is `app.commit_intake_confirmation(payload jsonb)`, one `security
 * invoker` function; in the mock it is one snapshot-and-restore operation.
 */
export interface IntakeConfirmation {
  readonly intakeSessionId: Uuid;
  /** The draft record the session created when it started (T-22 `draft`). */
  readonly batteryRecordId: Uuid;
  /**
   * The confirmed record fields. Status is not among them — the adapter sets
   * `confirmed` → `classified` → `stored` from what else is in the payload.
   */
  readonly batteryRecord: UpdateBatteryRecord;
  /**
   * Which fields the human confirmed, and by whom.
   *
   * **Confirmation is per field and attributable — Rule 2.21 forbids "confirmed
   * by the system" as a value.** The adapter refuses without all three
   * hard-gated fields here (Rule 2.15), at any confidence band.
   */
  readonly confirmedFields: readonly {
    readonly fieldCode: LabelFieldCode;
    readonly confirmedBy: Uuid;
    readonly confirmedAt: IsoTimestamp;
  }[];
  /** The catalog entry a human picked. Never auto-selected (Rule 2.19). */
  readonly catalogEntryId: Uuid | null;
  /** Where the record is placed. Placement starts the clock (Rule 4.4). Null when unplaced. */
  readonly containerId: Uuid | null;
  /** Appended when a date code was read (§11.1 step 6.3). */
  readonly dateCodeDecode: CreateDateCodeDecode | null;
  /**
   * Always present — every battery record carries a damage assessment
   * (Rule 6.1), and a model never produces one without a person (Rule 6.6).
   */
  readonly damageAssessment: CreateDamageAssessment;
  /**
   * What that assessment sets on the record — the same determination, as the
   * record's two legal booleans and the version that set them. The adapter
   * refuses a payload whose assessment and outcome disagree.
   */
  readonly conditionOutcome: ConditionOutcome;
  /**
   * Null only where classification could not run at all — no jurisdiction
   * profile, or no rule version in force (Rule 3.10; E-13). Never a default.
   */
  readonly classificationDecision: CreateClassificationDecision | null;
  /** A **new** clock to start on this placement, or null when joining one or unplaced. */
  readonly storageClock: CreateStorageClock | null;
  /** The container's running clock the record joins (Rule 4.4). */
  readonly joinStorageClockId: Uuid | null;
  /** The placement event. Null when unplaced. */
  readonly storageEvent: CreateStorageEvent | null;
  /** Set on the container when this placement is its first (Rule 4.4). */
  readonly containerAccumulationStartedAt: IsoTimestamp | null;
  /**
   * One event per row written above, sharing `ctx.correlationId`. The adapter
   * appends them through the `security definer` door as part of the same
   * all-or-nothing operation (§11.1 step 6.8).
   */
  readonly auditEvents: readonly CreateAuditEvent[];
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
