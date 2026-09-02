"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { z } from "zod";

import { data } from "@/data";
import type {
  CreateBatteryRecord,
  CreateIntakeSession,
  RequestContext,
} from "@/data/contracts";
import { validateFindings } from "@/domain/condition/damage";
import { canContinueFromReview } from "@/domain/intake/commit-gate";
import {
  commitFieldStates,
  confirmDraftCondition,
  confirmDraftField,
  enterDraftChemistry,
  enterDraftFieldValue,
  markDraftExtractionRejected,
  markDraftManualEntry,
  rejectDraftField,
  selectDraftCandidate,
  setDraftCondition,
  setDraftManufacturedOn,
  setDraftPlacement,
  setDraftSourceDevice,
  setDraftStateOfCharge,
  type DraftActor,
} from "@/domain/intake/draft";
import { validateExtractedField } from "@/domain/intake/field-validation";
import {
  canOpenStep,
  resolveIntakeStep,
  stepIndex,
} from "@/domain/intake/steps";
import { civilDateInZone } from "@/domain/storage/clock-display";
import { requiredContainerType } from "@/domain/storage/placement";
import { CHEMISTRIES, type Chemistry } from "@/domain/taxonomy/chemistry";
import type { IntakeStep } from "@/domain/taxonomy/intake-step";
import { isTaxonomyValue } from "@/domain/taxonomy/lookup";
import type { ReviewReasonCode } from "@/domain/taxonomy/review-reason-code";
import { requireIntakeGate } from "@/features/consent/read-intake-gate";
import {
  actionFailed,
  actionFailedFrom,
  actionSucceeded,
  type ActionResult,
} from "@/lib/action-result";
import { requireWrite } from "@/lib/auth/guard";
import { recordNotFound } from "@/lib/auth/record-denial";
import {
  ConflictError,
  DataIntegrityError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import type { IsoTimestamp, Uuid } from "@/types/common";
import type { IntakeDraft, IntakeSession } from "@/types/intake";

import {
  CATALOG_ENTRY_NOT_AVAILABLE,
  CHEMISTRY_NEEDS_SOURCE,
  CONDITION_CONFIRMED_AT_STEP_3,
  CONDITION_NOT_RECORDED,
  CONTAINER_NEEDS_CLASSIFICATION,
  CONTAINER_NOT_FOUND,
  fieldValueRefused,
  findingsRefused,
  INTAKE_HAS_NO_RECORD,
  LABEL_READ_NEEDS_CROP,
  REASON_SAVED_TO_QUEUE,
  reviewIncomplete,
  STEP_NOT_OPEN,
} from "./copy";
import {
  abandonIntakeSessionSchema,
  advanceToStepSchema,
  choosePlacementSchema,
  confirmFieldSchema,
  confirmIntakeSchema,
  createContainerForIntakeSchema,
  enterChemistrySchema,
  enterFieldValueSchema,
  enterManufacturedOnSchema,
  firstIssue,
  proposeCatalogEntrySchema,
  rejectFieldSchema,
  runLabelExtractionSchema,
  selectCatalogCandidateSchema,
  sessionIdSchema,
  setConditionSchema,
  setLabelCropRegionSchema,
  setSourceDeviceSchema,
  setStateOfChargeSchema,
  startIntakeSessionSchema,
  voidIntakeSessionSchema,
} from "./schemas";
import { userEvent, type RequestAttribution } from "./server/audit";
import {
  previewClassification,
  resolveIntakeRules,
} from "./server/classification-preview";
import { buildIntakeConfirmation } from "./server/confirmation";
import {
  readGateConfiguration,
  runIntakePipeline,
  type PipelineOutcome,
} from "./server/intake-pipeline";
import {
  determinationFor,
  draftForSession,
  latestRunRows,
  loadOpenIntake,
} from "./server/read-intake";

/**
 * The intake Server Actions — `TECHNICAL_SPEC.md` §7.1; `UX_SPEC.md` §2.1,
 * §3.6, §6.4; Rules 2.15, 2.21, 7.1, 7.2.
 *
 * Every mutating action runs the same five steps, in order: (1) the write
 * guard for `/batteries/new`, (2) the Terms of Service gate — the block is on
 * intake, not the app, and it is checked here on every write (Rules 7.1,
 * 7.2), (3) a zod parse from `./schemas`, (4) domain and data, (5)
 * `revalidatePath`. Each returns `ActionResult` and never throws across the
 * boundary; `redirect()` is the one exception and it is called outside the
 * `try`, as `signIn` does.
 *
 * **A confirmation is never optimistic.** Every reducer's result is persisted
 * on `intake_session.draft` before the action returns, and the screen
 * re-renders from server state — a locked phone loses nothing and a
 * confirmed row is a row the server has already recorded (§6.4, Flow A-a).
 *
 * **The server recomputes.** `confirmIntake` rebuilds the whole commit from
 * the draft — the three attributable confirmations, the damage determination,
 * the classification, the container's admission, the clock — and hands the
 * adapter one payload it writes or refuses as a unit. Nothing the client says
 * about a decision is trusted (Rule 2.15, §11.1 step 6).
 */

const INTAKE_ROUTE = "/batteries/new";

function now(): IsoTimestamp {
  return new Date().toISOString();
}

/** The caller's request, as the audit row records it. Read once per action. */
async function requestAttribution(): Promise<RequestAttribution> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  const firstAddress = forwarded?.split(",")[0]?.trim();
  return {
    requestId: headerList.get("x-request-id"),
    ipAddress:
      firstAddress === undefined || firstAddress === "" ? null : firstAddress,
    userAgent: headerList.get("user-agent"),
  };
}

function actor(ctx: RequestContext, at: IsoTimestamp): DraftActor {
  return { userId: ctx.userId, at };
}

/**
 * Steps 1–3 and 5 of every action, once.
 *
 * `run` is step 4. A thrown `AppError` becomes the returned failure with its
 * code, field and correlation id intact; a `NotFoundError` on the session is
 * also recorded as a denial, because an identifier that resolves to nothing
 * is an attempt (§5.3(5), E-15) — and it reads the same whether the row is
 * absent or another tenant's (Rule 1.2).
 */
async function intakeAction<TInput, TData>(
  attempted: string,
  schema: z.ZodType<TInput>,
  input: unknown,
  run: (
    ctx: RequestContext,
    parsed: TInput,
    attribution: RequestAttribution,
  ) => Promise<TData>,
): Promise<ActionResult<TData>> {
  const guard = await requireWrite(INTAKE_ROUTE, attempted);
  if (!guard.ok) return guard;
  const { ctx } = guard;

  const blocked = await requireIntakeGate(ctx);
  if (blocked !== null) return blocked;

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const issue = firstIssue(parsed.error);
    return actionFailed<TData>({
      code: "VALIDATION",
      message: issue.message,
      ...(issue.field === undefined ? {} : { field: issue.field }),
      correlationId: ctx.correlationId,
    });
  }

  try {
    const attribution = await requestAttribution();
    const result = await run(ctx, parsed.data, attribution);
    revalidatePath(INTAKE_ROUTE);
    return actionSucceeded(result);
  } catch (error) {
    if (error instanceof NotFoundError) {
      const sessionId = (parsed.data as { sessionId?: unknown }).sessionId;
      if (typeof sessionId === "string") {
        await recordNotFound(ctx, "intake_session", sessionId);
      }
    }
    return actionFailedFrom<TData>(error, ctx.correlationId);
  }
}

/** The session, its record and its draft, for an action that edits the draft. */
async function openDraft(ctx: RequestContext, sessionId: Uuid) {
  const { session, record } = await loadOpenIntake(ctx, sessionId);
  const { draft, extractions } = await draftForSession(ctx, session);
  return { session, record, draft, extractions };
}

async function persistDraft(
  ctx: RequestContext,
  session: IntakeSession,
  draft: IntakeDraft,
): Promise<IntakeDraft> {
  const updated = await data.intakeSessions.update(ctx, session.id, { draft });
  return updated.draft ?? draft;
}

export interface DraftActionData {
  readonly sessionId: Uuid;
  readonly draft: IntakeDraft;
}

// --- 7.1 · sessions ---------------------------------------------------------------

export interface StartIntakeSessionData {
  readonly sessionId: Uuid;
  readonly batteryRecordId: Uuid;
}

/**
 * Open a session and the draft record it will confirm into (T-22 `draft`).
 *
 * The record is created narrow of nothing: every nullable column null and
 * every enumerated column at its "not confirmed" value, so a mobility pack, a
 * consumer cell and a traction pack all start from the same row. The gate
 * thresholds in force are stamped on the session now, because the contract
 * makes the stamp immutable afterwards (Rule 2.16); the pipeline checks the
 * configuration it reads against this stamp before it evaluates anything.
 */
export async function startIntakeSession(
  input: unknown,
): Promise<ActionResult<StartIntakeSessionData>> {
  return intakeAction(
    "startIntakeSession",
    startIntakeSessionSchema,
    input,
    async (ctx, parsed, attribution) => {
      const at = now();
      const configuration = await readGateConfiguration(ctx, null);

      const sessionInput: CreateIntakeSession = {
        status: "open",
        currentStep: "capture",
        isReviewRequired: false,
        reviewReasonCodes: null,
        gateThresholdsApplied: { ...configuration.thresholds },
        correlationId: ctx.correlationId,
        // Capture device and app version. No GPS, and nothing from EXIF
        // (Rule 7.21) — the user agent is what the request itself says.
        deviceContext: { userAgent: attribution.userAgent },
        startedBy: ctx.userId,
        startedAt: at,
        abandonedAt: null,
        draft: null,
      };
      const session = await data.intakeSessions.create(ctx, sessionInput);

      const recordInput: CreateBatteryRecord = {
        batteryPassportIdentifier: null,
        status: "draft",
        intakeSessionId: session.id,
        catalogEntryId: null,
        containerId: null,
        archivedAt: null,
        batteryStatus: null,
        manufacturerName: null,
        manufacturerIdentifier: null,
        manufacturingPlace: null,
        manufacturedOn: null,
        brandName: null,
        modelName: null,
        partNumber: null,
        serialNumber: null,
        batteryMassKg: null,
        chemistry: null,
        cellFormFactor: "unknown",
        assemblyLevel: "unknown",
        applicationClass: "unknown",
        cellCount: null,
        moduleCount: null,
        nominalVoltageV: null,
        minVoltageV: null,
        maxVoltageV: null,
        ratedCapacityAh: null,
        ratedEnergyWh: null,
        originalPowerW: null,
        expectedLifetimeCycles: null,
        operatingTempMinC: null,
        operatingTempMaxC: null,
        internalResistanceMohm: null,
        cRateMax: null,
        materialComposition: null,
        hazardousSubstances: null,
        criticalRawMaterials: null,
        recycledContent: null,
        carbonFootprint: null,
        dismantlingInformation: null,
        safetyInformation: null,
        extinguishingAgent: null,
        certificationMarks: null,
        un383TestSummaryRef: null,
        hasUn383Summary: null,
        hasSeparateCollectionSymbol: null,
        stateOfChargeBand: "not_captured",
        stateOfChargePercentAtIntake: null,
        socSource: null,
        socAssessedAt: null,
        dispositionRoute: "pending",
        assessedCondition: null,
        conditionConfirmedBy: null,
        conditionConfirmedAt: null,
        chemistrySource: null,
        chemistryConfirmedBy: null,
        chemistryConfirmedAt: null,
        conditionRuleVersionId: null,
        dateCodeRaw: null,
        dateCodeDecodeId: null,
        sourceDeviceType: null,
        sourceDeviceIdentifier: null,
        sourceDeviceMake: null,
        sourceDeviceModel: null,
        sourceDeviceModelYear: null,
        provenanceSourceType: "unknown_provenance",
        provenanceRecordedAt: null,
        passportExtension: null,
      };
      const record = await data.batteryRecords.create(ctx, recordInput);

      await data.intakeSessions.update(ctx, session.id, {
        batteryRecordId: record.id,
        // The container the person was standing at when they started, kept
        // on the draft so step 3 pre-selects it and nothing else assumes it.
        draft:
          parsed.containerId === null || parsed.containerId === undefined
            ? null
            : await seededPlacementDraft(ctx, session, parsed.containerId),
      });

      await data.auditEvents.write(
        ctx,
        userEvent(ctx, {
          eventType: "intake_session.started",
          entityTable: "intake_session",
          entityId: session.id,
          at,
          afterState: {
            status: session.status,
            currentStep: session.currentStep,
            batteryRecordId: record.id,
            containerId: parsed.containerId ?? null,
          },
          attribution,
        }),
      );

      return { sessionId: session.id, batteryRecordId: record.id };
    },
  );
}

/** A draft that knows only which container the intake started beside. */
async function seededPlacementDraft(
  ctx: RequestContext,
  session: IntakeSession,
  containerId: Uuid,
): Promise<IntakeDraft> {
  const container = await data.containers.get(ctx, containerId);
  const { draft } = await draftForSession(ctx, session);
  return setDraftPlacement(draft, container === null ? null : container.id);
}

// --- 7.3 · the pipeline -----------------------------------------------------------------

export type LabelExtractionData =
  | {
      readonly kind: "needs_manual_crop";
      readonly labelPhotoId: Uuid;
      readonly message: string;
    }
  | {
      readonly kind: "reviewed";
      readonly isReviewRequired: boolean;
      readonly reasonCodes: readonly string[];
      readonly extractionRunId: Uuid;
    };

function extractionData(outcome: PipelineOutcome): LabelExtractionData {
  if (outcome.kind === "needs_manual_crop") {
    return {
      kind: "needs_manual_crop",
      labelPhotoId: outcome.labelPhotoId,
      message: LABEL_READ_NEEDS_CROP,
    };
  }
  return {
    kind: "reviewed",
    isReviewRequired: outcome.isReviewRequired,
    reasonCodes: outcome.reasonCodes,
    extractionRunId: outcome.extractionRunId,
  };
}

/** Steps 2–5 on a label photo. A provider failure returns `INTEGRATION`; the session stays recoverable (EC-14). */
export async function runLabelExtraction(
  input: unknown,
): Promise<ActionResult<LabelExtractionData>> {
  return intakeAction(
    "runLabelExtraction",
    runLabelExtractionSchema,
    input,
    async (ctx, parsed) =>
      extractionData(
        await runIntakePipeline(ctx, {
          sessionId: parsed.sessionId,
          labelPhotoId: parsed.labelPhotoId,
          labelFileName: parsed.labelFileName ?? null,
          cropGeometry: null,
        }),
      ),
  );
}

/** A person drew the label box (T-51 `manual`); the pipeline resumes from the crop. */
export async function setLabelCropRegion(
  input: unknown,
): Promise<ActionResult<LabelExtractionData>> {
  return intakeAction(
    "setLabelCropRegion",
    setLabelCropRegionSchema,
    input,
    async (ctx, parsed) =>
      extractionData(
        await runIntakePipeline(ctx, {
          sessionId: parsed.sessionId,
          labelPhotoId: parsed.labelPhotoId,
          labelFileName: parsed.labelFileName ?? null,
          cropGeometry: { ...parsed.geometry, cropMethod: "manual" },
        }),
      ),
  );
}

// --- §2.1 · the extraction review card ------------------------------------------------------

function isEnterableChemistry(value: string): value is Chemistry {
  return isTaxonomyValue(CHEMISTRIES, value) && value !== "unknown";
}

/**
 * Confirm a field as read or as corrected (Rule 2.21 — attributed to the
 * caller, at this instant).
 *
 * `value: null` confirms what the draft holds. A corrected value passes the
 * same shape validation the extraction did (Rule 2.12). Chemistry code is
 * confirmed only once a chemistry has a source — a picked entry or a hand
 * entry — because the label's characters are not a chemistry (Rule 2.10);
 * a value that is itself a chemistry is entered by hand and then confirmed.
 * Assessed condition is confirmed on step 3, never here (Rule 6.2).
 */
export async function confirmField(
  input: unknown,
): Promise<ActionResult<DraftActionData>> {
  return intakeAction(
    "confirmField",
    confirmFieldSchema,
    input,
    async (ctx, parsed) => {
      const { session, draft } = await openDraft(ctx, parsed.sessionId);
      const at = now();

      if (parsed.fieldCode === "assessed_condition") {
        throw new ValidationError({
          userMessage: CONDITION_CONFIRMED_AT_STEP_3,
          correlationId: ctx.correlationId,
          field: "fieldCode",
        });
      }

      let next = draft;
      const field = draft.fields.find(
        (entry) => entry.fieldCode === parsed.fieldCode,
      );
      let value = parsed.value ?? field?.value ?? null;

      if (parsed.fieldCode === "chemistry_code") {
        if (
          value !== null &&
          isEnterableChemistry(value) &&
          value !== draft.chemistry
        ) {
          next = enterDraftChemistry(next, value);
        }
        if (next.chemistry === null || next.chemistrySource === null) {
          throw new ValidationError({
            userMessage: CHEMISTRY_NEEDS_SOURCE,
            correlationId: ctx.correlationId,
            field: "value",
          });
        }
        value = next.chemistry;
      } else if (value !== null) {
        const validation = validateExtractedField(parsed.fieldCode, value);
        if (!validation.ok) {
          throw new ValidationError({
            userMessage: fieldValueRefused(parsed.fieldCode, validation.reason),
            correlationId: ctx.correlationId,
            field: "value",
          });
        }
        value = validation.value;
      }

      next = confirmDraftField(next, parsed.fieldCode, value, actor(ctx, at));
      const persisted = await persistDraft(ctx, session, next);
      return { sessionId: session.id, draft: persisted };
    },
  );
}

/** Reject a field's read (§2.1.5). The read stays as the original; the rejection is attributed. */
export async function rejectField(
  input: unknown,
): Promise<ActionResult<DraftActionData>> {
  return intakeAction(
    "rejectField",
    rejectFieldSchema,
    input,
    async (ctx, parsed) => {
      const { session, draft } = await openDraft(ctx, parsed.sessionId);
      const next = rejectDraftField(draft, parsed.fieldCode, actor(ctx, now()));
      return {
        sessionId: session.id,
        draft: await persistDraft(ctx, session, next),
      };
    },
  );
}

/**
 * A person types a value the read did not supply, or corrects one on the
 * manual path. Pending until confirmed — entering and confirming are two acts.
 */
export async function enterFieldValue(
  input: unknown,
): Promise<ActionResult<DraftActionData>> {
  return intakeAction(
    "enterFieldValue",
    enterFieldValueSchema,
    input,
    async (ctx, parsed) => {
      const { session, draft } = await openDraft(ctx, parsed.sessionId);

      if (parsed.fieldCode === "assessed_condition") {
        throw new ValidationError({
          userMessage: CONDITION_CONFIRMED_AT_STEP_3,
          correlationId: ctx.correlationId,
          field: "fieldCode",
        });
      }

      let next = draft;
      if (parsed.fieldCode === "chemistry_code") {
        if (parsed.value === null || !isEnterableChemistry(parsed.value)) {
          throw new ValidationError({
            userMessage: CHEMISTRY_NEEDS_SOURCE,
            correlationId: ctx.correlationId,
            field: "value",
          });
        }
        next = enterDraftChemistry(next, parsed.value);
      } else {
        let value = parsed.value;
        if (value !== null) {
          const validation = validateExtractedField(parsed.fieldCode, value);
          if (!validation.ok) {
            throw new ValidationError({
              userMessage: fieldValueRefused(
                parsed.fieldCode,
                validation.reason,
              ),
              correlationId: ctx.correlationId,
              field: "value",
            });
          }
          value = validation.value;
        }
        next = enterDraftFieldValue(next, parsed.fieldCode, value);
      }

      // A value typed where the read supplied none is the manual path (E-4,
      // E-5); the extraction, if any, stays.
      const field = draft.fields.find(
        (entry) => entry.fieldCode === parsed.fieldCode,
      );
      if (field?.originalValue === null || draft.extractionRejected) {
        next = markDraftManualEntry(next);
      }

      return {
        sessionId: session.id,
        draft: await persistDraft(ctx, session, next),
      };
    },
  );
}

/**
 * Pick a catalog candidate, or decline them all (`null`, Rule 2.20).
 *
 * The entry's chemistry becomes the record's proposed chemistry, source
 * `catalog_match`, pending the person's confirmation (Rules 2.10, 2.15). Only
 * a published entry is available for matching (T-07).
 */
export async function selectCatalogCandidate(
  input: unknown,
): Promise<ActionResult<DraftActionData>> {
  return intakeAction(
    "selectCatalogCandidate",
    selectCatalogCandidateSchema,
    input,
    async (ctx, parsed) => {
      const { session, draft } = await openDraft(ctx, parsed.sessionId);
      let next: IntakeDraft;
      if (parsed.catalogEntryId === null) {
        next = selectDraftCandidate(draft, null, null);
      } else {
        const entry = await data.catalogEntries.get(ctx, parsed.catalogEntryId);
        if (entry === null || entry.status !== "published") {
          throw new ValidationError({
            userMessage: CATALOG_ENTRY_NOT_AVAILABLE,
            correlationId: ctx.correlationId,
            field: "catalogEntryId",
          });
        }
        next = selectDraftCandidate(
          draft,
          entry.id,
          entry.chemistry === "unknown" ? null : entry.chemistry,
        );
      }
      return {
        sessionId: session.id,
        draft: await persistDraft(ctx, session, next),
      };
    },
  );
}

/** A person enters the chemistry by hand — `human_entry`, the second source (Rule 2.10). */
export async function enterChemistry(
  input: unknown,
): Promise<ActionResult<DraftActionData>> {
  return intakeAction(
    "enterChemistry",
    enterChemistrySchema,
    input,
    async (ctx, parsed) => {
      const { session, draft } = await openDraft(ctx, parsed.sessionId);
      const next = enterDraftChemistry(draft, parsed.chemistry);
      return {
        sessionId: session.id,
        draft: await persistDraft(ctx, session, next),
      };
    },
  );
}

/**
 * §2.1.5 — reject the whole read. The extraction rows are retained and marked;
 * the session goes back to capture with its photos.
 */
export async function rejectExtraction(
  input: unknown,
): Promise<ActionResult<DraftActionData>> {
  return intakeAction(
    "rejectExtraction",
    sessionIdSchema,
    input,
    async (ctx, parsed) => {
      const { session, draft } = await openDraft(ctx, parsed.sessionId);
      const next = markDraftExtractionRejected(draft);
      const updated = await data.intakeSessions.update(ctx, session.id, {
        status: "open",
        currentStep: "capture",
        draft: next,
      });
      // TODO(T-43): rejecting a whole read is a person's act on the extraction
      // and Rule 12.1 audits it, but AUDIT_EVENT_TYPES carries no
      // `label_extraction.rejected` value and TAXONOMY.md §1.1 forbids
      // inventing one. Proposed value `label_extraction.rejected`.
      return { sessionId: session.id, draft: updated.draft ?? next };
    },
  );
}

/**
 * Save the intake to `/review` and leave (§2.1.4). The record is pending
 * review, the reason codes the gate wrote stay, and the save is a person's act
 * routing the record — `battery_record.routed_to_review` with a stated reason.
 */
export async function saveToReviewQueue(
  input: unknown,
): Promise<
  ActionResult<{ readonly sessionId: Uuid; readonly batteryRecordId: Uuid }>
> {
  return intakeAction(
    "saveToReviewQueue",
    sessionIdSchema,
    input,
    async (ctx, parsed, attribution) => {
      const { session, record } = await loadOpenIntake(ctx, parsed.sessionId);
      const at = now();
      if (record.status !== "pending_review") {
        await data.batteryRecords.update(ctx, record.id, {
          status: "pending_review",
        });
      }
      await data.intakeSessions.update(ctx, session.id, {
        isReviewRequired: true,
      });
      await data.auditEvents.write(
        ctx,
        userEvent(ctx, {
          eventType: "battery_record.routed_to_review",
          entityTable: "battery_record",
          entityId: record.id,
          at,
          beforeState: { status: record.status },
          afterState: {
            status: "pending_review",
            reasonCodes: [...(session.reviewReasonCodes ?? [])],
          },
          changedFields: record.status === "pending_review" ? null : ["status"],
          reason: REASON_SAVED_TO_QUEUE,
          attribution,
        }),
      );
      return { sessionId: session.id, batteryRecordId: record.id };
    },
  );
}

/** Leave the intake unfinished (T-08 `abandoned`, T-52 `session_abandoned`). The record stays a draft. */
export async function abandonIntakeSession(
  input: unknown,
): Promise<ActionResult<{ readonly sessionId: Uuid }>> {
  return intakeAction(
    "abandonIntakeSession",
    abandonIntakeSessionSchema,
    input,
    async (ctx, parsed) => {
      const { session } = await loadOpenIntake(ctx, parsed.sessionId);
      const at = now();
      // T-52 `session_abandoned` — the one reason code this action supplies.
      const abandoned: ReviewReasonCode = "session_abandoned";
      const codes = new Set<string>(session.reviewReasonCodes ?? []);
      codes.add(abandoned);
      await data.intakeSessions.update(ctx, session.id, {
        status: "abandoned",
        abandonedAt: at,
        reviewReasonCodes: [...codes],
        reviewOutcome: parsed.reason,
      });
      // TODO(T-43): abandoning a session is a person's act and Rule 12.1
      // audits it, but AUDIT_EVENT_TYPES carries no `intake_session.abandoned`
      // value and TAXONOMY.md §1.1 forbids inventing one. The stated reason is
      // kept on `intake_session.review_outcome` meanwhile.
      return { sessionId: session.id };
    },
  );
}

/**
 * Void the record with a stated reason (Rule 2.23 — one of the two ways a
 * record leaves the queue). The record is retained as `voided`; the session
 * closes.
 */
export async function voidIntakeSession(
  input: unknown,
): Promise<
  ActionResult<{ readonly sessionId: Uuid; readonly batteryRecordId: Uuid }>
> {
  return intakeAction(
    "voidIntakeSession",
    voidIntakeSessionSchema,
    input,
    async (ctx, parsed, attribution) => {
      const { session, record } = await loadOpenIntake(ctx, parsed.sessionId);
      const at = now();
      await data.batteryRecords.update(ctx, record.id, { status: "voided" });
      await data.intakeSessions.update(ctx, session.id, {
        status: "abandoned",
        abandonedAt: at,
        reviewedBy: ctx.userId,
        reviewedAt: at,
        reviewOutcome: "voided",
      });
      await data.auditEvents.write(
        ctx,
        userEvent(ctx, {
          eventType: "battery_record.status_changed",
          entityTable: "battery_record",
          entityId: record.id,
          at,
          beforeState: { status: record.status },
          afterState: { status: "voided" },
          changedFields: ["status"],
          reason: parsed.reason,
          attribution,
        }),
      );
      return { sessionId: session.id, batteryRecordId: record.id };
    },
  );
}

// --- §3.6 step 3 · condition, charge, provenance -----------------------------------------------

/** Record the findings a person observed (T-29, T-30). `validateFindings` gates the reducer. */
export async function setCondition(
  input: unknown,
): Promise<ActionResult<DraftActionData>> {
  return intakeAction(
    "setCondition",
    setConditionSchema,
    input,
    async (ctx, parsed) => {
      const { session, draft } = await openDraft(ctx, parsed.sessionId);
      const validation = validateFindings(parsed.findingTypes);
      if (!validation.ok) {
        throw new ValidationError({
          userMessage: findingsRefused(validation),
          correlationId: ctx.correlationId,
          field: "findingTypes",
        });
      }
      const next = setDraftCondition(
        draft,
        parsed.findingTypes,
        null,
        parsed.isDefective,
      );
      return {
        sessionId: session.id,
        draft: await persistDraft(ctx, session, next),
      };
    },
  );
}

/** Confirm the recorded findings (Rule 6.2) — the third attributable confirmation. */
export async function confirmCondition(
  input: unknown,
): Promise<ActionResult<DraftActionData>> {
  return intakeAction(
    "confirmCondition",
    sessionIdSchema,
    input,
    async (ctx, parsed) => {
      const { session, draft } = await openDraft(ctx, parsed.sessionId);
      if (draft.condition === null) {
        throw new ValidationError({
          userMessage: CONDITION_NOT_RECORDED,
          correlationId: ctx.correlationId,
          field: "findingTypes",
        });
      }
      const validation = validateFindings(draft.condition.findingTypes);
      if (!validation.ok) {
        throw new ValidationError({
          userMessage: findingsRefused(validation),
          correlationId: ctx.correlationId,
          field: "findingTypes",
        });
      }
      const next = confirmDraftCondition(draft, actor(ctx, now()));
      return {
        sessionId: session.id,
        draft: await persistDraft(ctx, session, next),
      };
    },
  );
}

export async function setStateOfCharge(
  input: unknown,
): Promise<ActionResult<DraftActionData>> {
  return intakeAction(
    "setStateOfCharge",
    setStateOfChargeSchema,
    input,
    async (ctx, parsed) => {
      const { session, draft } = await openDraft(ctx, parsed.sessionId);
      const next = setDraftStateOfCharge(draft, {
        band: parsed.band,
        percent: parsed.percent,
        source: parsed.source,
      });
      return {
        sessionId: session.id,
        draft: await persistDraft(ctx, session, next),
      };
    },
  );
}

/** Where the battery came from, as told to the handler — captured, never verified in B1a (Rule 2.30). */
export async function setSourceDevice(
  input: unknown,
): Promise<ActionResult<DraftActionData>> {
  return intakeAction(
    "setSourceDevice",
    setSourceDeviceSchema,
    input,
    async (ctx, parsed) => {
      const { session, draft } = await openDraft(ctx, parsed.sessionId);
      const device = parsed.sourceDevice;
      const next = setDraftSourceDevice(
        draft,
        device === null
          ? null
          : {
              type: device.type ?? null,
              identifier: device.identifier ?? null,
              make: device.make ?? null,
              model: device.model ?? null,
              modelYear: device.modelYear ?? null,
              provenanceSourceType: device.provenanceSourceType,
            },
      );
      return {
        sessionId: session.id,
        draft: await persistDraft(ctx, session, next),
      };
    },
  );
}

/** A manufacture date a person entered. A decode never overrides it (Rule 2.24). */
export async function enterManufacturedOn(
  input: unknown,
): Promise<ActionResult<DraftActionData>> {
  return intakeAction(
    "enterManufacturedOn",
    enterManufacturedOnSchema,
    input,
    async (ctx, parsed) => {
      const { session, draft } = await openDraft(ctx, parsed.sessionId);
      const next = setDraftManufacturedOn(draft, parsed.manufacturedOn);
      return {
        sessionId: session.id,
        draft: await persistDraft(ctx, session, next),
      };
    },
  );
}

// --- §3.6 step 3 · placement ---------------------------------------------------------------------

/**
 * Choose the container, or none. A container that is not open is refused
 * with the stated reason now (Rule 4.16); the segregation class is checked
 * against the classification at commit, where the class is decided.
 */
export async function choosePlacement(
  input: unknown,
): Promise<ActionResult<DraftActionData>> {
  return intakeAction(
    "choosePlacement",
    choosePlacementSchema,
    input,
    async (ctx, parsed) => {
      const { session, draft } = await openDraft(ctx, parsed.sessionId);
      if (parsed.containerId !== null) {
        const container = await data.containers.get(ctx, parsed.containerId);
        if (container === null) {
          throw new NotFoundError({
            userMessage: CONTAINER_NOT_FOUND,
            correlationId: ctx.correlationId,
            context: { containerId: parsed.containerId },
          });
        }
        if (container.status !== "open") {
          throw new ValidationError({
            userMessage:
              container.status === "overdue"
                ? "This container is overdue and accepts no new items. Ship its contents or record a remediation."
                : "This container is not accepting items.",
            correlationId: ctx.correlationId,
            field: "containerId",
            context: { status: container.status },
          });
        }
      }
      const next = setDraftPlacement(draft, parsed.containerId);
      return {
        sessionId: session.id,
        draft: await persistDraft(ctx, session, next),
      };
    },
  );
}

/**
 * E-2 — no container of the right class exists, so make one inline. Its type
 * is the class this record needs, decided from the classification and the
 * assessed condition; the organization's zone is the site's default
 * (Rule 4.29). The draft then names it.
 */
export async function createContainerForIntake(
  input: unknown,
): Promise<ActionResult<DraftActionData & { readonly containerId: Uuid }>> {
  return intakeAction(
    "createContainerForIntake",
    createContainerForIntakeSchema,
    input,
    async (ctx, parsed) => {
      const { session, record, draft } = await openDraft(ctx, parsed.sessionId);
      const organization = await data.organizations.get(
        ctx,
        ctx.organizationId,
      );
      if (organization === null) {
        throw new DataIntegrityError({
          userMessage: INTAKE_HAS_NO_RECORD,
          correlationId: ctx.correlationId,
        });
      }
      const containers = await data.containers.list(ctx, { limit: 100 });
      const entry =
        draft.selectedCatalogEntryId === null
          ? null
          : await data.catalogEntries.get(ctx, draft.selectedCatalogEntryId);
      const rules = await resolveIntakeRules(ctx, {
        organization,
        containers: containers.items,
        container: null,
        intakeStartedAt: session.startedAt,
        applicationClass: entry?.applicationClass ?? record.applicationClass,
      });
      const determination = determinationFor(draft);
      const classification = previewClassification(
        {
          chemistry: draft.chemistry,
          chemistryConfirmed: draft.fields.some(
            (field) =>
              field.fieldCode === "chemistry_code" &&
              field.status === "confirmed",
          ),
          applicationClass: entry?.applicationClass ?? record.applicationClass,
          ddrFlags: determination?.ddrFlags ?? [],
        },
        rules,
        organization,
      );
      const required =
        classification.kind === "decided" && determination !== null
          ? requiredContainerType(classification.outcome.result, {
              ddrFlags: determination.ddrFlags,
              assessmentStatus: determination.assessmentStatus,
            })
          : null;
      if (required === null) {
        throw new ValidationError({
          userMessage: CONTAINER_NEEDS_CLASSIFICATION,
          correlationId: ctx.correlationId,
        });
      }

      const container = await data.containers.create(ctx, {
        containerType: required,
        lotId: null,
        shipmentId: null,
        capacityKg: null,
        capacityVolumeM3: null,
        siteAddress: null,
        siteTimeZone: organization.timeZone,
        storageLocation: parsed.storageLocation,
        status: "open",
        sealedAt: null,
        closedAt: null,
      });
      // TODO(T-43): creating a container is an audited act (Rule 12.1) and
      // AUDIT_EVENT_TYPES carries only `container.status_changed`, which a
      // creation is not. TAXONOMY.md §1.1 forbids inventing one; proposed
      // value `container.created`.

      const next = setDraftPlacement(draft, container.id);
      return {
        sessionId: session.id,
        draft: await persistDraft(ctx, session, next),
        containerId: container.id,
      };
    },
  );
}

/**
 * E-5 — propose a catalog entry for a product the catalog does not describe.
 * It lands as `proposed` and is not available for matching until published
 * (T-07), so the battery in hand is still identified by hand.
 */
export async function proposeCatalogEntry(
  input: unknown,
): Promise<
  ActionResult<{ readonly sessionId: Uuid; readonly catalogEntryId: Uuid }>
> {
  return intakeAction(
    "proposeCatalogEntry",
    proposeCatalogEntrySchema,
    input,
    async (ctx, parsed) => {
      const { session } = await loadOpenIntake(ctx, parsed.sessionId);
      const entry = await data.catalogEntries.create(ctx, {
        organizationId: ctx.organizationId,
        manufacturerName: parsed.manufacturerName,
        brandName: null,
        modelName: parsed.modelName ?? null,
        partNumber: parsed.partNumber ?? null,
        gtin: null,
        applicationClass: parsed.applicationClass,
        removability: "unknown",
        chemistry: parsed.chemistry,
        cellFormFactor: null,
        nominalVoltageV: parsed.nominalVoltageV ?? null,
        ratedCapacityAh: parsed.ratedCapacityAh ?? null,
        ratedEnergyWh: parsed.ratedEnergyWh ?? null,
        massKg: null,
        unIdentifier: null,
        properShippingName: null,
        hazardClass: null,
        packingGroup: "not_applicable",
        un383SummaryUrl: null,
        labelTextPatterns: null,
        dateCodeFormatKey: null,
        // T-61 — a tenant's proposal from the intake floor.
        sourceType: "handler_proposed",
        sourceUrl: null,
        status: "proposed",
      });
      // TODO(T-43): a catalog proposal is an audited act (Rule 12.1) and
      // AUDIT_EVENT_TYPES carries no `catalog_entry.proposed` value —
      // `catalog_entry.matched` is the match step's, not a proposal's.
      // TAXONOMY.md §1.1 forbids inventing one.
      return { sessionId: session.id, catalogEntryId: entry.id };
    },
  );
}

// --- §3.6 · the stepper --------------------------------------------------------------------------

/**
 * Move the session's durable step forward (T-53). Never ahead of what the
 * pipeline has produced: `confirm_and_place` opens only once the review is
 * complete (§2.1.4), and `extraction_review` only once a read exists.
 * Revisiting an earlier step is a URL matter and changes nothing here.
 */
export async function advanceToStep(
  input: unknown,
): Promise<
  ActionResult<{ readonly sessionId: Uuid; readonly step: IntakeStep }>
> {
  return intakeAction(
    "advanceToStep",
    advanceToStepSchema,
    input,
    async (ctx, parsed) => {
      const { session, draft } = await openDraft(ctx, parsed.sessionId);
      const current = resolveIntakeStep(session);
      const requested: IntakeStep = parsed.step;

      if (canOpenStep(session, requested)) {
        return { sessionId: session.id, step: current };
      }
      if (stepIndex(requested) !== stepIndex(current) + 1) {
        throw new ValidationError({
          userMessage: STEP_NOT_OPEN,
          correlationId: ctx.correlationId,
          field: "step",
        });
      }
      if (
        requested === "extraction_review" &&
        session.status !== "awaiting_confirmation"
      ) {
        throw new ValidationError({
          userMessage: STEP_NOT_OPEN,
          correlationId: ctx.correlationId,
          field: "step",
        });
      }
      if (requested === "confirm_and_place") {
        const outstanding = canContinueFromReview(
          commitFieldStates(draft),
          false,
        );
        if (outstanding.length > 0) {
          throw new ValidationError({
            userMessage: reviewIncomplete(outstanding),
            correlationId: ctx.correlationId,
            field: "step",
          });
        }
      }
      await data.intakeSessions.update(ctx, session.id, {
        currentStep: requested,
      });
      return { sessionId: session.id, step: requested };
    },
  );
}

// --- 7.4 · the commit ----------------------------------------------------------------------------

/**
 * Confirm and log the battery — `TECHNICAL_SPEC.md` §11.1 step 6.
 *
 * Everything is recomputed from the draft on the server and written as one
 * `IntakeConfirmation`; the adapter refuses without the three attributable
 * confirmations at any confidence band (Rules 2.15, 2.21). On success the
 * caller is sent to the record, outside the `try`, exactly as `signIn`
 * redirects — a `catch` that turned the redirect into a failure would leave
 * the person on a form that has already succeeded.
 */
export async function confirmIntake(
  input: unknown,
): Promise<ActionResult<never>> {
  const result = await intakeAction(
    "confirmIntake",
    confirmIntakeSchema,
    input,
    async (ctx, parsed, attribution) => {
      const { session, record, draft, extractions } = await openDraft(
        ctx,
        parsed.sessionId,
      );
      const at = now();

      const [organization, containersPage, photosPage] = await Promise.all([
        data.organizations.get(ctx, ctx.organizationId),
        data.containers.list(ctx, { limit: 100 }),
        data.intakePhotos.list(ctx, { intakeSessionId: session.id, limit: 50 }),
      ]);
      if (organization === null) {
        throw new DataIntegrityError({
          userMessage: INTAKE_HAS_NO_RECORD,
          correlationId: ctx.correlationId,
        });
      }

      const catalogEntry =
        draft.selectedCatalogEntryId === null
          ? null
          : await data.catalogEntries.get(ctx, draft.selectedCatalogEntryId);
      if (draft.selectedCatalogEntryId !== null && catalogEntry === null) {
        throw new ConflictError({
          userMessage: CATALOG_ENTRY_NOT_AVAILABLE,
          correlationId: ctx.correlationId,
        });
      }

      const container =
        draft.containerId === null
          ? null
          : (containersPage.items.find((row) => row.id === draft.containerId) ??
            null);
      if (draft.containerId !== null && container === null) {
        throw new NotFoundError({
          userMessage: CONTAINER_NOT_FOUND,
          correlationId: ctx.correlationId,
          context: { containerId: draft.containerId },
        });
      }
      const runningClock =
        container === null
          ? null
          : ((
              await data.storageClocks.list(ctx, {
                containerId: container.id,
                isRunning: true,
                limit: 5,
              })
            ).items[0] ?? null);

      const rules = await resolveIntakeRules(ctx, {
        organization,
        containers: containersPage.items,
        container,
        intakeStartedAt: session.startedAt,
        applicationClass:
          catalogEntry?.applicationClass ?? record.applicationClass,
      });

      const dateCodeRow = latestRunRows(
        extractions,
        draft.extractionRunId,
      ).find((row) => row.fieldCode === "date_code");
      const damagePhoto = photosPage.items.find(
        (photo) => photo.photoType === "damage",
      );

      const built = buildIntakeConfirmation({
        ctx,
        session,
        record,
        draft,
        catalogEntry,
        container,
        runningClock,
        rules,
        organization,
        dateCodeExtractionId: dateCodeRow?.id ?? null,
        damagePhotoId: damagePhoto?.id ?? null,
        today: civilDateInZone(at, rules.site.timeZone),
        at,
        attribution,
      });
      if (!built.ok) {
        throw new ValidationError({
          userMessage: built.message,
          correlationId: ctx.correlationId,
          context: { outstanding: built.outstanding.map((item) => item.kind) },
        });
      }

      const committed = await data.intakeSessions.commitConfirmation(
        ctx,
        built.confirmation,
      );
      revalidatePath("/batteries");
      revalidatePath(`/batteries/${committed.id}`);
      return {
        batteryRecordId: committed.id,
        containerId: built.containerId,
      };
    },
  );

  if (!result.ok) return result;
  redirect(
    `/batteries/${result.data.batteryRecordId}?logged=1&container=${result.data.containerId ?? ""}`,
  );
}
