import type { CellFormFactor } from "@/domain/taxonomy/cell-form-factor";
import type { Chemistry } from "@/domain/taxonomy/chemistry";
import type { ConfidenceBand } from "@/domain/taxonomy/confidence-band";
import type { DamageFindingType } from "@/domain/taxonomy/damage-finding-type";
import {
  HARD_GATED_LABEL_FIELD_CODES,
  LABEL_FIELD_CODES,
  type LabelFieldCode,
} from "@/domain/taxonomy/label-field-code";
import type { StateOfChargeBand } from "@/domain/taxonomy/state-of-charge-band";
import type { StateOfChargeSource } from "@/domain/taxonomy/state-of-charge-source";
import { isDecimalString } from "@/domain/units";
import type { Decimal, IsoDate, IsoTimestamp, Uuid } from "@/types/common";
import type {
  DraftCandidate,
  DraftFieldState,
  DraftSourceDevice,
  IntakeDraft,
} from "@/types/intake";
import type { CommitFieldState } from "./commit-gate";
import type { DateCodeDecodeResult } from "./date-code";

/**
 * The intake draft and its reducers — `UX_SPEC.md` §2.1.4, §6.4; Flow A-a;
 * Rules 2.10, 2.15, 2.21, 2.24; D-7.
 *
 * The draft is the per-field confirmation state of an intake before it
 * commits, persisted on `intake_session.draft` after every action so that a
 * locked phone loses nothing and a confirmation is never optimistic. **Every
 * reducer here returns a new draft and mutates nothing**: the session row is
 * replaced, the previous draft is what the audit row's `beforeState` holds,
 * and a reducer that edited in place would hand the same object to both.
 *
 * Attribution is the point. `confirmDraftField` takes the person and the
 * instant — a user id, never the system (Rule 2.21) — and both arrive as
 * arguments because `src/domain` reads no clock and knows no session.
 *
 * **Chemistry has two sources and this file can express no third.** A selected
 * catalog candidate supplies it (`catalog_match`) or a person types it
 * (`human_entry`). The `chemistry_code` field holds characters printed on the
 * label until one of those happens; nothing in the draft says a photograph
 * decided a chemistry (Rules 2.9, 2.10).
 *
 * Entity shapes are imported **type-only** from `@/types/intake`, the module
 * that owns them: duplicating eight interfaces here so the folder could avoid
 * the import would be the drift the seam exists to prevent, and a type import
 * erases at compile time, so the purity rule — no runtime reach outside
 * `src/domain` — holds.
 */

/** Who did a thing, and when. The instant is the caller's, not a clock read. */
export interface DraftActor {
  readonly userId: Uuid;
  readonly at: IsoTimestamp;
}

/** One `label_extraction` row, as the seed needs it. */
export interface ExtractionSeedRow {
  readonly fieldCode: LabelFieldCode;
  readonly fieldValue: string | null;
  readonly confidenceBand: ConfidenceBand;
  readonly isHardGated: boolean;
  readonly rawText: string | null;
}

/** One ranked candidate, as `rankCatalogCandidates` returns it. */
export interface CandidateSeedRow {
  readonly catalogEntryId: Uuid;
  readonly matchScore: number;
  readonly matchMethodCode: string;
  readonly matchedOn: readonly string[];
}

export interface DraftStateOfChargeInput {
  readonly band: StateOfChargeBand;
  readonly percent: Decimal | null;
  readonly source: StateOfChargeSource | null;
}

/** The label fields the record cannot be written without a value for. */
const REQUIRED_LABEL_FIELD_CODES: readonly LabelFieldCode[] = [
  "model",
  "chemistry_code",
];

const CHEMISTRY_FIELD: LabelFieldCode = "chemistry_code";
const CONDITION_FIELD: LabelFieldCode = "assessed_condition";

function isHardGatedCode(fieldCode: LabelFieldCode): boolean {
  return (HARD_GATED_LABEL_FIELD_CODES as readonly LabelFieldCode[]).includes(
    fieldCode,
  );
}

function assertActor(actor: DraftActor): void {
  // Rule 2.21 — a confirmation is attributable to a person. An empty id is
  // the system wearing a badge, and the commit would refuse it anyway; refusing
  // here keeps the draft from ever holding one.
  if (actor.userId.trim().length === 0) {
    throw new RangeError("a confirmation needs a user id (Rule 2.21)");
  }
  if (actor.at.trim().length === 0) {
    throw new RangeError("a confirmation needs an instant");
  }
}

function fieldOrThrow(
  draft: IntakeDraft,
  fieldCode: LabelFieldCode,
): DraftFieldState {
  const field = draft.fields.find((entry) => entry.fieldCode === fieldCode);
  if (field === undefined) {
    throw new RangeError(`the draft has no field ${fieldCode}`);
  }
  return field;
}

function replaceField(
  draft: IntakeDraft,
  next: DraftFieldState,
): readonly DraftFieldState[] {
  return draft.fields.map((field) =>
    field.fieldCode === next.fieldCode ? next : field,
  );
}

/** The field as the extraction left it: pending, unattributed, original value restored. */
function revertedToRead(field: DraftFieldState): DraftFieldState {
  return {
    ...field,
    status: "pending",
    value: field.originalValue,
    source: "read_from_label",
    confirmedBy: null,
    confirmedAt: null,
  };
}

/* ----------------------------------------------------------------- seeding */

/**
 * The draft as it stands the moment the gate hands over to a person.
 *
 * Every T-09 code gets a row, in T-09 order, whether or not the run produced
 * one: a field the run did not read is `value: null` at `not_extracted`, and it
 * is on the card so the person sees it was not read (Rule 2.11). `isHardGated`
 * is true when the taxonomy says so *or* the row says so — a row that disagrees
 * with T-09 is a data defect and the safe reading is the stricter one.
 *
 * Nothing is selected and nothing is confirmed. The candidates are ranked, not
 * chosen (Rule 2.19); the form-factor proposal is a proposal (Rule 2.25); the
 * decode is a decode and a person's date, when they enter one, outranks it
 * (Rule 2.24).
 */
export function seedDraftFromExtraction(
  rows: readonly ExtractionSeedRow[],
  candidates: readonly CandidateSeedRow[],
  decode: DateCodeDecodeResult | null,
  formFactorProposal: CellFormFactor | null,
): IntakeDraft {
  const fields: readonly DraftFieldState[] = LABEL_FIELD_CODES.map((code) => {
    const row = rows.find((entry) => entry.fieldCode === code);
    return {
      fieldCode: code,
      status: "pending",
      value: row?.fieldValue ?? null,
      originalValue: row?.fieldValue ?? null,
      source: "read_from_label",
      confidenceBand: row?.confidenceBand ?? "not_extracted",
      rawText: row?.rawText ?? null,
      isHardGated: isHardGatedCode(code) || row?.isHardGated === true,
      confirmedBy: null,
      confirmedAt: null,
    };
  });

  const seededCandidates: readonly DraftCandidate[] = candidates.map(
    (candidate) => ({
      catalogEntryId: candidate.catalogEntryId,
      matchScore: candidate.matchScore,
      matchMethodCode: candidate.matchMethodCode,
      matchedOn: [...candidate.matchedOn],
    }),
  );

  return {
    fields,
    candidates: seededCandidates,
    selectedCatalogEntryId: null,
    catalogMatchRejected: false,
    chemistry: null,
    chemistrySource: null,
    formFactorProposal,
    manualEntry: false,
    extractionRejected: false,
    dateCodeDecode:
      decode === null
        ? null
        : {
            formatKey: decode.formatKey,
            decodedManufacturedOn: decode.decodedManufacturedOn,
            decodedPrecision: decode.decodedPrecision,
            decoderVersion: decode.decoderVersion,
          },
    manufacturedOnEntered: null,
    condition: null,
    stateOfCharge: null,
    containerId: null,
    sourceDevice: null,
    labelPhotoId: null,
    labelCropId: null,
    extractionRunId: null,
  };
}

/* ------------------------------------------------------------------ fields */

/**
 * A person confirms a field, as read or corrected.
 *
 * The extracted value is never overwritten: `originalValue` was set at seed and
 * stays, and where a field had no original yet (a hand-entered value being
 * corrected) the value being replaced becomes it — the extracted/corrected pair
 * is the training asset (D-7). A corrected value is `entered_by` the person; a
 * value confirmed as it stood keeps the source it had, so a catalog-supplied
 * chemistry still reads as matched from the catalog after confirmation.
 */
export function confirmDraftField(
  draft: IntakeDraft,
  fieldCode: LabelFieldCode,
  value: string | null,
  by: DraftActor,
): IntakeDraft {
  assertActor(by);
  const field = fieldOrThrow(draft, fieldCode);
  const changed = value !== field.value;
  return {
    ...draft,
    fields: replaceField(draft, {
      ...field,
      status: "confirmed",
      value,
      originalValue:
        field.originalValue !== null
          ? field.originalValue
          : changed
            ? field.value
            : null,
      source: changed ? "entered_by" : field.source,
      confirmedBy: by.userId,
      confirmedAt: by.at,
    }),
  };
}

/**
 * A person rejects a field's read (§2.1.5). The read stays as `originalValue`
 * and `rawText` — rejected is a state, not a deletion — and the rejection is
 * attributed like a confirmation, because "who decided this was wrong" is a
 * question an audit asks.
 */
export function rejectDraftField(
  draft: IntakeDraft,
  fieldCode: LabelFieldCode,
  by: DraftActor,
): IntakeDraft {
  assertActor(by);
  const field = fieldOrThrow(draft, fieldCode);
  return {
    ...draft,
    fields: replaceField(draft, {
      ...field,
      status: "rejected",
      value: null,
      confirmedBy: by.userId,
      confirmedAt: by.at,
    }),
  };
}

/**
 * A person types a value the read did not supply, or supplies one on the manual
 * path. Pending until confirmed — entering and confirming are two acts, and
 * only the second is the attributable one (Rule 2.21).
 */
export function enterDraftFieldValue(
  draft: IntakeDraft,
  fieldCode: LabelFieldCode,
  value: string | null,
): IntakeDraft {
  const field = fieldOrThrow(draft, fieldCode);
  return {
    ...draft,
    fields: replaceField(draft, {
      ...field,
      status: "pending",
      value,
      source: "entered_by",
      confirmedBy: null,
      confirmedAt: null,
    }),
  };
}

/* --------------------------------------------------------------- chemistry */

/**
 * A person picks a catalog candidate, or declines them all (`null`).
 *
 * Picking one sets the record's chemistry from the entry — `catalog_match`, the
 * first of the two sources — and puts that chemistry on the `chemistry_code`
 * field as **Matched from catalog**, pending: the person still confirms it,
 * because no match auto-commits a hard-gated field (Rule 2.15). The label's
 * printed characters stay in `originalValue`.
 *
 * Declining (`null`) is Rule 2.20 / EC-10: the match is rejected, the chemistry
 * the catalog supplied is withdrawn, and the field goes back to what was read.
 * A hand-entered chemistry survives a later deselection — the person's entry
 * is not the catalog's to withdraw.
 *
 * An entry with no chemistry of its own (`chemistry: null`) is selectable and
 * supplies nothing; the person enters chemistry by hand.
 */
export function selectDraftCandidate(
  draft: IntakeDraft,
  catalogEntryId: Uuid | null,
  chemistry: Chemistry | null,
): IntakeDraft {
  const field = fieldOrThrow(draft, CHEMISTRY_FIELD);
  const humanEntered = draft.chemistrySource === "human_entry";

  if (catalogEntryId === null) {
    return {
      ...draft,
      selectedCatalogEntryId: null,
      catalogMatchRejected: true,
      chemistry: humanEntered ? draft.chemistry : null,
      chemistrySource: humanEntered ? draft.chemistrySource : null,
      fields: humanEntered
        ? draft.fields
        : replaceField(draft, revertedToRead(field)),
    };
  }

  if (chemistry === null) {
    return {
      ...draft,
      selectedCatalogEntryId: catalogEntryId,
      catalogMatchRejected: false,
      chemistry: humanEntered ? draft.chemistry : null,
      chemistrySource: humanEntered ? draft.chemistrySource : null,
      fields: humanEntered
        ? draft.fields
        : replaceField(draft, revertedToRead(field)),
    };
  }

  return {
    ...draft,
    selectedCatalogEntryId: catalogEntryId,
    catalogMatchRejected: false,
    chemistry,
    chemistrySource: "catalog_match",
    fields: replaceField(draft, {
      ...field,
      status: "pending",
      value: chemistry,
      source: "matched_from_catalog",
      confirmedBy: null,
      confirmedAt: null,
    }),
  };
}

/**
 * A person enters the chemistry by hand — `human_entry`, the second source.
 *
 * `unknown` is refused: it is T-03's "not confirmed", the state the record is
 * in *before* anyone enters a chemistry, and the commit refuses it (§5). The
 * field carries the entered chemistry as **Entered by you**, pending
 * confirmation. A selected catalog entry, if any, stays selected — the person's
 * chemistry outranks the entry's, and the record says so through
 * `chemistrySource`.
 */
export function enterDraftChemistry(
  draft: IntakeDraft,
  chemistry: Chemistry,
): IntakeDraft {
  if (chemistry === "unknown") {
    throw new RangeError(
      "a person enters a chemistry; unknown is the absence of one",
    );
  }
  const field = fieldOrThrow(draft, CHEMISTRY_FIELD);
  return {
    ...draft,
    chemistry,
    chemistrySource: "human_entry",
    fields: replaceField(draft, {
      ...field,
      status: "pending",
      value: chemistry,
      source: "entered_by",
      confirmedBy: null,
      confirmedAt: null,
    }),
  };
}

/* ------------------------------------------------------------------ step 3 */

/**
 * Step 3 records the findings a person observed (T-29), and `defective` as a
 * separate human-recorded fact (T-30 — no visible indicator sets it). With an
 * actor the recording is also the confirmation; with `null` it is recorded
 * and awaits {@link confirmDraftCondition}. What the findings *mean* — sound,
 * cosmetic, damaged or defective — is Rule 6.4's mechanical split, evaluated
 * at commit from these findings, never stored ahead of it.
 */
export function setDraftCondition(
  draft: IntakeDraft,
  findings: readonly DamageFindingType[],
  by: DraftActor | null,
  isDefective: boolean = draft.condition?.isDefective ?? false,
): IntakeDraft {
  if (findings.length === 0) {
    // Rule 6.3 — an inspection that found nothing records `none_observed`.
    throw new RangeError(
      "an assessment records at least one finding (none_observed counts)",
    );
  }
  if (by !== null) assertActor(by);
  return {
    ...draft,
    condition: {
      findingTypes: [...findings],
      isDefective,
      confirmedBy: by?.userId ?? null,
      confirmedAt: by?.at ?? null,
    },
  };
}

/** A person confirms the recorded findings (Rule 6.2). Nothing to confirm throws. */
export function confirmDraftCondition(
  draft: IntakeDraft,
  by: DraftActor,
): IntakeDraft {
  assertActor(by);
  if (draft.condition === null) {
    throw new RangeError("no findings have been recorded to confirm");
  }
  return {
    ...draft,
    condition: {
      ...draft.condition,
      confirmedBy: by.userId,
      confirmedAt: by.at,
    },
  };
}

/**
 * State of charge as a person observed it (T-21, T-55). `percent` is a
 * `Decimal` string or nothing; a number would be a float on the record.
 */
export function setDraftStateOfCharge(
  draft: IntakeDraft,
  stateOfCharge: DraftStateOfChargeInput,
): IntakeDraft {
  if (
    stateOfCharge.percent !== null &&
    !isDecimalString(stateOfCharge.percent)
  ) {
    throw new RangeError(
      `state of charge percent is not a decimal string: ${JSON.stringify(stateOfCharge.percent)}`,
    );
  }
  return {
    ...draft,
    stateOfCharge: {
      band: stateOfCharge.band,
      percent: stateOfCharge.percent,
      source: stateOfCharge.source,
    },
  };
}

/** The container this record will be placed in, or none (unplaced intake). */
export function setDraftPlacement(
  draft: IntakeDraft,
  containerId: Uuid | null,
): IntakeDraft {
  return { ...draft, containerId };
}

/** A date a person entered. A decode never overrides it (Rule 2.24). */
export function setDraftManufacturedOn(
  draft: IntakeDraft,
  manufacturedOn: IsoDate | null,
): IntakeDraft {
  return { ...draft, manufacturedOnEntered: manufacturedOn };
}

/** Where the battery came from, as told to the handler — captured, never verified in B1a. */
export function setDraftSourceDevice(
  draft: IntakeDraft,
  sourceDevice: DraftSourceDevice | null,
): IntakeDraft {
  return { ...draft, sourceDevice };
}

/* ------------------------------------------------------------------- paths */

/** The person took the manual path (E-4, E-5). The extraction, if any, stays. */
export function markDraftManualEntry(draft: IntakeDraft): IntakeDraft {
  return { ...draft, manualEntry: true };
}

/**
 * §2.1.5 whole-read reject. The extraction rows are retained and the draft is
 * marked; every field goes back to pending with no value so nothing the read
 * proposed survives as though a person had accepted it. Originals and raw text
 * stay — the reject is itself training signal (D-7).
 */
export function markDraftExtractionRejected(draft: IntakeDraft): IntakeDraft {
  return {
    ...draft,
    extractionRejected: true,
    fields: draft.fields.map((field) => ({
      ...field,
      status: "pending",
      value: null,
      source: "read_from_label",
      confirmedBy: null,
      confirmedAt: null,
    })),
  };
}

/* ------------------------------------------------------------------ commit */

/**
 * The draft's fields as the commit gate reads them.
 *
 * Assessed condition is a hard-gated T-09 field, but on this product it is
 * confirmed on step 3 as a condition (Rule 6.2), so its status here comes from
 * the draft's condition — confirmed when a person has confirmed findings —
 * and it is not "required" as a text value. Model and chemistry code are the
 * required values: a record without either cannot be identified.
 */
export function commitFieldStates(
  draft: IntakeDraft,
): readonly CommitFieldState[] {
  const conditionConfirmed =
    draft.condition !== null && draft.condition.confirmedBy !== null;
  return draft.fields.map((field) => ({
    fieldCode: field.fieldCode,
    status:
      field.fieldCode === CONDITION_FIELD
        ? conditionConfirmed
          ? "confirmed"
          : "pending"
        : field.status,
    value: field.value,
    confidenceBand: field.confidenceBand,
    isHardGated: field.isHardGated,
    isRequired: REQUIRED_LABEL_FIELD_CODES.includes(field.fieldCode),
  }));
}

/**
 * The three attributable confirmations the commit refuses without
 * (Rule 2.21, §5): model and chemistry code confirmed by a person on the card,
 * and the assessed condition confirmed by a person on step 3. **No band, no
 * match score and no reason code substitutes for any of them.**
 */
export function hardGatedFieldsConfirmed(draft: IntakeDraft): boolean {
  const fieldConfirmed = (fieldCode: LabelFieldCode): boolean => {
    const field = draft.fields.find((entry) => entry.fieldCode === fieldCode);
    return (
      field !== undefined &&
      field.status === "confirmed" &&
      field.confirmedBy !== null &&
      field.confirmedBy.trim().length > 0
    );
  };
  const conditionConfirmed =
    draft.condition !== null &&
    draft.condition.confirmedBy !== null &&
    draft.condition.confirmedBy.trim().length > 0;

  return HARD_GATED_LABEL_FIELD_CODES.every((fieldCode) =>
    fieldCode === CONDITION_FIELD
      ? conditionConfirmed
      : fieldConfirmed(fieldCode),
  );
}
