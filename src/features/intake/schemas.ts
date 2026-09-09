import { z } from "zod";

import { INTAKE_FLOW_STEPS } from "@/domain/intake/steps";
import { APPLICATION_CLASSES } from "@/domain/taxonomy/application-class";
import { CHEMISTRIES } from "@/domain/taxonomy/chemistry";
import { DAMAGE_FINDING_TYPES } from "@/domain/taxonomy/damage-finding-type";
import { INTAKE_PHOTO_TYPES } from "@/domain/taxonomy/intake-photo-type";
import { LABEL_FIELD_CODES } from "@/domain/taxonomy/label-field-code";
import { PROVENANCE_SOURCE_TYPES } from "@/domain/taxonomy/provenance-source-type";
import { STATE_OF_CHARGE_BANDS } from "@/domain/taxonomy/state-of-charge-band";
import { STATE_OF_CHARGE_SOURCES } from "@/domain/taxonomy/state-of-charge-source";
import { isDecimalString } from "@/domain/units";

import { CHEMISTRY_UNKNOWN_REFUSED } from "./copy";

/**
 * Input parsing for every intake write — `TECHNICAL_SPEC.md` §7.1 step 3.
 *
 * **Validation is server-side.** These schemas run inside the Server Actions
 * and the upload route, where the caller cannot skip them. A screen may render
 * the same requirements as a courtesy; the parse here is the enforcement, and
 * on this product an unvalidated value ends up on a document.
 *
 * Every enumerated value is checked against its taxonomy module, never against
 * a list written here (TAXONOMY.md §5.3). A value the taxonomy does not carry
 * is refused; nothing is invented or coerced.
 *
 * **Nothing here is a threshold.** The length caps are shape limits on a text
 * input, not figures a rule supplies (Rule 1.23).
 */

/** Free-text caps — shape limits, not regulatory figures. */
const MAX_TEXT_LENGTH = 120;
const MAX_REASON_LENGTH = 500;
const MAX_FILE_NAME_LENGTH = 255;
const MAX_MODEL_YEAR_DIGITS = 4;

const uuidField = z.uuid();

/**
 * An exact decimal, as its digits. A `number` here would be a float on the
 * record, which `ERD.md` §2.3 forbids for any quantity a rule reads.
 */
const decimalField = z
  .string()
  .trim()
  .refine(isDecimalString, "Enter a number, using digits only.");

const textField = z.string().trim().max(MAX_TEXT_LENGTH);

const optionalText = textField.nullable().optional();

export const sessionIdSchema = z.object({ sessionId: uuidField });

export const startIntakeSessionSchema = z.object({
  containerId: uuidField.nullable().optional(),
});

/** The upload's original file name, when the client still has it — the fixture provider keys on it. */
const labelFileNameField = z
  .string()
  .trim()
  .min(1)
  .max(MAX_FILE_NAME_LENGTH)
  .nullable()
  .optional();

export const runLabelExtractionSchema = z.object({
  sessionId: uuidField,
  labelPhotoId: uuidField,
  labelFileName: labelFileNameField,
});

/**
 * A box drawn by a person, in the pixel frame of the photo it was drawn on
 * (T-51 `manual`). Whole pixels, inside the frame, with some area.
 */
export const cropGeometrySchema = z
  .object({
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    sourceWidth: z.number().int().positive(),
    sourceHeight: z.number().int().positive(),
  })
  .refine(
    (box) =>
      box.x + box.width <= box.sourceWidth &&
      box.y + box.height <= box.sourceHeight,
    { error: "The box has to sit inside the photo." },
  );

export type CropGeometryInput = z.infer<typeof cropGeometrySchema>;

export const setLabelCropRegionSchema = z.object({
  sessionId: uuidField,
  labelPhotoId: uuidField,
  geometry: cropGeometrySchema,
  labelFileName: labelFileNameField,
});

export const labelFieldCodeSchema = z.enum(LABEL_FIELD_CODES);

export const confirmFieldSchema = z.object({
  sessionId: uuidField,
  fieldCode: labelFieldCodeSchema,
  /** `null` confirms the value as it stands on the draft. */
  value: z.string().nullable(),
});

export const rejectFieldSchema = z.object({
  sessionId: uuidField,
  fieldCode: labelFieldCodeSchema,
});

export const enterFieldValueSchema = z.object({
  sessionId: uuidField,
  fieldCode: labelFieldCodeSchema,
  value: z.string().nullable(),
});

export const selectCatalogCandidateSchema = z.object({
  sessionId: uuidField,
  /** `null` declines every candidate and takes the manual path (Rule 2.20). */
  catalogEntryId: uuidField.nullable(),
});

/**
 * A chemistry a person enters — the second of the two sources (Rule 2.10).
 * `unknown` is T-01's "not confirmed", the state before anyone enters one,
 * and it is refused here as well as in the reducer.
 */
export const enteredChemistrySchema = z
  .enum(CHEMISTRIES)
  .refine((chemistry) => chemistry !== "unknown", {
    error: CHEMISTRY_UNKNOWN_REFUSED,
  });

export const enterChemistrySchema = z.object({
  sessionId: uuidField,
  chemistry: enteredChemistrySchema,
});

export const abandonIntakeSessionSchema = z.object({
  sessionId: uuidField,
  reason: z.string().trim().min(1, "State why.").max(MAX_REASON_LENGTH),
});

/** Rule 2.23 — a record leaves the queue by a person voiding it **with a stated reason**. */
export const voidIntakeSessionSchema = z.object({
  sessionId: uuidField,
  reason: z
    .string()
    .trim()
    .min(1, "State why this record is being voided.")
    .max(MAX_REASON_LENGTH),
});

export const setConditionSchema = z.object({
  sessionId: uuidField,
  /** T-29. At least one; `none_observed` is a real finding (Rule 6.3). */
  findingTypes: z
    .array(z.enum(DAMAGE_FINDING_TYPES))
    .min(1, "Record at least one finding."),
  /** T-30 `defective` — a human-recorded fact, never inferred. */
  isDefective: z.boolean(),
});

export const setStateOfChargeSchema = z.object({
  sessionId: uuidField,
  band: z.enum(STATE_OF_CHARGE_BANDS),
  percent: decimalField.nullable(),
  source: z.enum(STATE_OF_CHARGE_SOURCES).nullable(),
});

const sourceDeviceSchema = z.object({
  /**
   * `battery_record.source_device_type` has no `TAXONOMY.md` system yet, so it
   * is carried as free text and reported rather than enumerated here.
   */
  type: optionalText,
  identifier: optionalText,
  make: optionalText,
  model: optionalText,
  modelYear: z
    .number()
    .int()
    .positive()
    .refine((year) => String(year).length === MAX_MODEL_YEAR_DIGITS, {
      error: "Enter a four-digit year.",
    })
    .nullable()
    .optional(),
  /** T-11. B1a captures the reference; nothing here claims it is verified (Rule 2.30). */
  provenanceSourceType: z.enum(PROVENANCE_SOURCE_TYPES),
});

export type SourceDeviceInput = z.infer<typeof sourceDeviceSchema>;

export const setSourceDeviceSchema = z.object({
  sessionId: uuidField,
  /** `null` clears what was recorded. */
  sourceDevice: sourceDeviceSchema.nullable(),
});

/** Rule 2.24 — a date a person enters; a decode never overrides it. */
export const enterManufacturedOnSchema = z.object({
  sessionId: uuidField,
  manufacturedOn: z.iso.date("Enter the date as YYYY-MM-DD.").nullable(),
});

export const choosePlacementSchema = z.object({
  sessionId: uuidField,
  /** `null` leaves the battery unplaced. */
  containerId: uuidField.nullable(),
});

export const createContainerForIntakeSchema = z.object({
  sessionId: uuidField,
  storageLocation: z
    .string()
    .trim()
    .min(1, "Say where the container is.")
    .max(MAX_TEXT_LENGTH),
});

/**
 * A tenant's proposal for a product the catalog does not describe (E-5). It
 * lands as `proposed` and is not available for matching until published
 * (T-07), so the intake in hand still identifies the battery by hand.
 */
export const proposeCatalogEntrySchema = z.object({
  sessionId: uuidField,
  manufacturerName: z
    .string()
    .trim()
    .min(1, "Enter the manufacturer.")
    .max(MAX_TEXT_LENGTH),
  modelName: optionalText,
  partNumber: optionalText,
  chemistry: enteredChemistrySchema,
  applicationClass: z.enum(APPLICATION_CLASSES),
  nominalVoltageV: decimalField.nullable().optional(),
  ratedCapacityAh: decimalField.nullable().optional(),
  ratedEnergyWh: decimalField.nullable().optional(),
});

export type ProposeCatalogEntryInput = z.infer<
  typeof proposeCatalogEntrySchema
>;

export const advanceToStepSchema = z.object({
  sessionId: uuidField,
  step: z.enum(INTAKE_FLOW_STEPS),
});

export const confirmIntakeSchema = sessionIdSchema;

/**
 * The photo types a person captures directly. `label_crop` is the pipeline's
 * to write — it is the only T-50 value that requires a parent, and a caller
 * naming it would be a crop with no geometry.
 */
export const CAPTURED_PHOTO_TYPES = INTAKE_PHOTO_TYPES.filter(
  (type) => type !== "label_crop",
);

/** `POST /api/intake/photos`, the multipart fields beside the file. */
export const intakePhotoUploadSchema = z.object({
  intakeSessionId: uuidField,
  photoType: z
    .enum(INTAKE_PHOTO_TYPES)
    .refine((type) => type !== "label_crop", {
      error: "A label crop is produced by the pipeline, not uploaded.",
    }),
  capturedAt: z.iso.datetime({ offset: true }).optional(),
});

export type IntakePhotoUploadInput = z.infer<typeof intakePhotoUploadSchema>;

/**
 * The first issue a parse produced, as a field name and a message — one at a
 * time, on the field it belongs to (§10.3).
 */
export function firstIssue(error: z.ZodError): {
  readonly field: string | undefined;
  readonly message: string;
} {
  const issue = error.issues[0];
  const path = issue?.path[0];
  return {
    field: typeof path === "string" ? path : undefined,
    message: issue?.message ?? "Check the details and try again.",
  };
}
