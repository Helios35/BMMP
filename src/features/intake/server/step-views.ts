import type {
  CatalogCandidateView,
  ReviewCardState,
} from "@/components/extraction-review";
import type { FieldSource } from "@/components/provenance/field-source-badge";
import type { CommitGateInput } from "@/domain/intake/commit-gate";
import { commitFieldStates } from "@/domain/intake/draft";
import type { ApplicationClass } from "@/domain/taxonomy/application-class";
import { CHEMISTRIES, CHEMISTRY_LABELS } from "@/domain/taxonomy/chemistry";
import {
  CONTAINER_TYPE_LABELS,
  CONTAINER_TYPES,
} from "@/domain/taxonomy/container-type";
import { INTAKE_PHOTO_TYPE_LABELS } from "@/domain/taxonomy/intake-photo-type";
import {
  HARD_GATED_LABEL_FIELD_CODES,
  LABEL_FIELD_CODE_LABELS,
  LABEL_FIELD_CODES,
  type LabelFieldCode,
} from "@/domain/taxonomy/label-field-code";
import { isTaxonomyValue, readTaxonomyValue } from "@/domain/taxonomy/lookup";
import { ROLE_LABELS } from "@/domain/taxonomy/role";
import { STORAGE_CLOCK_ALERT_BAND_LABELS } from "@/domain/taxonomy/storage-clock-alert-band";
import type {
  ClockPreview,
  SummaryField,
} from "@/features/intake/components/confirm-and-place-step";
import type { ContainerPickerRow } from "@/features/intake/components/container-picker";
import type {
  ReviewCardView,
  ReviewPlaceholderImage,
} from "@/features/intake/components/extraction-review-step";
import type { ExistingIntakePhoto } from "@/features/intake/components/photo-capture-step";
import type { IsoTimestamp } from "@/types/common";
import type { IntakePhoto } from "@/types/intake";

import {
  LABEL_READ_UNAVAILABLE,
  NO_ACCUMULATION_RULE_IN_FORCE,
  NO_CLASSIFICATION_RULE_IN_FORCE,
  NO_JURISDICTION_PROFILE,
} from "../copy";
import { latestRunRows, type IntakeStepView } from "./read-intake";

/**
 * From the step read to the props each step composition takes —
 * `UX_SPEC.md` §2.1, §2.13, §3.9.
 *
 * Pure functions over `IntakeStepView`, run by the route on the server so
 * the client components receive plain, serialisable props and nothing they
 * would have to derive. Everything here is a reading of what the server
 * already decided — an admission, a classification, a clock — put into the
 * words a component renders; no rule is evaluated here and no threshold is
 * read.
 *
 * Three things this module keeps true:
 *
 * - **A candidate's score is never a sentence.** `matchScore` is copied for
 *   the gate and the panel never renders it (Rule 2.19).
 * - **The match basis is stated from the field labels**, so *Matched on
 *   Manufacturer + Model / part number* can never say a field name the
 *   taxonomy does not.
 * - **Chemistry's badge is its draft source.** The field carries
 *   `matched_from_catalog` or `entered_by` and nothing here widens that
 *   (Rules 2.9, 2.10).
 */

/** The candidate view for the panel — only entries this organization can still see. */
function candidateViews(view: IntakeStepView): readonly CatalogCandidateView[] {
  return view.candidates.flatMap(({ candidate, entry }) => {
    if (entry === null) return [];
    const chemistry = readTaxonomyValue(
      CHEMISTRIES,
      CHEMISTRY_LABELS,
      entry.chemistry,
    );
    const specs: string[] = [];
    if (entry.nominalVoltageV !== null)
      specs.push(`${entry.nominalVoltageV} V`);
    if (entry.ratedCapacityAh !== null)
      specs.push(`${entry.ratedCapacityAh} Ah`);
    if (entry.ratedEnergyWh !== null) specs.push(`${entry.ratedEnergyWh} Wh`);
    const matchedOn = candidate.matchedOn.map((key) =>
      isTaxonomyValue(LABEL_FIELD_CODES, key)
        ? LABEL_FIELD_CODE_LABELS[key]
        : key,
    );
    return [
      {
        catalogEntryId: entry.id,
        title: [entry.manufacturerName, entry.modelName ?? entry.partNumber]
          .filter((part): part is string => part !== null)
          .join(" "),
        chemistryLabel: chemistry.recognised
          ? chemistry.label
          : chemistry.storedValue,
        specs,
        matchedOnLabel:
          matchedOn.length === 0 ? "the label" : matchedOn.join(" + "),
        matchScore: candidate.matchScore,
      },
    ];
  });
}

function isHardGated(fieldCode: LabelFieldCode): boolean {
  return (HARD_GATED_LABEL_FIELD_CODES as readonly LabelFieldCode[]).includes(
    fieldCode,
  );
}

/** §2.1.6 — which of the card's states the session is in. */
function cardState(view: IntakeStepView): {
  readonly state: Exclude<ReviewCardState, "disabled">;
  readonly errorMessage?: string;
} {
  if (view.session.status === "extracting") return { state: "loading" };
  if (view.session.status === "failed")
    return { state: "error", errorMessage: LABEL_READ_UNAVAILABLE };
  // The manual path (E-4, EC-14, D-20): the rows render for typing, each
  // *Not read*, rather than the no-read state that offers the path again.
  if (view.draft.manualEntry) return { state: "default" };
  const runRows = latestRunRows(view.extractions, view.draft.extractionRunId);
  const readAnything =
    runRows.some((row) => row.fieldValue !== null) ||
    view.draft.fields.some((field) => field.originalValue !== null);
  return readAnything ? { state: "default" } : { state: "empty" };
}

function photoImage(
  photo: IntakePhoto | null,
  alt: string,
): ReviewCardView["cropThumbnail"] {
  if (photo === null) return null;
  // The bytes are not served in B1a (`mock://`); the frame keeps the size.
  return { src: null, alt, width: photo.widthPx, height: photo.heightPx };
}

export function reviewCardView(view: IntakeStepView): ReviewCardView {
  const runRows = latestRunRows(view.extractions, view.draft.extractionRunId);
  // A draft that names no run came from no read (the manual path): no read
  // time, even where a failed run's rows are still on the session.
  const readAt =
    view.draft.extractionRunId === null
      ? null
      : (runRows
          .map((row) => row.respondedAt ?? row.createdAt)
          .sort()
          .at(-1) ?? null);
  const candidates = candidateViews(view);
  const fieldsBelowThreshold = view.draft.fields.filter(
    (field) =>
      // Assessed condition is never proposed by a read (Rule 6.2).
      field.fieldCode !== "assessed_condition" &&
      field.confidenceBand !== null &&
      field.confidenceBand !== "high",
  ).length;
  const bulkEligible = view.fields.filter(
    (field) =>
      field.status === "pending" &&
      field.confidenceBand === "high" &&
      field.value !== null &&
      !field.isHardGated &&
      !isHardGated(field.fieldCode),
  ).length;

  return {
    sessionId: view.session.id,
    readAt,
    timeZone: view.site.timeZone,
    ...cardState(view),
    gate: {
      isReviewRequired: view.session.isReviewRequired,
      fieldsBelowThreshold,
      reasonCodes: view.session.reviewReasonCodes ?? [],
    },
    fields: view.fields,
    candidates,
    selectedCatalogEntryId: view.draft.selectedCatalogEntryId,
    catalogMatchState:
      view.session.status === "extracting"
        ? "loading"
        : candidates.length === 0
          ? "empty"
          : "default",
    // E-5 — no candidate at all: the record can be logged and cannot ship.
    cannotShipNote: candidates.length === 0,
    cropThumbnail: photoImage(view.crop, INTAKE_PHOTO_TYPE_LABELS.label_crop),
    originalPhoto: photoImage(view.labelPhoto, INTAKE_PHOTO_TYPE_LABELS.label),
    // Only roles holding `write` reach this route, and both confirm condition.
    ownsCondition: true,
    // §2.1.4(4) — three or more High rows.
    bulkConfirmAvailable: bulkEligible >= 3,
    loadingSince:
      view.session.status === "extracting" ? view.session.updatedAt : null,
  };
}

export function reviewPlaceholders(view: IntakeStepView): {
  readonly crop: ReviewPlaceholderImage | null;
  readonly original: ReviewPlaceholderImage | null;
} {
  const image = (
    photo: IntakePhoto | null,
    label: string,
  ): ReviewPlaceholderImage | null =>
    photo === null
      ? null
      : { label, width: photo.widthPx, height: photo.heightPx };
  return {
    crop: image(view.crop, INTAKE_PHOTO_TYPE_LABELS.label_crop),
    original: image(view.labelPhoto, INTAKE_PHOTO_TYPE_LABELS.label),
  };
}

function fieldValue(
  view: IntakeStepView,
  fieldCode: LabelFieldCode,
): string | null {
  const value = view.draft.fields.find(
    (field) => field.fieldCode === fieldCode,
  )?.value;
  return value === undefined || value === null || value.trim() === ""
    ? null
    : value;
}

/** What E-5's proposal would carry, or `null` until the draft holds both halves it needs. */
export function catalogProposal(view: IntakeStepView): {
  readonly manufacturerName: string;
  readonly modelName: string | null;
  readonly partNumber: string | null;
  readonly chemistry: Exclude<
    NonNullable<IntakeStepView["draft"]["chemistry"]>,
    "unknown"
  >;
  readonly applicationClass: ApplicationClass;
} | null {
  const manufacturerName = fieldValue(view, "manufacturer");
  const chemistry = view.draft.chemistry;
  if (
    manufacturerName === null ||
    chemistry === null ||
    chemistry === "unknown"
  )
    return null;
  return {
    manufacturerName,
    modelName: fieldValue(view, "model"),
    partNumber: null,
    chemistry,
    applicationClass:
      view.selectedEntry?.applicationClass ?? view.record.applicationClass,
  };
}

/** The read manufacturer and model, for **Search the catalog**. */
export function catalogQuery(view: IntakeStepView): string | null {
  const parts = [
    fieldValue(view, "manufacturer"),
    fieldValue(view, "model"),
  ].filter((part): part is string => part !== null);
  return parts.length === 0 ? null : parts.join(" ");
}

/** The stored top-level photos, as the capture step lists them on a resumed session. */
export function existingPhotos(
  view: IntakeStepView,
): readonly ExistingIntakePhoto[] {
  return view.photos
    .filter((photo) => photo.parentIntakePhotoId === null)
    .map((photo) => ({
      id: photo.id,
      photoType: photo.photoType,
      width: photo.widthPx,
      height: photo.heightPx,
      state: "sent" as const,
    }));
}

/* ------------------------------------------------------------- step 3 */

/** Who may create a container, for a role that cannot — composed from the role labels. */
export const WHO_CAN_CREATE_CONTAINER = `A ${ROLE_LABELS.compliance_handler} or a ${ROLE_LABELS.facility_manager} can create one.`;

export function containerRows(
  view: IntakeStepView,
): readonly ContainerPickerRow[] {
  return view.placementPreview.containers.map(
    ({ container, clock, admission }) => {
      const type = readTaxonomyValue(
        CONTAINER_TYPES,
        CONTAINER_TYPE_LABELS,
        container.containerType,
      );
      const mass = container.currentNetMassKg;
      // Already composed here; the picker adds no arithmetic. The unit is
      // the column's (`current_net_mass_kg`), and the digits are the row's.
      const fillText =
        mass === null
          ? null
          : container.capacityKg === null
            ? `${mass} kg`
            : `${mass} of ${container.capacityKg} kg`;
      return {
        id: container.id,
        code: container.containerCode,
        typeLabel: type.recognised ? type.label : type.storedValue,
        location: container.storageLocation,
        fillText,
        clockTier:
          clock === null
            ? null
            : STORAGE_CLOCK_ALERT_BAND_LABELS[clock.alertBand],
        status: container.status,
        admission,
      };
    },
  );
}

export function requiredTypeLabel(view: IntakeStepView): string | null {
  const required = view.placementPreview.requiredContainerType;
  return required === null ? null : CONTAINER_TYPE_LABELS[required];
}

/**
 * The clock the placement would join, start, or cannot start.
 *
 * Checked in the order a person can act on: an unresolved classification
 * blocks everything downstream (E-13), then the chosen container's own
 * running clock (Rule 4.4 — the record joins it), then whether a rule is in
 * force to start a new one.
 */
export function clockPreview(
  view: IntakeStepView,
  asOf: IsoTimestamp,
): ClockPreview {
  const classification = view.classificationPreview;
  if (classification.kind === "unresolved") {
    return {
      kind: "unresolved",
      message:
        classification.missingInput === "jurisdiction_profile"
          ? NO_JURISDICTION_PROFILE
          : NO_CLASSIFICATION_RULE_IN_FORCE,
    };
  }
  const chosen = view.placementPreview.chosen;
  if (chosen === null) return { kind: "none" };
  if (chosen.clock !== null) {
    return {
      kind: "running",
      clock: chosen.clock,
      label: `Storage clock for container ${chosen.container.containerCode}`,
      asOf,
    };
  }
  if (view.rules.accumulation.kind !== "resolved") {
    return {
      kind: "unresolved",
      message:
        view.rules.accumulation.kind === "no_jurisdiction"
          ? NO_JURISDICTION_PROFILE
          : NO_ACCUMULATION_RULE_IN_FORCE,
    };
  }
  return { kind: "none" };
}

/** E-13's line names the site's jurisdiction, or says there is none on file. */
export function jurisdictionLabel(view: IntakeStepView): string {
  return view.jurisdiction === null ? "Not on file" : view.jurisdiction.name;
}

/** Every confirmed field, with its source, for the summary strip. */
export function summaryFields(view: IntakeStepView): readonly SummaryField[] {
  return view.fields.flatMap((field) => {
    if (field.status !== "confirmed" || field.value === null) return [];
    const source: FieldSource = field.source;
    return [
      {
        fieldCode: field.fieldCode,
        label: field.label,
        value: field.value,
        source,
        enteredByName:
          source === "entered_by"
            ? (field.confirmedByName ?? view.viewer.fullName)
            : null,
      },
    ];
  });
}

/** The server's half of the commit gate; the route's client joins `isOffline`. */
export function commitGateInput(
  view: IntakeStepView,
): Omit<CommitGateInput, "isOffline"> {
  return {
    fields: commitFieldStates(view.draft),
    conditionConfirmed:
      view.draft.condition !== null &&
      view.draft.condition.confirmedBy !== null,
    ownsCondition: true,
    containerChosen: view.draft.containerId !== null,
    // Unplaced intake is permitted in B1a; the container is chosen, never demanded.
    requiresContainer: false,
    // EC-16 / Rule 3.10 — identification completes while classification
    // blocks; the server gate in confirmation.ts passes the same, and the
    // two must never drift (commit-gate.ts). E-13 states the missing input.
    classificationBlocked: false,
  };
}
