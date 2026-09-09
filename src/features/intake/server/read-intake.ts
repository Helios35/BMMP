import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import type { FieldSource } from "@/components/provenance/field-source-badge";
import type { ClassificationResult } from "@/domain/classification/waste-stream";
import {
  assessDamage,
  validateFindings,
  type DamageDetermination,
} from "@/domain/condition/damage";
import {
  canContinueFromReview,
  outstandingCommitItems,
  type OutstandingItem,
} from "@/domain/intake/commit-gate";
import {
  commitFieldStates,
  seedDraftFromExtraction,
} from "@/domain/intake/draft";
import { resolveIntakeStep } from "@/domain/intake/steps";
import {
  admitToContainer,
  requiredContainerType,
  startStorageClock,
  type ClockStart,
  type PlacementAdmission,
} from "@/domain/storage/placement";
import { CHEMISTRIES, CHEMISTRY_LABELS } from "@/domain/taxonomy/chemistry";
import type { ContainerType } from "@/domain/taxonomy/container-type";
import { DATE_CODE_PRECISION_LABELS } from "@/domain/taxonomy/date-code-precision";
import type { IntakeStep } from "@/domain/taxonomy/intake-step";
import {
  LABEL_FIELD_CODE_LABELS,
  type LabelFieldCode,
} from "@/domain/taxonomy/label-field-code";
import { optionsFor } from "@/domain/taxonomy/lookup";
import { resolveUserNames } from "@/features/battery-record/user-names";
import { ConflictError, DataIntegrityError, NotFoundError } from "@/lib/errors";
import type { BatteryRecord } from "@/types/battery-record";
import type { CatalogEntry } from "@/types/catalog";
import type { IsoDate, IsoTimestamp, Uuid } from "@/types/common";
import type {
  DraftCandidate,
  DraftFieldState,
  DraftFieldStatus,
  IntakeDraft,
  IntakePhoto,
  IntakeSession,
  LabelExtraction,
} from "@/types/intake";
import type { Jurisdiction } from "@/types/rules-as-data";
import type { Container, StorageClock } from "@/types/storage";
import type { Organization } from "@/types/tenancy";

import { INTAKE_CLOSED, INTAKE_HAS_NO_RECORD, INTAKE_NOT_FOUND } from "../copy";
import {
  previewClassification,
  resolveIntakeRules,
  type IntakeRuleContext,
} from "./classification-preview";
import { readGateConfiguration } from "./intake-pipeline";

/**
 * Everything a step of `/batteries/new` renders, read once through `src/data`
 * — `UX_SPEC.md` §2.1, §3.6; `SITE_ARCHITECTURE.md` §1.3.
 *
 * **Nothing reaches past `src/data`** (D-16), and every value returned is
 * plain serialisable data — no functions, no Maps, no class instances — so a
 * Server Component can hand the whole view to a client component in one prop.
 *
 * The draft is the authority for what a person has done. Where a session
 * carries none — every fixture session, and any session read before its
 * first extraction — the field state is seeded from the latest extraction
 * run's rows, unconfirmed, exactly as the pipeline would have seeded it. That
 * seed is not persisted by a read; the first action on the session persists
 * whatever it produces.
 */

/** Bounded reads, well beyond anything one intake or one organization holds in B1a. */
const PHOTO_LIMIT = 50;
const EXTRACTION_LIMIT = 200;
const CONTAINER_LIMIT = 100;
const CLOCK_LIMIT = 100;
const OPEN_SESSION_LIMIT = 20;

/** Assessed condition is confirmed on step 3 as a condition, never typed on the card (Rule 6.2). */
const CONDITION_NOTE = "Confirmed at step 3";

export interface LoadedIntake {
  readonly session: IntakeSession;
  readonly record: BatteryRecord;
}

/** The session and its draft record, refusing an absent, another tenant's or a closed one. */
export async function loadOpenIntake(
  ctx: RequestContext,
  sessionId: Uuid,
): Promise<LoadedIntake> {
  const loaded = await loadIntake(ctx, sessionId);
  if (
    loaded.session.status === "completed" ||
    loaded.session.status === "abandoned"
  ) {
    throw new ConflictError({
      userMessage: INTAKE_CLOSED,
      correlationId: ctx.correlationId,
      context: { intakeSessionId: sessionId, status: loaded.session.status },
    });
  }
  return loaded;
}

/** The session and its record, whatever the session's status. */
export async function loadIntake(
  ctx: RequestContext,
  sessionId: Uuid,
): Promise<LoadedIntake> {
  const session = await data.intakeSessions.get(ctx, sessionId);
  if (session === null) {
    throw new NotFoundError({
      userMessage: INTAKE_NOT_FOUND,
      correlationId: ctx.correlationId,
      context: { intakeSessionId: sessionId },
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

/** The rows of the run the draft names, or of the newest run when it names none. */
export function latestRunRows(
  extractions: readonly LabelExtraction[],
  runId: Uuid | null,
): readonly LabelExtraction[] {
  const wanted =
    runId ??
    [...extractions].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
      ?.extractionRunId ??
    null;
  return wanted === null
    ? []
    : extractions.filter((row) => row.extractionRunId === wanted);
}

/**
 * The draft as the session holds it, or one seeded from the extraction rows
 * where the session holds none (§1 of the design: absent reads as null).
 */
export async function draftForSession(
  ctx: RequestContext,
  session: IntakeSession,
): Promise<{ draft: IntakeDraft; extractions: readonly LabelExtraction[] }> {
  const extractions = await data.labelExtractions.list(ctx, {
    intakeSessionId: session.id,
    limit: EXTRACTION_LIMIT,
  });
  const existing = session.draft ?? null;
  if (existing !== null)
    return { draft: existing, extractions: extractions.items };

  const rows = latestRunRows(extractions.items, null);
  const seeded = seedDraftFromExtraction(
    rows.map((row) => ({
      fieldCode: row.fieldCode,
      fieldValue: row.fieldValue,
      confidenceBand: row.confidenceBand,
      isHardGated: row.isHardGated,
      rawText: row.rawText,
    })),
    [],
    null,
    null,
  );
  const first = rows[0];
  return {
    draft: {
      ...seeded,
      labelCropId: first?.intakePhotoId ?? null,
      extractionRunId: first?.extractionRunId ?? null,
    },
    extractions: extractions.items,
  };
}

// --- the review card's field views ------------------------------------------------------

export type ReviewFieldInput =
  | { readonly kind: "text" }
  | { readonly kind: "mono" }
  | {
      readonly kind: "select";
      readonly options: readonly {
        readonly value: string;
        readonly label: string;
      }[];
    }
  | { readonly kind: "tristate" }
  | { readonly kind: "readonly"; readonly note: string };

/** One row of the extraction review card — the shape `ExtractionReviewCard` takes. */
export interface ReviewFieldView {
  readonly fieldCode: LabelFieldCode;
  readonly label: string;
  readonly value: string | null;
  readonly originalValue: string | null;
  readonly rawText: string | null;
  readonly source: FieldSource;
  readonly confidenceBand: DraftFieldState["confidenceBand"];
  /** The provider's raw score, for `ConfidenceBandDisplay`'s audit tooltip — never rendered as a number. */
  readonly rawConfidence: string | null;
  readonly isHardGated: boolean;
  readonly isRequired: boolean;
  readonly status: DraftFieldStatus;
  readonly confirmedByName: string | null;
  readonly confirmedAt: IsoTimestamp | null;
  readonly input: ReviewFieldInput;
  readonly decoded?: {
    readonly date: IsoDate | null;
    readonly precisionLabel: string | null;
    readonly undecodable: boolean;
  };
}

/** Chemistry a person may enter — every T-01 value but `unknown`, which is the absence of one. */
const CHEMISTRY_OPTIONS = optionsFor(CHEMISTRIES, CHEMISTRY_LABELS).filter(
  (option) => option.value !== "unknown",
);

function inputFor(fieldCode: LabelFieldCode): ReviewFieldInput {
  switch (fieldCode) {
    case "model":
    case "serial_number":
    case "date_code":
      return { kind: "mono" };
    case "chemistry_code":
      return { kind: "select", options: CHEMISTRY_OPTIONS };
    case "transport_test_marking":
      return { kind: "tristate" };
    case "assessed_condition":
      return { kind: "readonly", note: CONDITION_NOTE };
    default:
      return { kind: "text" };
  }
}

/**
 * The draft's fields as the card renders them, in T-09 order.
 *
 * `names` resolves a confirming user id to a display name; an id that will
 * not resolve renders no name rather than an invented one. `extractions`
 * supplies the raw score per field from the run the draft came from, for the
 * audit tooltip; without it the score is simply absent.
 */
export function toReviewFieldViews(
  draft: IntakeDraft,
  names: ReadonlyMap<Uuid, string>,
  extractions: readonly LabelExtraction[] = [],
): readonly ReviewFieldView[] {
  const required = new Map(
    commitFieldStates(draft).map((field) => [
      field.fieldCode,
      field.isRequired,
    ]),
  );
  const runRows = latestRunRows(extractions, draft.extractionRunId);

  return draft.fields.map((field) => {
    const row = runRows.find((entry) => entry.fieldCode === field.fieldCode);
    const view: ReviewFieldView = {
      fieldCode: field.fieldCode,
      label: LABEL_FIELD_CODE_LABELS[field.fieldCode],
      value: field.value,
      originalValue: field.originalValue,
      rawText: field.rawText,
      source: field.source,
      confidenceBand: field.confidenceBand,
      rawConfidence: row?.rawConfidence ?? null,
      isHardGated: field.isHardGated,
      isRequired: required.get(field.fieldCode) ?? false,
      status: field.status,
      confirmedByName:
        field.confirmedBy === null
          ? null
          : (names.get(field.confirmedBy) ?? null),
      confirmedAt: field.confirmedAt,
      input: inputFor(field.fieldCode),
    };
    if (field.fieldCode !== "date_code") return view;
    const decode = draft.dateCodeDecode;
    return {
      ...view,
      decoded: {
        date: decode?.decodedManufacturedOn ?? null,
        precisionLabel:
          decode?.decodedPrecision === null ||
          decode?.decodedPrecision === undefined
            ? null
            : DATE_CODE_PRECISION_LABELS[decode.decodedPrecision],
        undecodable: decode === null || decode.decodedManufacturedOn === null,
      },
    };
  });
}

// --- the step view --------------------------------------------------------------------------

export interface CandidateView {
  readonly candidate: DraftCandidate;
  /** Null where the entry is no longer visible to this organization. */
  readonly entry: CatalogEntry | null;
}

export interface ContainerChoiceView {
  readonly container: Container;
  readonly clock: StorageClock | null;
  /** Why this row may or may not take the record — rendered, never hidden (Rules 4.16, 4.28). */
  readonly admission: PlacementAdmission;
}

export interface PlacementPreview {
  /** Null while the classification is undetermined — T-23 gives such a record no container. */
  readonly requiredContainerType: ContainerType | null;
  readonly containers: readonly ContainerChoiceView[];
  readonly chosen: ContainerChoiceView | null;
  /** The clock the placement would start or join, from the rule in force; null without a container or a rule. */
  readonly clockStart: ClockStart | null;
}

export interface IntakeStepView {
  readonly session: IntakeSession;
  readonly record: BatteryRecord;
  readonly step: IntakeStep;
  readonly photos: readonly IntakePhoto[];
  readonly labelPhoto: IntakePhoto | null;
  readonly crop: IntakePhoto | null;
  readonly extractions: readonly LabelExtraction[];
  readonly draft: IntakeDraft;
  readonly fields: readonly ReviewFieldView[];
  readonly candidates: readonly CandidateView[];
  readonly selectedEntry: CatalogEntry | null;
  readonly decode: IntakeDraft["dateCodeDecode"];
  readonly configurationVersion: string;
  readonly organization: Organization;
  readonly site: IntakeRuleContext["site"];
  readonly jurisdiction: Jurisdiction | null;
  readonly rules: IntakeRuleContext;
  readonly determination: DamageDetermination | null;
  readonly classificationPreview: ClassificationResult;
  readonly placementPreview: PlacementPreview;
  /** Step 2 → 3. Empty means the person may continue. */
  readonly reviewOutstanding: readonly OutstandingItem[];
  /** Before **Confirm and log battery** may act. Empty means the commit may proceed. */
  readonly commitOutstanding: readonly OutstandingItem[];
  readonly viewer: { readonly userId: Uuid; readonly fullName: string | null };
}

/**
 * The determination step 3's findings imply, or null where none are
 * recorded or the recorded set is not one an assessment can carry.
 */
export function determinationFor(
  draft: IntakeDraft,
): DamageDetermination | null {
  if (draft.condition === null) return null;
  const validation = validateFindings(draft.condition.findingTypes);
  if (!validation.ok) return null;
  return assessDamage(draft.condition.findingTypes, {
    isDefective: draft.condition.isDefective,
  });
}

function chemistryConfirmed(draft: IntakeDraft): boolean {
  return draft.fields.some(
    (field) =>
      field.fieldCode === "chemistry_code" &&
      field.status === "confirmed" &&
      field.confirmedBy !== null,
  );
}

/** Read one step of an intake, or `null` where the session is absent or another tenant's. */
export async function readIntakeStepView(
  ctx: RequestContext,
  sessionId: Uuid,
): Promise<IntakeStepView | null> {
  const session = await data.intakeSessions.get(ctx, sessionId);
  if (session === null) return null;
  const { record } = await loadIntake(ctx, sessionId);

  const [photosPage, { draft, extractions }, configuration, organization] =
    await Promise.all([
      data.intakePhotos.list(ctx, {
        intakeSessionId: session.id,
        limit: PHOTO_LIMIT,
      }),
      draftForSession(ctx, session),
      readGateConfiguration(ctx, null),
      data.organizations.get(ctx, ctx.organizationId),
    ]);
  if (organization === null) {
    throw new DataIntegrityError({
      userMessage: INTAKE_HAS_NO_RECORD,
      correlationId: ctx.correlationId,
      context: { organizationId: ctx.organizationId },
    });
  }

  const photos = photosPage.items;
  const labelPhoto =
    photos.find((photo) => photo.id === draft.labelPhotoId) ??
    photos.find(
      (photo) =>
        photo.photoType === "label" && photo.parentIntakePhotoId === null,
    ) ??
    null;
  const crop =
    photos.find((photo) => photo.id === draft.labelCropId) ??
    photos.find((photo) => photo.photoType === "label_crop") ??
    null;

  const candidates: CandidateView[] = [];
  for (const candidate of draft.candidates) {
    candidates.push({
      candidate,
      entry: await data.catalogEntries.get(ctx, candidate.catalogEntryId),
    });
  }
  const selectedEntry =
    draft.selectedCatalogEntryId === null
      ? null
      : await data.catalogEntries.get(ctx, draft.selectedCatalogEntryId);

  const [containersPage, clocksPage] = await Promise.all([
    data.containers.list(ctx, { limit: CONTAINER_LIMIT }),
    data.storageClocks.list(ctx, { isRunning: true, limit: CLOCK_LIMIT }),
  ]);
  const containers = containersPage.items;
  const clockByContainer = new Map(
    clocksPage.items
      .filter((clock) => clock.containerId !== null)
      .map((clock) => [clock.containerId as Uuid, clock]),
  );
  const chosenContainer =
    containers.find((container) => container.id === draft.containerId) ?? null;

  const rules = await resolveIntakeRules(ctx, {
    organization,
    containers,
    container: chosenContainer,
    intakeStartedAt: session.startedAt,
    applicationClass:
      selectedEntry?.applicationClass ?? record.applicationClass,
  });

  const determination = determinationFor(draft);
  const classificationPreview = previewClassification(
    {
      chemistry: draft.chemistry,
      chemistryConfirmed: chemistryConfirmed(draft),
      applicationClass:
        selectedEntry?.applicationClass ?? record.applicationClass,
      ddrFlags: determination?.ddrFlags ?? [],
    },
    rules,
    organization,
  );

  const requiredType =
    classificationPreview.kind === "decided" && determination !== null
      ? requiredContainerType(classificationPreview.outcome.result, {
          ddrFlags: determination.ddrFlags,
          assessmentStatus: determination.assessmentStatus,
        })
      : null;
  const choices: ContainerChoiceView[] = containers.map((container) => ({
    container,
    clock: clockByContainer.get(container.id) ?? null,
    admission: admitToContainer(container, requiredType),
  }));
  const chosen =
    choices.find((choice) => choice.container.id === draft.containerId) ?? null;
  const clockStart =
    chosen !== null && rules.accumulation.kind === "resolved"
      ? startStorageClock(
          {
            placedAt: new Date().toISOString(),
            timeZone: chosen.container.siteTimeZone,
            existingClock:
              chosen.clock === null
                ? null
                : { clockStartAt: chosen.clock.clockStartAt },
          },
          rules.accumulation.rule,
        ).result
      : null;

  const fields = commitFieldStates(draft);
  const conditionConfirmed =
    draft.condition !== null && draft.condition.confirmedBy !== null;
  const names = await resolveUserNames(ctx, [
    ...draft.fields.map((field) => field.confirmedBy),
    draft.condition?.confirmedBy ?? null,
  ]);
  const viewer = await data.users.get(ctx, ctx.userId);

  return {
    session,
    record,
    step: resolveIntakeStep(session),
    photos,
    labelPhoto,
    crop,
    extractions,
    draft,
    fields: toReviewFieldViews(draft, names, extractions),
    candidates,
    selectedEntry,
    decode: draft.dateCodeDecode,
    configurationVersion: configuration.configurationVersion,
    organization,
    site: rules.site,
    jurisdiction: rules.jurisdiction,
    rules,
    determination,
    classificationPreview,
    placementPreview: {
      requiredContainerType: requiredType,
      containers: choices,
      chosen,
      clockStart,
    },
    reviewOutstanding: canContinueFromReview(fields, false),
    commitOutstanding: outstandingCommitItems({
      fields,
      conditionConfirmed,
      // Only roles holding `write` on `/batteries/new` reach this read, and
      // both of them confirm condition (Rule 6.2).
      ownsCondition: true,
      containerChosen: draft.containerId !== null,
      // The same inputs confirmation.ts hands the same function, so the card
      // and the server never disagree (commit-gate.ts). Placement is chosen,
      // never demanded, in B1a (build-notes b1a-02 §4).
      requiresContainer: false,
      isOffline: false,
      // EC-16 / Rule 3.10 — identification completes while classification
      // blocks: an unresolved classification never stands between a person
      // and logging the battery in their hands. The E-13 notice on this step
      // states the missing input and who supplies it.
      classificationBlocked: false,
    }),
    viewer: {
      userId: ctx.userId,
      fullName: viewer?.fullName ?? viewer?.email ?? null,
    },
  };
}

// --- the resume banner --------------------------------------------------------------------

export interface OpenIntakeSummary {
  readonly session: IntakeSession;
  readonly record: BatteryRecord | null;
  readonly step: IntakeStep;
  readonly startedAt: IsoTimestamp;
}

/** The caller's own unfinished intakes, newest first, for the resume banner (Flow A-a). */
export async function readOpenSessions(
  ctx: RequestContext,
): Promise<readonly OpenIntakeSummary[]> {
  const page = await data.intakeSessions.list(ctx, {
    startedBy: ctx.userId,
    isOpen: true,
    limit: OPEN_SESSION_LIMIT,
  });
  const summaries: OpenIntakeSummary[] = [];
  for (const session of page.items) {
    summaries.push({
      session,
      record:
        session.batteryRecordId === null
          ? null
          : await data.batteryRecords.get(ctx, session.batteryRecordId),
      step: resolveIntakeStep(session),
      startedAt: session.startedAt,
    });
  }
  return summaries;
}
