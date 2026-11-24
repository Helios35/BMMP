import type { RequestContext } from "./context";
import type { DocumentComposer } from "./documents";
import type { Page, PageRequest } from "./repository";
import type { StorageWriteAttribution } from "./storage";
import type { FilingPacketContent } from "@/domain/documents/build-filing-packet-payload";
import type { RuleOutcome } from "@/domain/rules/outcome";
import type { RuleVersionCandidate } from "@/domain/rules/resolve";
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
import type {
  IsoDate,
  IsoTimestamp,
  PostalAddress,
  TimeZone,
  Uuid,
} from "@/types/common";
import type { CatalogEntry } from "@/types/catalog";
import type { DocumentRender } from "@/types/documents";
import type {
  ObligationDeadline,
  ProducerObligation,
  ProducerProduct,
  ProducerSalesRecord,
} from "@/types/producer";

/**
 * Producer obligations and filings — Rules 8.6–8.23; D-78, D-81;
 * `TECHNICAL_SPEC.md` §9.5.
 *
 * Five repositories behind the seam, each with a Supabase twin that refuses
 * until unit 17:
 *
 * - `producerProducts` — what P3 declares, and the states it is sold in
 * - `producerObligations` — the run's reading half and its one writer
 * - `obligationDeadlines` — the dates, and marking one done (with an issued
 *   packet as evidence) or reopening it
 * - `producerSales` — the one sales dataset (Rule 8.17)
 * - `filingPackets` — what a packet reads, and issuing one (Rules 8.19–8.22)
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
  /**
   * An issued packet of this deadline, linked as its evidence (Rule 8.19) —
   * optional. A packet never marks a deadline done on its own.
   */
  readonly evidenceDocumentRenderId?: Uuid | null;
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

// --- producer_sales_record ------------------------------------------------------------------

export interface ProducerSalesQuery extends PageRequest {
  readonly year?: number;
  readonly producerProductId?: Uuid;
  readonly jurisdictionId?: Uuid;
  /** Replaced entries are kept and shown as replaced; off by default. */
  readonly includeReplaced?: boolean;
}

export interface RecordProducerSales {
  readonly producerProductId: Uuid;
  /** A state the product is declared as sold in. */
  readonly jurisdictionId: Uuid;
  /** A full calendar year — never one still running in the organization's zone. */
  readonly year: number;
  /** A whole number, zero allowed (Rule 8.17). */
  readonly units: number;
  /** Where the number came from. Required. */
  readonly basisNote: string;
  readonly at: IsoTimestamp;
  readonly attribution: StorageWriteAttribution;
}

export interface ProducerSalesRecorded {
  readonly record: ProducerSalesRecord;
  /** The entry it replaced — a correction (Rule 8.17) — or `null`. */
  readonly replaced: ProducerSalesRecord | null;
}

export interface ProducerSalesRepository {
  list(
    ctx: RequestContext,
    query: ProducerSalesQuery,
  ): Promise<Page<ProducerSalesRecord>>;
  /**
   * P3 or P6 (Rule 8.22). A new entry; **recording again for the same
   * product, state and year is a correction**: the old entry is kept and
   * marked replaced by the supersede trigger, never edited.
   * `producer_sales.recorded` or `producer_sales.corrected`.
   */
  record(
    ctx: RequestContext,
    input: RecordProducerSales,
  ): Promise<ProducerSalesRecorded>;
}

// --- filing packets -------------------------------------------------------------------------

/** One declared product sold in the packet's state, with its catalog entry (Rule 8.6). */
export interface FilingPacketProduct {
  readonly product: ProducerProduct;
  readonly entry: CatalogEntry;
}

/**
 * Everything one packet reads, for one deadline — **the adapter fetches;
 * `src/domain` decides** (`TECHNICAL_SPEC.md` §8.5).
 */
export interface FilingPacketSource {
  readonly timeZone: TimeZone;
  readonly deadline: ObligationDeadline;
  /** The deadline's obligation row, as the latest run stored it. */
  readonly obligation: ProducerObligation;
  readonly state: {
    readonly jurisdictionId: Uuid;
    readonly code: string;
    readonly name: string;
  };
  /** Every `producer.filings` version for the state, unfiltered by date. */
  readonly filingCandidates: readonly RuleVersionCandidate[];
  readonly organization: {
    readonly id: Uuid;
    readonly name: string;
    readonly legalName: string | null;
    readonly primaryAddress: PostalAddress | null;
    readonly mailingAddress: PostalAddress | null;
  };
  /** The person making the packet (T-71 `contact`). */
  readonly contact: {
    readonly userId: Uuid;
    readonly name: string | null;
    readonly email: string;
  };
  /** Every declared product sold in the state. */
  readonly products: readonly FilingPacketProduct[];
  /** The current sales entries for the state — replaced ones are not read. */
  readonly sales: readonly ProducerSalesRecord[];
  /** This deadline's packets, newest first. */
  readonly packets: readonly DocumentRender[];
}

export interface FilingPacketIssue {
  readonly deadlineId: Uuid;
  /** What the packet says, as the domain builder decided it. */
  readonly packet: RuleOutcome<FilingPacketContent>;
  readonly compose: DocumentComposer;
  readonly at: IsoTimestamp;
  readonly attribution: StorageWriteAttribution;
}

export interface IssuedFilingPacket {
  readonly documentRender: DocumentRender;
  /** The packet it replaced (Rule 5.15), or `null` for the first. */
  readonly supersededDocumentRenderId: Uuid | null;
}

export interface FilingPacketRepository {
  /** What a packet for this deadline reads. P3 or P6 (Rule 8.22). */
  source(ctx: RequestContext, deadlineId: Uuid): Promise<FilingPacketSource>;
  /**
   * Issue a packet — P3 or P6, **one deliberate act, no draft** (Rule 8.19):
   * compose, hash, store, append the `document_render` linked to the
   * deadline, and supersede the deadline's issued packet of the same type,
   * as one operation. **It never marks the deadline done.**
   */
  issue(
    ctx: RequestContext,
    input: FilingPacketIssue,
  ): Promise<IssuedFilingPacket>;
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
