import { z } from "zod";

import {
  LABEL_EXTRACTION_SCHEMA_VERSION,
  LABEL_FIELD_KEYS,
  VisionProviderError,
  type LabelExtractionResult,
  type LabelFieldKey,
} from "./provider";

/**
 * The shape every provider answer is checked against **before anything else
 * happens** (`TECHNICAL_SPEC.md` §11.1 step 3). A malformed response is refused,
 * never quietly passed — the documented failure mode of a vision model is a
 * plausible value on a low-confidence read, and schema validation is one third
 * of the mitigation, beside per-field confidence and the human gate (T-09).
 *
 * Every object is strict. **An unknown key is refused**, because a value for a
 * field nobody asked about is a fabrication and T-09's vocabulary is closed. A
 * confidence outside 0..1 is refused, because a band is derived from it and a
 * number out of range would land in a band by accident (T-10).
 */

const confidenceSchema = z.number().min(0).max(1);

const evidenceSchema = z.strictObject({
  boundingBox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  rawText: z.string(),
});

/** One field's answer. `value` is the characters as printed, or null for unread. */
export const labelFieldResultSchema = z.strictObject({
  value: z.string().nullable(),
  confidence: confidenceSchema,
  evidence: evidenceSchema.partial().optional(),
});

const fieldsShape = Object.fromEntries(
  LABEL_FIELD_KEYS.map((key) => [key, labelFieldResultSchema]),
) as Record<LabelFieldKey, typeof labelFieldResultSchema>;

/** Every T-09 key, each exactly once, nothing else. */
export const labelExtractionFieldsSchema = z.strictObject(fieldsShape);

const usageSchema = z.strictObject({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative().optional(),
});

export const labelExtractionResultSchema = z.strictObject({
  schemaVersion: z.literal(LABEL_EXTRACTION_SCHEMA_VERSION),
  fields: labelExtractionFieldsSchema,
  providerCode: z.string().min(1),
  modelIdentifier: z.string().min(1),
  promptVersion: z.string().min(1),
  rawResponse: z.unknown(),
  usage: usageSchema.nullable().optional(),
});

/** What the schema lets through: `value` narrowed to `string | null`. */
export type ValidatedLabelExtractionResult = z.infer<
  typeof labelExtractionResultSchema
>;

function describeIssues(error: z.ZodError): string {
  return error.issues
    .map(
      (issue) =>
        `${issue.path.map(String).join(".") || "<root>"}: ${issue.message}`,
    )
    .join("; ");
}

/**
 * Validate a provider's answer, or throw `VisionProviderError("malformed")`.
 *
 * Beyond the shape, this applies EC-7: **a non-null value for a field that was
 * not requested is a fabrication** — the model was never asked, so it cannot
 * have read it — and the whole response is refused rather than the one field
 * dropped. A response that fabricates one field is evidence the read as a whole
 * is unreliable, the same logic Rule 2.14 applies to a low band.
 */
export function parseLabelExtractionResult(
  raw: unknown,
  requestedFields: readonly LabelFieldKey[],
): ValidatedLabelExtractionResult {
  const parsed = labelExtractionResultSchema.safeParse(raw);
  if (!parsed.success) {
    throw new VisionProviderError(
      "malformed",
      `The label reader's response did not match ${LABEL_EXTRACTION_SCHEMA_VERSION}: ${describeIssues(parsed.error)}`,
    );
  }

  const requested = new Set<LabelFieldKey>(requestedFields);
  const fabricated = LABEL_FIELD_KEYS.filter(
    (key) => !requested.has(key) && parsed.data.fields[key].value !== null,
  );
  if (fabricated.length > 0) {
    throw new VisionProviderError(
      "malformed",
      `The label reader returned a value for a field that was not requested (EC-7): ${fabricated.join(", ")}`,
    );
  }

  return parsed.data;
}

/**
 * A validated result satisfies the provider contract; this assignment is the
 * compile-time proof, so the schema and the interface cannot drift apart
 * without the typecheck saying so.
 */
export const validatedResultIsContract = (
  validated: ValidatedLabelExtractionResult,
): LabelExtractionResult => validated;
