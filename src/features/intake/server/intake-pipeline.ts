import { data } from "@/data";
import type {
  BucketKey,
  CreateIntakePhoto,
  CreateLabelExtraction,
  RequestContext,
} from "@/data/contracts";
import {
  isExactMatch,
  normalizePartNumber,
  rankCatalogCandidates,
  type MatchIdentifiers,
  type RankedCandidate,
} from "@/domain/catalog/match";
import { bandForScore } from "@/domain/intake/confidence-band";
import {
  evaluateConfidenceGate,
  type GateFieldInput,
  type GateVerdict,
} from "@/domain/intake/confidence-gate";
import {
  decodeDateCode,
  type DateCodeDecodeResult,
} from "@/domain/intake/date-code";
import {
  seedDraftFromExtraction,
  type CandidateSeedRow,
  type ExtractionSeedRow,
} from "@/domain/intake/draft";
import { validateExtractedField } from "@/domain/intake/field-validation";
import {
  validateIntakeGateConfiguration,
  type IntakeGateConfiguration,
} from "@/domain/intake/thresholds";
import { civilDateInZone } from "@/domain/storage/clock-display";
import type { ConfidenceBand } from "@/domain/taxonomy/confidence-band";
import type { LabelCropMethod } from "@/domain/taxonomy/label-crop-method";
import {
  HARD_GATED_LABEL_FIELD_CODES,
  LABEL_FIELD_CODES,
  type LabelFieldCode,
} from "@/domain/taxonomy/label-field-code";
import type { ReviewReasonCode } from "@/domain/taxonomy/review-reason-code";
import {
  parseLabelQuantity,
  toAmpHours,
  toVolts,
  toWattHours,
} from "@/domain/units";
import {
  ConflictError,
  DataIntegrityError,
  IntegrationError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import {
  isVisionProviderError,
  LABEL_EXTRACTION_SCHEMA_VERSION,
  LABEL_FIELD_KEYS,
  parseLabelExtractionResult,
  visionProvider,
  type ValidatedLabelExtractionResult,
  type VisionProviderErrorCode,
} from "@/lib/vision";
import type { BatteryRecord } from "@/types/battery-record";
import type { CatalogEntry } from "@/types/catalog";
import type {
  Decimal,
  IsoTimestamp,
  JsonObject,
  JsonValue,
  Uuid,
} from "@/types/common";
import type {
  CropGeometry,
  IntakeDraft,
  IntakePhoto,
  IntakeSession,
} from "@/types/intake";

import {
  CONFIGURATION_CHANGED_MID_SESSION,
  INTAKE_CLOSED,
  INTAKE_HAS_NO_RECORD,
  INTAKE_NOT_FOUND,
  LABEL_READ_MALFORMED,
  LABEL_READ_UNAVAILABLE,
  PHOTO_NOT_A_LABEL,
  PHOTO_NOT_ON_INTAKE,
} from "../copy";
import { systemStepEvent } from "./audit";

/**
 * The intake pipeline — `TECHNICAL_SPEC.md` §11.1 steps 2–5; Rules 2.2–2.4,
 * 2.7, 2.11–2.16, 2.18, 2.19, 2.24; D-22, D-25.
 *
 * **Sequential, code-orchestrated, with a human gate at the end.** The order
 * below is fixed by this file and nothing chooses it at runtime: crop, then
 * extract, then match, then the confidence gate. No model has write authority
 * — a provider returns data, and this code decides what is persisted
 * (Rule 2.3). Every step writes its `audit_event` as the system actor, the
 * step that produced nothing included (Rule 2.4); where T-43 has no type for
 * a step, nothing is written and the gap is marked.
 *
 * **Every number the gate reads arrives from platform configuration** through
 * `data.platformConfiguration` and is validated before use; an invalid set is
 * a `DataIntegrityError`, never a default (D-22, Rule 2.13). The applied set
 * is stamped on every extraction row, and the session's own stamp — made when
 * it started — is checked against it so the decision reproduces (Rule 2.16).
 *
 * **Chemistry is never read here.** `chemistry_code` is characters printed on
 * the label, stored as such. Chemistry reaches the record from a catalog entry
 * a person picks or a chemistry a person enters, both on the review card
 * (Rules 2.9, 2.10). The form-factor proposal T-04 allows from a whole-pack
 * image is not made in B1a — no image inference exists yet — so it is `null`
 * on every draft.
 *
 * **The date code is decoded after ranking, though the audited order is
 * extract → match → gate.** The decode needs the matched entry's format key,
 * which is catalog data (Rule 2.24); it writes no row of its own here — the
 * `date_code_decode` row is appended at commit from the confirmed code.
 */

/** The one bucket intake writes to. Named here so the route and the pipeline cannot disagree. */
export const INTAKE_PHOTO_BUCKET: BucketKey = "intake-photos";

/** The vision provider's bytes must already be EXIF-stripped; the upload route did that (Rule 7.21). */
const EXTENSION_BY_MIME_TYPE: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function fileExtensionFor(mimeType: string): string {
  return EXTENSION_BY_MIME_TYPE[mimeType] ?? "bin";
}

/** `org/{organizationId}/{sessionId}/…` — the private-bucket prefix every storage policy keys on. */
export function intakeObjectPath(
  organizationId: Uuid,
  sessionId: Uuid,
  fileName: string,
): string {
  return `org/${organizationId}/${sessionId}/${fileName}`;
}

/** How many catalog candidates one read is offered (Rule 2.19 — a list, never one). */
const CANDIDATE_LIMIT = 5;

/** Confirmed on step 3 as a condition, never read off a label (Rule 6.2). */
const CONDITION_FIELD: LabelFieldCode = "assessed_condition";

export interface PipelineRequest {
  readonly sessionId: Uuid;
  readonly labelPhotoId: Uuid;
  /**
   * The upload's original file name, when the client still has it. Passed to
   * the provider as a hint; the fixture provider keys its scenario on it, and
   * a re-extraction from a stored photo passes `null`.
   */
  readonly labelFileName: string | null;
  /** A box a person drew (T-51 `manual`). `null` asks the provider to find the label. */
  readonly cropGeometry:
    (CropGeometry & { readonly cropMethod: LabelCropMethod }) | null;
  /** The request instant. An argument so a test can pin the day. */
  readonly now?: IsoTimestamp;
}

export type PipelineOutcome =
  | {
      /** The provider found no label region; a person draws one and the pipeline resumes. */
      readonly kind: "needs_manual_crop";
      readonly labelPhotoId: Uuid;
    }
  | {
      readonly kind: "reviewed";
      readonly verdict: GateVerdict;
      readonly extractionRunId: Uuid;
      readonly labelCropId: Uuid;
      readonly reasonCodes: readonly ReviewReasonCode[];
      readonly isReviewRequired: boolean;
    };

interface LoadedSession {
  readonly session: IntakeSession;
  readonly record: BatteryRecord;
}

/** The session and its draft record, or a refusal that says why. */
async function loadSession(
  ctx: RequestContext,
  sessionId: Uuid,
): Promise<LoadedSession> {
  const session = await data.intakeSessions.get(ctx, sessionId);
  if (session === null) {
    throw new NotFoundError({
      userMessage: INTAKE_NOT_FOUND,
      correlationId: ctx.correlationId,
      context: { intakeSessionId: sessionId },
    });
  }
  if (session.status === "completed" || session.status === "abandoned") {
    throw new ConflictError({
      userMessage: INTAKE_CLOSED,
      correlationId: ctx.correlationId,
      context: { intakeSessionId: sessionId, status: session.status },
    });
  }
  const record =
    session.batteryRecordId === null
      ? null
      : await data.batteryRecords.get(ctx, session.batteryRecordId);
  if (record === null) {
    throw new DataIntegrityError({
      userMessage: INTAKE_HAS_NO_RECORD,
      correlationId: ctx.correlationId,
      context: { intakeSessionId: sessionId },
    });
  }
  return { session, record };
}

/**
 * The configuration in force, validated, and checked against the session's
 * stamp.
 *
 * `intake_session.gate_thresholds_applied` is stamped when the session starts
 * and the contract makes it immutable afterwards; a gate evaluated under a
 * different set would stamp nothing and reproduce nothing (Rule 2.16), so the
 * mismatch refuses rather than silently applying one set and recording another.
 */
export async function readGateConfiguration(
  ctx: RequestContext,
  session: IntakeSession | null,
): Promise<IntakeGateConfiguration> {
  const read =
    await data.platformConfiguration.readIntakeGateConfiguration(ctx);
  const validation = validateIntakeGateConfiguration(read);
  if (!validation.ok) {
    throw new DataIntegrityError({
      userMessage:
        "The label-reading configuration could not be loaded. Nothing was changed — ask an Admin.",
      correlationId: ctx.correlationId,
      context: { issues: validation.issues },
    });
  }
  const configuration = validation.configuration;
  if (session !== null) {
    const stamped = session.gateThresholdsApplied;
    const applied = configuration.thresholds;
    const agrees = (Object.keys(applied) as (keyof typeof applied)[]).every(
      (key) => stamped[key] === applied[key],
    );
    if (!agrees) {
      throw new ConflictError({
        userMessage: CONFIGURATION_CHANGED_MID_SESSION,
        correlationId: ctx.correlationId,
        context: { intakeSessionId: session.id },
      });
    }
  }
  return configuration;
}

/** `jsonb` from a provider's `unknown` — a JSON round trip, or nothing. */
function toJsonValue(value: unknown): JsonValue | null {
  if (value === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(value)) as JsonValue;
  } catch {
    return null;
  }
}

function cutoffsAsJson(configuration: IntakeGateConfiguration): JsonObject {
  return { ...configuration.bandCutoffs };
}

function isHardGated(fieldCode: LabelFieldCode): boolean {
  return (HARD_GATED_LABEL_FIELD_CODES as readonly LabelFieldCode[]).includes(
    fieldCode,
  );
}

// --- step 1 · crop -----------------------------------------------------------------

async function cropStep(
  ctx: RequestContext,
  session: IntakeSession,
  parent: IntakePhoto,
  bytes: Uint8Array,
  geometry: PipelineRequest["cropGeometry"],
  labelFileName: string | null,
): Promise<IntakePhoto | null> {
  const provider = visionProvider();
  let crop: CropGeometry;
  let cropMethod: LabelCropMethod;

  if (geometry === null) {
    const detected = await provider.detectLabelRegion({
      bytes,
      mimeType: parent.mimeType,
      width: parent.widthPx,
      height: parent.heightPx,
      fileName: labelFileName,
    });
    if (detected === null) return null;
    crop = {
      x: detected.box.x,
      y: detected.box.y,
      width: detected.box.width,
      height: detected.box.height,
      sourceWidth: parent.widthPx,
      sourceHeight: parent.heightPx,
    };
    cropMethod = "auto_detected";
  } else {
    crop = {
      x: geometry.x,
      y: geometry.y,
      width: geometry.width,
      height: geometry.height,
      sourceWidth: geometry.sourceWidth,
      sourceHeight: geometry.sourceHeight,
    };
    cropMethod = geometry.cropMethod;
  }

  // The crop is a row whose geometry is the crop. B1a has no image decoder,
  // so the bytes stored under the crop's own path are the parent's bytes —
  // the deterministic crop from stored geometry arrives with the real object
  // store, and this row already carries everything it needs to produce it.
  const stored = await data.objects.put(ctx, {
    bucket: INTAKE_PHOTO_BUCKET,
    path: intakeObjectPath(
      ctx.organizationId,
      session.id,
      `crops/${crypto.randomUUID()}.${fileExtensionFor(parent.mimeType)}`,
    ),
    bytes,
    contentType: parent.mimeType,
    immutable: true,
  });

  const input: CreateIntakePhoto = {
    intakeSessionId: session.id,
    parentIntakePhotoId: parent.id,
    photoType: "label_crop",
    storageObjectPath: stored.path,
    contentHash: parent.contentHash,
    byteSize: stored.byteSize,
    mimeType: parent.mimeType,
    widthPx: crop.width,
    heightPx: crop.height,
    cropGeometry: crop,
    cropMethod,
    capturedAt: parent.capturedAt,
    // T-12 — stamped once at capture; the crop inherits the original's stamp.
    dataUseEligibility: parent.dataUseEligibility,
    isExifStripped: true,
    takenBy: ctx.userId,
  };
  const cropPhoto = await data.intakePhotos.append(ctx, input);

  // TODO(T-43): a label crop is a pipeline step and Rule 2.4 audits every
  // step, but AUDIT_EVENT_TYPES carries no `intake_photo.cropped` value and
  // `intake_photo.captured` is a person's act, not the region step's.
  // TAXONOMY.md §1.1 forbids inventing one; proposed value `intake_photo.cropped`.
  return cropPhoto;
}

// --- step 2 · extract ----------------------------------------------------------------

interface ExtractedField {
  readonly fieldCode: LabelFieldCode;
  readonly fieldValue: string | null;
  readonly confidenceBand: ConfidenceBand;
  readonly rawConfidence: Decimal | null;
  readonly rawText: string | null;
  readonly evidenceBbox: readonly Decimal[] | null;
  readonly validationFailed: boolean;
}

/**
 * One provider answer to one row's worth of facts.
 *
 * A provider field with a null value is unread: no score is stored for it and
 * its band is `not_extracted`, whatever confidence the provider attached to
 * its own silence. A value that fails shape validation stands as unread too
 * (Rule 2.12) — the reviewer sees the raw text, never a nameplate figure that
 * was never one — and its score is kept for audit.
 */
function extractedField(
  fieldCode: LabelFieldCode,
  result: ValidatedLabelExtractionResult,
  configuration: IntakeGateConfiguration,
): ExtractedField {
  const answer = result.fields[fieldCode];
  const rawConfidence =
    answer.value === null ? null : String(answer.confidence);
  const validation = validateExtractedField(fieldCode, answer.value);
  const rawText =
    answer.evidence?.rawText ?? (validation.ok ? null : validation.rawText);
  return {
    fieldCode,
    fieldValue: validation.ok ? validation.value : null,
    confidenceBand: validation.ok
      ? bandForScore(rawConfidence, configuration.bandCutoffs)
      : "not_extracted",
    rawConfidence,
    rawText: rawText ?? null,
    evidenceBbox:
      answer.evidence?.boundingBox?.map((coordinate) => String(coordinate)) ??
      null,
    validationFailed: !validation.ok,
  };
}

interface ExtractionRun {
  readonly extractionRunId: Uuid;
  readonly requestedAt: IsoTimestamp;
  readonly respondedAt: IsoTimestamp;
  readonly latencyMs: number;
}

async function appendExtractionRows(
  ctx: RequestContext,
  session: IntakeSession,
  crop: IntakePhoto,
  run: ExtractionRun,
  configuration: IntakeGateConfiguration,
  rows: readonly {
    readonly field: ExtractedField;
    readonly provider: string;
    readonly modelIdentifier: string;
    readonly promptVersion: string;
    readonly schemaVersion: string;
    readonly rawResponse: JsonValue | null;
    readonly tokenUsage: JsonObject | null;
    readonly costUsd: Decimal | null;
    readonly errorCode: string | null;
  }[],
): Promise<void> {
  for (const row of rows) {
    const input: CreateLabelExtraction = {
      intakeSessionId: session.id,
      intakePhotoId: crop.id,
      extractionRunId: run.extractionRunId,
      fieldCode: row.field.fieldCode,
      fieldValue: row.field.fieldValue,
      confidenceBand: row.field.confidenceBand,
      rawConfidence: row.field.rawConfidence,
      bandCutoffsApplied: cutoffsAsJson(configuration),
      isHardGated: isHardGated(row.field.fieldCode),
      evidenceBbox: row.field.evidenceBbox,
      rawText: row.field.rawText,
      provider: row.provider,
      modelIdentifier: row.modelIdentifier,
      promptVersion: row.promptVersion,
      schemaVersion: row.schemaVersion,
      rawResponse: row.rawResponse,
      latencyMs: run.latencyMs,
      tokenUsage: row.tokenUsage,
      costUsd: row.costUsd,
      errorCode: row.errorCode,
      requestedAt: run.requestedAt,
      respondedAt: run.respondedAt,
    };
    await data.labelExtractions.append(ctx, input);
  }
}

/** Every T-09 code as unread — the failure rows, and the gate's view of them. */
function unreadFields(): readonly ExtractedField[] {
  return LABEL_FIELD_CODES.map((fieldCode) => ({
    fieldCode,
    fieldValue: null,
    confidenceBand: "not_extracted",
    rawConfidence: null,
    rawText: null,
    evidenceBbox: null,
    validationFailed: false,
  }));
}

function seedRows(
  fields: readonly ExtractedField[],
): readonly ExtractionSeedRow[] {
  return fields.map((field) => ({
    fieldCode: field.fieldCode,
    fieldValue: field.fieldValue,
    confidenceBand: field.confidenceBand,
    isHardGated: isHardGated(field.fieldCode),
    rawText: field.rawText,
  }));
}

/**
 * The fields the gate measures.
 *
 * `assessed_condition` is left out: no label prints a condition, a provider's
 * proposal of one is advisory at most, and a person records and confirms it
 * on step 3 as a condition (Rules 6.1, 6.2). Its absence from a read is the
 * normal state, not a field below threshold — measured, it would route every
 * intake to review for a value nobody was ever going to read off a label.
 * It stays a hard-gated field: the verdict lists it, and the commit refuses
 * without its confirmation (Rule 2.15).
 */
function gateFields(
  fields: readonly ExtractedField[],
): readonly GateFieldInput[] {
  return fields
    .filter((field) => field.fieldCode !== CONDITION_FIELD)
    .map((field) => ({
      fieldCode: field.fieldCode,
      confidenceBand: field.confidenceBand,
      isHardGated: isHardGated(field.fieldCode),
      validationFailed: field.validationFailed,
      value: field.fieldValue,
    }));
}

/**
 * A failed provider call, recorded rather than swallowed (EC-14).
 *
 * The session is `failed` and stays recoverable with its photos; one row per
 * requested field carries the error code so the failure is as auditable as a
 * success (T-10); the gate verdict is evaluated with `extractionFailed` so
 * the reason is on the session; and the draft is seeded unread so the manual
 * path can proceed from here. Then the failure is rethrown at the seam as an
 * `IntegrationError` naming no vendor.
 */
async function recordExtractionFailure(
  ctx: RequestContext,
  session: IntakeSession,
  record: BatteryRecord,
  labelPhoto: IntakePhoto,
  crop: IntakePhoto,
  run: ExtractionRun,
  configuration: IntakeGateConfiguration,
  error: unknown,
): Promise<never> {
  const provider = visionProvider();
  const code: VisionProviderErrorCode | "unexpected" = isVisionProviderError(
    error,
  )
    ? error.code
    : "unexpected";
  const retryable = isVisionProviderError(error) ? error.retryable : true;
  const fields = unreadFields();

  await appendExtractionRows(
    ctx,
    session,
    crop,
    run,
    configuration,
    fields.map((field) => ({
      field,
      provider: provider.code,
      // A call that did not complete reports no model identifier and no
      // prompt version; the row's columns are non-null, so the provider's
      // own code stands in. Reported in the build-notes as a column that
      // ought to be nullable on a failure row.
      modelIdentifier: provider.code,
      promptVersion: provider.code,
      schemaVersion: LABEL_EXTRACTION_SCHEMA_VERSION,
      rawResponse: null,
      tokenUsage: null,
      costUsd: null,
      errorCode: code,
    })),
  );

  const verdict = evaluateConfidenceGate(
    {
      fields: gateFields(fields),
      match: { candidates: [] },
      extractionFailed: true,
    },
    configuration.thresholds,
  );

  const draft: IntakeDraft = {
    ...seedDraftFromExtraction(seedRows(fields), [], null, null),
    labelPhotoId: labelPhoto.id,
    labelCropId: crop.id,
    extractionRunId: run.extractionRunId,
  };

  await data.intakeSessions.update(ctx, session.id, {
    status: "failed",
    currentStep: "capture",
    isReviewRequired: verdict.isReviewRequired,
    reviewReasonCodes: verdict.reasonCodes,
    draft,
  });
  void record;

  // TODO(T-43): a failure is not a completion, so `label_extraction.completed`
  // is not written for it, and AUDIT_EVENT_TYPES carries no
  // `label_extraction.failed` value. TAXONOMY.md §1.1 forbids inventing one;
  // proposed value `label_extraction.failed`. The failure row on
  // `label_extraction` carries the error code meanwhile.

  throw new IntegrationError({
    userMessage:
      code === "malformed" ? LABEL_READ_MALFORMED : LABEL_READ_UNAVAILABLE,
    correlationId: ctx.correlationId,
    retryable,
    cause: error,
    context: { intakeSessionId: session.id, errorCode: code },
  });
}

// --- step 4 · match ---------------------------------------------------------------------

function identifiersFrom(fields: readonly ExtractedField[]): MatchIdentifiers {
  const value = (fieldCode: LabelFieldCode): string | null =>
    fields.find((field) => field.fieldCode === fieldCode)?.fieldValue ?? null;
  const convert = (
    text: string | null,
    to: (quantity: { value: string; unit: string }) => string | null,
  ): string | null => {
    if (text === null) return null;
    const parsed = parseLabelQuantity(text);
    return parsed === null ? null : to(parsed);
  };
  return {
    manufacturer: value("manufacturer"),
    model: value("model"),
    voltageV: convert(value("voltage"), toVolts),
    capacityAh: convert(value("capacity_ah"), toAmpHours),
    energyWh: convert(value("energy_wh"), toWattHours),
  };
}

/**
 * Retrieval then ranking (§11.1 step 4). The adapter retrieves a bounded set
 * by normalised part number, and by manufacturer alone when the part number
 * yields nothing; `rankCatalogCandidates` orders it. **With no identifier at
 * all nothing is retrieved** — an unfiltered read would return the whole
 * catalog as candidates for a label nobody could read.
 */
async function matchStep(
  ctx: RequestContext,
  ids: MatchIdentifiers,
  configuration: IntakeGateConfiguration,
): Promise<{
  readonly ranked: readonly RankedCandidate[];
  readonly entries: readonly CatalogEntry[];
}> {
  const partNumberNormalized =
    ids.model === null ? null : normalizePartNumber(ids.model);
  const manufacturerNormalized = ids.manufacturer?.trim().toLowerCase() ?? null;

  let entries: readonly CatalogEntry[] = [];
  if (partNumberNormalized !== null && partNumberNormalized !== "") {
    entries = await data.catalogEntries.findCandidates(ctx, {
      partNumberNormalized,
      ...(manufacturerNormalized === null ? {} : { manufacturerNormalized }),
      limit: CANDIDATE_LIMIT,
    });
  }
  if (entries.length === 0 && manufacturerNormalized !== null) {
    entries = await data.catalogEntries.findCandidates(ctx, {
      manufacturerNormalized,
      limit: CANDIDATE_LIMIT,
    });
  }

  const ranked = rankCatalogCandidates(
    ids,
    entries.map((entry) => ({
      catalogEntryId: entry.id,
      manufacturerName: entry.manufacturerName,
      modelName: entry.modelName,
      partNumber: entry.partNumber,
      partNumberNormalized: entry.partNumberNormalized,
      nominalVoltageV: entry.nominalVoltageV,
      ratedCapacityAh: entry.ratedCapacityAh,
      ratedEnergyWh: entry.ratedEnergyWh,
      labelTextPatterns: entry.labelTextPatterns,
    })),
    {
      tolerances: configuration.matchTolerances,
      scoring: configuration.matchScoring,
    },
  );
  return { ranked, entries };
}

// --- the orchestrator -----------------------------------------------------------------

/**
 * Run the pipeline for one label photo.
 *
 * Returns `needs_manual_crop` when the provider finds no label region, and
 * `reviewed` once the gate has handed the session to a person. A provider
 * failure is persisted and then thrown as an `IntegrationError`; the session
 * is left `failed` and recoverable (EC-14).
 */
export async function runIntakePipeline(
  ctx: RequestContext,
  request: PipelineRequest,
): Promise<PipelineOutcome> {
  const now = request.now ?? new Date().toISOString();
  const { session, record } = await loadSession(ctx, request.sessionId);
  const configuration = await readGateConfiguration(ctx, session);
  const provider = visionProvider();

  const labelPhoto = await data.intakePhotos.get(ctx, request.labelPhotoId);
  if (labelPhoto === null || labelPhoto.intakeSessionId !== session.id) {
    throw new NotFoundError({
      userMessage: PHOTO_NOT_ON_INTAKE,
      correlationId: ctx.correlationId,
      context: { intakeSessionId: session.id, photoId: request.labelPhotoId },
    });
  }
  if (
    labelPhoto.photoType !== "label" ||
    labelPhoto.parentIntakePhotoId !== null
  ) {
    throw new ValidationError({
      userMessage: PHOTO_NOT_A_LABEL,
      correlationId: ctx.correlationId,
      field: "labelPhotoId",
      context: { photoType: labelPhoto.photoType },
    });
  }

  const bytes = await data.objects.get(ctx, {
    bucket: INTAKE_PHOTO_BUCKET,
    path: labelPhoto.storageObjectPath,
  });

  // 1 · crop
  const crop = await cropStep(
    ctx,
    session,
    labelPhoto,
    bytes,
    request.cropGeometry,
    request.labelFileName,
  );
  if (crop === null) {
    return { kind: "needs_manual_crop", labelPhotoId: labelPhoto.id };
  }

  // 2 · extract
  await data.intakeSessions.update(ctx, session.id, { status: "extracting" });
  const run: { extractionRunId: Uuid; requestedAt: IsoTimestamp } = {
    // A grouping key, not a row id: it ties the field rows of one provider
    // call together and is never dereferenced as an FK.
    extractionRunId: crypto.randomUUID(),
    requestedAt: new Date().toISOString(),
  };
  const requestedMs = Date.now();

  let result: ValidatedLabelExtractionResult;
  try {
    const raw = await provider.extractLabelFields({
      bytes,
      mimeType: crop.mimeType,
      width: crop.widthPx,
      height: crop.heightPx,
      fileName: request.labelFileName,
      requestedFields: LABEL_FIELD_KEYS,
    });
    // Schema validation before anything else happens (§11.1 step 3; EC-7).
    result = parseLabelExtractionResult(raw, LABEL_FIELD_KEYS);
  } catch (error) {
    const respondedAt = new Date().toISOString();
    return recordExtractionFailure(
      ctx,
      session,
      record,
      labelPhoto,
      crop,
      { ...run, respondedAt, latencyMs: Date.now() - requestedMs },
      configuration,
      error,
    );
  }
  const completedRun: ExtractionRun = {
    ...run,
    respondedAt: new Date().toISOString(),
    latencyMs: Date.now() - requestedMs,
  };

  const fields = LABEL_FIELD_CODES.map((fieldCode) =>
    extractedField(fieldCode, result, configuration),
  );
  const rawResponse = toJsonValue(result.rawResponse);
  const tokenUsage: JsonObject | null =
    result.usage === null || result.usage === undefined
      ? null
      : {
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
        };
  const costUsd =
    result.usage?.costUsd === undefined ? null : String(result.usage.costUsd);

  await appendExtractionRows(
    ctx,
    session,
    crop,
    completedRun,
    configuration,
    fields.map((field) => ({
      field,
      provider: result.providerCode,
      modelIdentifier: result.modelIdentifier,
      promptVersion: result.promptVersion,
      schemaVersion: result.schemaVersion,
      rawResponse,
      tokenUsage,
      costUsd,
      errorCode: null,
    })),
  );

  await data.auditEvents.write(
    ctx,
    systemStepEvent(ctx, {
      step: "extract",
      provider: result.providerCode,
      eventType: "label_extraction.completed",
      entityTable: "label_extraction",
      // The run id groups the eleven rows; there is no single row to name.
      entityId: completedRun.extractionRunId,
      at: completedRun.respondedAt,
      afterState: {
        intakeSessionId: session.id,
        intakePhotoId: crop.id,
        modelIdentifier: result.modelIdentifier,
        promptVersion: result.promptVersion,
        schemaVersion: result.schemaVersion,
        fieldsRead: fields
          .filter((field) => field.fieldValue !== null)
          .map((field) => field.fieldCode),
        latencyMs: completedRun.latencyMs,
      },
    }),
  );

  // 4 · match (Rules 2.18, 2.19 — ranked, never selected)
  const ids = identifiersFrom(fields);
  const { ranked, entries } = await matchStep(ctx, ids, configuration);
  await data.auditEvents.write(
    ctx,
    systemStepEvent(ctx, {
      step: "match",
      provider: result.providerCode,
      eventType: "catalog_entry.matched",
      entityTable: "battery_record",
      entityId: record.id,
      at: new Date().toISOString(),
      afterState: {
        rankedCatalogEntryIds: ranked.map(
          (candidate) => candidate.catalogEntryId,
        ),
        matchMethods: ranked.map((candidate) => candidate.matchMethodCode),
        exactMatch: isExactMatch(ranked),
      },
      reason: ranked.length === 0 ? "no_catalog_match" : null,
    }),
  );

  // 3 · decode — the format key is the exact match's, or there is none.
  const exact = isExactMatch(ranked)
    ? entries.find((entry) => entry.id === ranked[0]?.catalogEntryId)
    : undefined;
  const organization = await data.organizations.get(ctx, ctx.organizationId);
  const rawDateCode =
    fields.find((field) => field.fieldCode === "date_code")?.fieldValue ?? null;
  const decode: DateCodeDecodeResult | null =
    rawDateCode === null
      ? null
      : decodeDateCode(
          rawDateCode,
          exact?.dateCodeFormatKey ?? null,
          civilDateInZone(now, organization?.timeZone ?? "UTC"),
        );

  // 5 · gate (Rules 2.13–2.16)
  const verdict = evaluateConfidenceGate(
    {
      fields: gateFields(fields),
      match: { candidates: ranked },
      extractionFailed: false,
    },
    configuration.thresholds,
  );

  const candidates: readonly CandidateSeedRow[] = ranked.map((candidate) => ({
    catalogEntryId: candidate.catalogEntryId,
    matchScore: candidate.matchScore,
    matchMethodCode: candidate.matchMethodCode,
    matchedOn: candidate.matchedOn,
  }));
  const draft: IntakeDraft = {
    ...seedDraftFromExtraction(seedRows(fields), candidates, decode, null),
    labelPhotoId: labelPhoto.id,
    labelCropId: crop.id,
    extractionRunId: completedRun.extractionRunId,
  };

  await data.intakeSessions.update(ctx, session.id, {
    status: "awaiting_confirmation",
    currentStep: "extraction_review",
    isReviewRequired: verdict.isReviewRequired,
    reviewReasonCodes: verdict.reasonCodes,
    draft,
  });

  if (verdict.isReviewRequired) {
    await data.batteryRecords.update(ctx, record.id, {
      status: "pending_review",
    });
    await data.auditEvents.write(
      ctx,
      systemStepEvent(ctx, {
        step: "gate",
        provider: result.providerCode,
        eventType: "battery_record.routed_to_review",
        entityTable: "battery_record",
        entityId: record.id,
        at: new Date().toISOString(),
        beforeState: { status: record.status },
        afterState: {
          status: "pending_review",
          reasonCodes: [...verdict.reasonCodes],
          fieldsBelowThreshold: [...verdict.fieldsBelowThreshold],
          thresholdsApplied: { ...verdict.thresholdsApplied },
        },
        changedFields: ["status"],
        reason: verdict.reasonCodes.join(","),
      }),
    );
  }
  // TODO(T-43): a gate that found nothing to route still evaluated (Rule 2.4),
  // and nothing on the record changed for it. AUDIT_EVENT_TYPES carries no
  // `intake_session.gate_evaluated` value and TAXONOMY.md §1.1 forbids
  // inventing one; the session update is the step's record meanwhile.

  return {
    kind: "reviewed",
    verdict,
    extractionRunId: completedRun.extractionRunId,
    labelCropId: crop.id,
    reasonCodes: verdict.reasonCodes,
    isReviewRequired: verdict.isReviewRequired,
  };
}
