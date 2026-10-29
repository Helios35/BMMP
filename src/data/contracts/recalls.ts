import type {
  RecallHit,
  RecallRecordingSource,
  RecallSearchSource,
} from "@/domain/recalls/hit";
import type {
  RecallIdentityKind,
  RecallMatchField,
} from "@/domain/recalls/identity";
import type {
  RecallCheckOutcome,
  RecallCheckTrigger,
} from "@/domain/recalls/standing";
import type { BatteryRecordStatus } from "@/domain/taxonomy/battery-record-status";
import type { DdrFlag } from "@/domain/taxonomy/ddr-flag";
import type { RecallMatchStatus } from "@/domain/taxonomy/recall-match-status";
import type { RecallMatchConfiguration } from "@/domain/recalls/configuration";
import type { BatteryRecord } from "@/types/battery-record";
import type { CatalogEntry } from "@/types/catalog";
import type { IsoDate, IsoTimestamp, Uuid } from "@/types/common";
import type { RecallCheckRun, RecallMatch } from "@/types/condition";

import type { RequestContext } from "./context";
import type { CreateClassificationDecision } from "./documents";
import type { Page, PageRequest } from "./repository";
import type { StorageWriteAttribution } from "./storage";

/**
 * Recall matching — `recall_match` (`ERD.md` §8.4) and the check runs argued
 * as `recall_check` for unit 17; Rules 6.14, 6.23, 6.24, 10.10–10.18; D-73.
 *
 * **The source is asked outside this seam.** A check calls the recall
 * provider (`src/lib/recalls`) and the domain (`src/domain/recalls`) decides
 * the candidates; this repository writes what they concluded. It never calls
 * a source and never decides a candidate, so the Supabase twin is a writer and
 * nothing more.
 *
 * **Every decision is one operation.** Confirming, recording and withdrawing
 * each write the match row, the `recalled` flag and the air prohibition on the
 * record, the `recall_match` alert, Rule 6.14's effect on an open air
 * shipment and every audit row together, or none of them — under Postgres a
 * definer function and the triggers behind it, here the mock's atomic write.
 * The flag moves only through these doors: `batteryRecords.update` strips it,
 * and a damage assessment never touches `recalled`.
 *
 * Who may do what is `mayTakeRecallAction` (`domain/access/recall-actions`),
 * enforced here as well as on the screen: confirm and record are P1, P2 and P6;
 * dismiss and withdraw are P1 and P6, each with a reason; P5 none (Rules 6.23,
 * 6.24, 10.14–10.16).
 */

export interface RecallMatchQuery extends PageRequest {
  readonly batteryRecordId?: Uuid;
  readonly status?: RecallMatchStatus;
}

export interface RecallCheckRunQuery extends PageRequest {
  readonly batteryRecordId: Uuid;
}

/** One candidate the domain found, written as a possible match unless its row exists. */
export interface RecallCandidateWrite {
  readonly hit: RecallHit;
  readonly fields: readonly RecallMatchField[];
}

/** One run, as the check concluded it. */
export interface RecallCheckRunWrite {
  readonly source: RecallSearchSource | null;
  readonly identity: RecallIdentityKind | null;
  readonly outcome: RecallCheckOutcome;
  readonly checkErrorCode: string | null;
  readonly candidates: readonly RecallCandidateWrite[];
}

export interface RecallCheckRecording {
  readonly batteryRecordId: Uuid;
  readonly trigger: RecallCheckTrigger;
  readonly configurationVersion: string | null;
  /** At least one — a record with nothing to match against records that fact as a run. */
  readonly runs: readonly RecallCheckRunWrite[];
  readonly at: IsoTimestamp;
  readonly attribution: StorageWriteAttribution;
}

export interface RecallCheckRecorded {
  readonly runs: readonly RecallCheckRun[];
  /** Possible matches this check wrote for the first time. */
  readonly found: readonly RecallMatch[];
}

/**
 * A re-classification, computed by the caller from reads only and written by
 * the decision in the same operation — Rules 3.15, 6.20, 10.14.
 *
 * A recall decision changes a classification input (the DDR flags), so the
 * re-classification check runs with it. P2 may confirm a recall (Rule 10.14)
 * but writes no `classification_decision` (`TECHNICAL_SPEC.md` §9.5), so the
 * decision cannot be appended as P2 afterwards; it is computed first —
 * `planReclassification`, the same function `reclassifyRecord` writes from —
 * and written by the decision's definer door, exactly as
 * `commitConfirmation` writes the decision intake computed. Null where the
 * flags do not change or no rule resolved (Rule 3.10 — no default).
 */
export interface ReclassificationWrite {
  /**
   * The flags the plan was computed for. The write is refused as a conflict if
   * the record will not carry exactly these — a plan for other flags would be
   * a decision made from the wrong input.
   */
  readonly forDdrFlags: readonly DdrFlag[];
  /** `reclassification:<trigger>` is the step the audit rows name. */
  readonly trigger: string;
  readonly governingDate: IsoDate;
  readonly decision: CreateClassificationDecision;
  /** The live decisions the new one supersedes (Rule 3.14). */
  readonly supersedeDecisionIds: readonly Uuid[];
  readonly priorWasteClassification: string | null;
  /** Where the record lands once the decision is in (T-22). */
  readonly settledStatus: BatteryRecordStatus;
}

export interface RecallMatchConfirmation {
  readonly reclassification: ReclassificationWrite | null;
  readonly matchId: Uuid;
  readonly at: IsoTimestamp;
  readonly attribution: StorageWriteAttribution;
}

/** Dismissing a possible match, or withdrawing a confirmed one — always with a reason (Rule 6.24). */
export interface RecallMatchDismissal {
  /** Set only on a withdrawal that clears `recalled`. */
  readonly reclassification: ReclassificationWrite | null;
  readonly matchId: Uuid;
  readonly reason: string;
  readonly at: IsoTimestamp;
  readonly attribution: StorageWriteAttribution;
}

export interface RecallRecording {
  readonly reclassification: ReclassificationWrite | null;
  readonly batteryRecordId: Uuid;
  readonly source: RecallRecordingSource;
  /** The notice's reference — required (Rule 10.15). */
  readonly reference: string;
  readonly title: string | null;
  readonly at: IsoTimestamp;
  readonly attribution: StorageWriteAttribution;
}

/** Rule 6.14 on one open air shipment the record's container is on. */
export interface AirShipmentInvalidation {
  readonly shipmentId: Uuid;
  readonly shipmentNumber: string;
  /** An issued paper was voided (Rule 5.13); false where none had been issued yet. */
  readonly paperVoided: boolean;
}

export interface RecallDecided {
  readonly match: RecallMatch;
  /** The record as it stands after the decision — flags, and status where it re-classified. */
  readonly record: BatteryRecord;
  /** The appended classification decision, where one was written. */
  readonly classificationDecisionId: Uuid | null;
  /** The record's DDR flags or air prohibition changed. */
  readonly flagsChanged: boolean;
  readonly airShipments: readonly AirShipmentInvalidation[];
}

/** What the nightly job checks (Rule 10.10). */
export interface RecallSyncTarget {
  readonly organizationId: Uuid;
  readonly record: BatteryRecord;
  readonly catalogEntry: CatalogEntry | null;
}

export interface RecallSyncPlan {
  readonly configuration: RecallMatchConfiguration;
  readonly targets: readonly RecallSyncTarget[];
}

export interface RecallRepository {
  listMatches(
    ctx: RequestContext,
    query: RecallMatchQuery,
  ): Promise<Page<RecallMatch>>;
  listCheckRuns(
    ctx: RequestContext,
    query: RecallCheckRunQuery,
  ): Promise<Page<RecallCheckRun>>;

  /**
   * Write one check: its runs, a possible-match row for each candidate whose
   * row does not exist yet, a `recall_match` alert for P1 and P2 on each, and
   * the T-43 rows. A system step: the person whose act ran it is recorded,
   * the role is not checked here (Rule 10.10 runs checks on commit and on
   * identity change for whoever made them) — **Check now** is checked by the
   * action that offers it.
   */
  recordCheck(
    ctx: RequestContext,
    input: RecallCheckRecording,
  ): Promise<RecallCheckRecorded>;

  /** Confirm a possible match (Rule 10.14). P1, P2, P6. */
  confirm(
    ctx: RequestContext,
    input: RecallMatchConfirmation,
  ): Promise<RecallDecided>;

  /**
   * Dismiss a possible match (Rule 10.14) or withdraw a confirmed one (Rule
   * 10.16). P1, P6, with a reason. Nothing is deleted; `recalled` clears only
   * when no confirmed recall remains, and the record is never moved.
   */
  dismiss(
    ctx: RequestContext,
    input: RecallMatchDismissal,
  ): Promise<RecallDecided>;

  /** Record a recall by hand, confirmed at once (Rule 10.15). P1, P2, P6. */
  record(ctx: RequestContext, input: RecallRecording): Promise<RecallDecided>;
}
