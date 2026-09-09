import type {
  Created,
  Decimal,
  IsoDate,
  IsoTimestamp,
  JsonObject,
  JsonValue,
  Sha256,
  TenantScoped,
  Timestamped,
  Uuid,
} from "@/types/common";
import type { CellFormFactor } from "@/domain/taxonomy/cell-form-factor";
import type { Chemistry } from "@/domain/taxonomy/chemistry";
import type { ChemistrySource } from "@/domain/taxonomy/chemistry-source";
import type { ConfidenceBand } from "@/domain/taxonomy/confidence-band";
import type { DamageFindingType } from "@/domain/taxonomy/damage-finding-type";
import type { DataUseEligibility } from "@/domain/taxonomy/data-use-eligibility";
import type { DateCodeDecodeMethod } from "@/domain/taxonomy/date-code-decode-method";
import type { DateCodePrecision } from "@/domain/taxonomy/date-code-precision";
import type { IntakePhotoType } from "@/domain/taxonomy/intake-photo-type";
import type { IntakeSessionStatus } from "@/domain/taxonomy/intake-session-status";
import type { LabelFieldCode } from "@/domain/taxonomy/label-field-code";
import type { ProvenanceSourceType } from "@/domain/taxonomy/provenance-source-type";
import type { StateOfChargeBand } from "@/domain/taxonomy/state-of-charge-band";
import type { StateOfChargeSource } from "@/domain/taxonomy/state-of-charge-source";

/**
 * Intake and identification — `ERD.md` §5.3–5.6.
 *
 * `intake_session` · `intake_photo` · `label_extraction` · `date_code_decode`.
 *
 * The pipeline is **Sequential, code-orchestrated, with a human gate at the
 * end**: photo → label crop → vision extraction → catalog match → confidence
 * gate → human confirmation (`_ANCHORS.md` §6, `TECHNICAL_SPEC.md` §11.1). The
 * order is fixed by code. No model has write authority; models return data and
 * code decides what is persisted.
 */

/** One run of the pipeline. The unit `/review` operates on. */
export interface IntakeSession extends TenantScoped, Timestamped {
  readonly id: Uuid;
  /** Set on commit. */
  readonly batteryRecordId: Uuid | null;
  /**
   * T-08. Includes `failed` — a pipeline step that could not complete leaves the
   * session recoverable with its photos retained. **Work is never lost because a
   * step failed** (EC-14).
   */
  readonly status: IntakeSessionStatus;
  /**
   * Which pipeline step is next. Fixed order, code-owned (Rules 2.2, 2.3).
   *
   * **This is a taxonomy value, not a bare pipeline key.** T-53 governs this
   * column (D-38), and its module is `src/domain/taxonomy/intake-step` —
   * `INTAKE_STEPS` is the value list and the display order, and a stepper reads
   * it rather than declaring its own. **The field stays `string` pending a
   * fixture migration** — the fixtures store `completed` and
   * `human_confirmation`, where T-53 authors `capture`, `extraction_review`,
   * `confirm_and_place` and `complete`. Reported in this unit's build-notes.
   */
  readonly currentStep: string;
  /** Set true by the confidence gate. Drives `/review` (Rule 2.14). */
  readonly isReviewRequired: boolean;
  /**
   * Which gate condition failed. The conditions themselves are
   * `TECHNICAL_SPEC.md` §11.1 step 5.
   *
   * T-52 governs this column (D-38), and its module is
   * `src/domain/taxonomy/review-reason-code`. **The elements stay `string`
   * pending a fixture migration** — the fixtures store
   * `field_below_confidence_threshold`, `ambiguous_catalog_match` and
   * `hard_gated_field_not_extracted`, none of which is in T-52's set. Reported
   * in this unit's build-notes.
   */
  readonly reviewReasonCodes: readonly string[] | null;
  /**
   * The band cutoffs and match thresholds in force at evaluation, **so the gate
   * decision reproduces even after they change** (Rule 2.16).
   */
  readonly gateThresholdsApplied: JsonObject;
  readonly reviewedBy: Uuid | null;
  readonly reviewedAt: IsoTimestamp | null;
  readonly reviewOutcome: string | null;
  /** Threads every step through logs and `audit_event`. */
  readonly correlationId: string;
  /** Capture device and app version. **No GPS — EXIF is stripped at upload.** */
  readonly deviceContext: JsonObject | null;
  readonly startedBy: Uuid;
  readonly startedAt: IsoTimestamp;
  readonly completedAt: IsoTimestamp | null;
  readonly abandonedAt: IsoTimestamp | null;
  /**
   * The per-field confirmation state of the intake before it commits — what a
   * person has confirmed, corrected or rejected on the extraction review card,
   * what they picked from the catalog, and what step 3 has recorded so far.
   *
   * **`ERD.md` §5.3 has no column for this, and it needs one.** §2.1.4 makes
   * confirmation reversible until commit and §6.4 forbids confirming a gated
   * field optimistically, and Flow A-a says a locked phone loses nothing — which
   * together mean every confirmation is persisted server-side before it renders
   * as confirmed, and the only place to persist it before `battery_record` is
   * written is the session. Reported in this unit's build-notes as the input to
   * the first migration. Optional so no fixture row has to change; absent reads
   * as `null`, and the card seeds itself from the `label_extraction` rows.
   */
  readonly draft?: IntakeDraft | null;
}

/** Where a draft value came from. The same five sources `/batteries/[id]` renders. */
export type DraftFieldSource =
  | "read_from_label"
  | "matched_from_catalog"
  | "decoded"
  | "detected_from_image"
  | "entered_by";

export type DraftFieldStatus = "pending" | "confirmed" | "rejected";

/**
 * One field on the extraction review card, as the draft holds it.
 *
 * `originalValue` is what the extraction read; `value` is what the person
 * confirmed or corrected. **The original is never overwritten** — the
 * extracted/corrected pair is the training asset (D-7), and the confirmation is
 * attributable to a person (Rule 2.21).
 */
export interface DraftFieldState {
  readonly fieldCode: LabelFieldCode;
  readonly status: DraftFieldStatus;
  readonly value: string | null;
  readonly originalValue: string | null;
  readonly source: DraftFieldSource;
  readonly confidenceBand: ConfidenceBand | null;
  readonly rawText: string | null;
  readonly isHardGated: boolean;
  readonly confirmedBy: Uuid | null;
  readonly confirmedAt: IsoTimestamp | null;
}

/** A ranked catalog candidate, as the draft carries it. Never pre-selected (Rule 2.19). */
export interface DraftCandidate {
  readonly catalogEntryId: Uuid;
  /** 0..1. Compared against configuration; never rendered as a number. */
  readonly matchScore: number;
  readonly matchMethodCode: string;
  readonly matchedOn: readonly string[];
}

/** Step 3's assessed condition, as findings a person selected and confirmed. */
export interface DraftCondition {
  readonly findingTypes: readonly DamageFindingType[];
  /** T-30 `defective` — human-recorded, no visible indicator sets it. */
  readonly isDefective: boolean;
  readonly confirmedBy: Uuid | null;
  readonly confirmedAt: IsoTimestamp | null;
}

export interface DraftStateOfCharge {
  readonly band: StateOfChargeBand;
  readonly percent: Decimal | null;
  readonly source: StateOfChargeSource | null;
}

export interface DraftSourceDevice {
  readonly type: string | null;
  readonly identifier: string | null;
  readonly make: string | null;
  readonly model: string | null;
  readonly modelYear: number | null;
  readonly provenanceSourceType: ProvenanceSourceType;
}

export interface DraftDateCodeDecode {
  readonly formatKey: string;
  readonly decodedManufacturedOn: IsoDate | null;
  readonly decodedPrecision: DateCodePrecision | null;
  readonly decoderVersion: string;
}

/**
 * The whole of an intake's unsaved state. See {@link IntakeSession.draft}.
 *
 * `chemistry` is set from a selected catalog candidate or entered by hand, and
 * `chemistrySource` says which — the only two sources there are (Rule 2.10).
 * Nothing in this shape can say a photograph supplied it.
 */
export interface IntakeDraft {
  readonly fields: readonly DraftFieldState[];
  readonly candidates: readonly DraftCandidate[];
  readonly selectedCatalogEntryId: Uuid | null;
  /** Rule 2.20 / EC-10 — a person rejected the match and took the manual path. */
  readonly catalogMatchRejected: boolean;
  readonly chemistry: Chemistry | null;
  readonly chemistrySource: ChemistrySource | null;
  /** T-04, proposed from an image. It still passes the gate and never touches chemistry (Rule 2.25). */
  readonly formFactorProposal: CellFormFactor | null;
  readonly manualEntry: boolean;
  /** §2.1.5 whole-read reject — the extraction is retained and marked, never deleted. */
  readonly extractionRejected: boolean;
  readonly dateCodeDecode: DraftDateCodeDecode | null;
  /** A date a person entered. A decode never overrides it (Rule 2.24). */
  readonly manufacturedOnEntered: IsoDate | null;
  readonly condition: DraftCondition | null;
  readonly stateOfCharge: DraftStateOfCharge | null;
  readonly containerId: Uuid | null;
  readonly sourceDevice: DraftSourceDevice | null;
  readonly labelPhotoId: Uuid | null;
  readonly labelCropId: Uuid | null;
  readonly extractionRunId: Uuid | null;
}

/**
 * Both the original photo and its label crop — **APPEND-ONLY**.
 *
 * A crop is a row whose `parentIntakePhotoId` is set. **The original is never
 * modified**, and the crop is produced deterministically from stored geometry so
 * the same geometry always yields the same bytes.
 */
export interface IntakePhoto extends TenantScoped, Created {
  readonly id: Uuid;
  readonly intakeSessionId: Uuid;
  /** **Non-null identifies a crop.** */
  readonly parentIntakePhotoId: Uuid | null;
  /** What this image is. T-50. */
  readonly photoType: IntakePhotoType;
  /** Private bucket, `org/{organizationId}/…`. **Never public.** */
  readonly storageObjectPath: string;
  readonly contentHash: Sha256;
  readonly byteSize: number;
  readonly mimeType: string;
  readonly widthPx: number;
  readonly heightPx: number;
  /** Present on crops. */
  readonly cropGeometry: CropGeometry | null;
  /**
   * Whether the geometry came from automatic region detection or from a person
   * drawing the box. **Both are ordinary outcomes; neither is an error state** —
   * a scuffed label on a mobility pack is an ordinary Tuesday, and the manual
   * path is always available and never hidden.
   *
   * T-51 governs this column (D-38), and its module is
   * `src/domain/taxonomy/label-crop-method`. **The field stays `string` pending
   * a fixture migration** — the fixtures store `region_detection` and
   * `manual_selection`, where T-51 authors `auto_detected` and `manual`.
   * Reported in this unit's build-notes.
   */
  readonly cropMethod: string | null;
  /** Read from EXIF **before** EXIF is stripped. */
  readonly capturedAt: IsoTimestamp | null;
  /**
   * T-12. **Stamped once at capture and never recomputed or edited by any role,
   * including P6** (Rules 7.6, 7.7).
   */
  readonly dataUseEligibility: DataUseEligibility;
  /** GPS and device identifiers are not retained (Rule 7.21). */
  readonly isExifStripped: boolean;
  readonly takenBy: Uuid;
}

export interface CropGeometry {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
}

/**
 * What the vision model returned: **per-field values with per-field
 * confidence** — **APPEND-ONLY**.
 *
 * **One row per field per extraction** (T-09). A single blended confidence for a
 * whole read is forbidden — per-field confidence is what makes the gate
 * meaningful (Rule 2.7), and **there is no aggregate confidence field anywhere**.
 *
 * A re-extraction writes a new run's rows and never overwrites the previous
 * run's. **The gate's verdict lives on `intake_session`, not here, because the
 * gate routes the record, not the field** (Rule 2.14).
 */
export interface LabelExtraction extends TenantScoped, Created {
  readonly id: Uuid;
  readonly intakeSessionId: Uuid;
  /** **The crop**, not the original. */
  readonly intakePhotoId: Uuid;
  /** Groups every field row produced by one provider call. Not an FK — the group is the run. */
  readonly extractionRunId: Uuid;
  /** T-09. Closed vocabulary. A new extracted field is a taxonomy addition, never a new free-text key. */
  readonly fieldCode: LabelFieldCode;
  /**
   * The value **as printed on the label**, verbatim. **Null means not
   * extracted** — never guessed, never interpolated from a similar product,
   * never filled from an unmatched catalog entry (Rule 2.11).
   */
  readonly fieldValue: string | null;
  /** T-10. Four bands (D-22). */
  readonly confidenceBand: ConfidenceBand;
  /**
   * The provider's raw score. Stored for audit; **never displayed as a
   * percentage** in UI or export (T-10, D-22).
   */
  readonly rawConfidence: Decimal | null;
  /** The score-to-band cutoffs in force at evaluation, so the band reproduces even after they change. */
  readonly bandCutoffsApplied: JsonObject;
  /** True for T-09's hard-gated fields. **Those never auto-commit at any band** (Rule 2.15). */
  readonly isHardGated: boolean;
  /** Where on the crop the value was read. */
  readonly evidenceBbox: readonly Decimal[] | null;
  /** Characters the model reported reading, retained for the reviewer (Rule 2.12). */
  readonly rawText: string | null;
  /**
   * Which `VisionProvider`. Swappable by design.
   *
   * **No vendor name appears anywhere except `src/lib/vision/providers/`**
   * (D-25). A failing vision call queues the record to `/review`; the confidence
   * gate is never relaxed to clear a backlog.
   */
  readonly provider: string;
  readonly modelIdentifier: string;
  readonly promptVersion: string;
  /** Which Zod schema validated the response. */
  readonly schemaVersion: string;
  /** The provider's verbatim response for this run, stored on every field row of the run. */
  readonly rawResponse: JsonValue | null;
  readonly latencyMs: number | null;
  readonly tokenUsage: JsonObject | null;
  /** Makes provider comparison at Gate 3 a query. */
  readonly costUsd: Decimal | null;
  /** **A failed or malformed response is a row, never a silence.** */
  readonly errorCode: string | null;
  readonly requestedAt: IsoTimestamp | null;
  readonly respondedAt: IsoTimestamp | null;
}

/**
 * Deterministic decoding of a printed date code to a manufacture date —
 * **APPEND-ONLY**.
 *
 * **Rules, versioned. No machine learning.** A decode never overrides a
 * human-entered date, and a failure is recorded as undecodable rather than as an
 * approximate date (Rule 2.24).
 */
export interface DateCodeDecode extends TenantScoped, Created {
  readonly id: Uuid;
  /** Null while still in-session. */
  readonly batteryRecordId: Uuid | null;
  readonly intakeSessionId: Uuid | null;
  /** Where the raw code came from. */
  readonly sourceLabelExtractionId: Uuid | null;
  readonly rawCode: string;
  /** Which decoder applied. A machine key, not a taxonomy value. */
  readonly formatKey: string;
  /** **Null when the code cannot be decoded — an honest null, not a guess.** */
  readonly decodedManufacturedOn: IsoDate | null;
  /** How precisely the code resolves. T-56. */
  readonly decodedPrecision: DateCodePrecision | null;
  /** Bumped when a decoder changes; **old rows keep their old answer**. */
  readonly decoderVersion: string;
  readonly confidence: Decimal | null;
  /**
   * Whether a deterministic decoder or a person produced the date. T-57. **No
   * value means "inferred by a model"** — nothing here is.
   */
  readonly decodedByMethod: DateCodeDecodeMethod;
  /** Set on human override. */
  readonly decodedBy: Uuid | null;
}
