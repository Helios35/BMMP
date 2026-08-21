import type { FieldSource } from "@/components/provenance/field-source-badge";
import {
  CHEMISTRY_SOURCES,
  CHEMISTRY_SOURCE_LABELS,
} from "@/domain/taxonomy/chemistry-source";
import type { LabelFieldCode } from "@/domain/taxonomy/label-field-code";
import { readTaxonomyValue } from "@/domain/taxonomy/lookup";
import type { BatteryRecord } from "@/types/battery-record";

/**
 * Where each value on a battery record came from — `UX_SPEC.md` §3.7.
 *
 * **The source is derived, never stored.** It is a reading of which column
 * carried the value: an extraction row for that field code means the label was
 * read, a linked catalog entry means it was matched, and anything else means a
 * person typed it. Storing it would make it a fact that could disagree with the
 * rows it summarises.
 *
 * **Chemistry is the exception, and it is the whole reason this module exists.**
 * Rule 2.10 admits exactly two sources for chemistry — a matched catalog entry
 * or direct human entry — so {@link chemistryFieldSource} returns a type that
 * structurally cannot say `read_from_label` or `detected_from_image`. A camera
 * never identifies chemistry, and copy implying it did is a defect rather than a
 * wording preference (`_ANCHORS.md` §7.2).
 */

/** The identity fields whose source follows the label → catalog → person ladder. */
export type IdentityFieldKey =
  | "manufacturerName"
  | "modelName"
  | "partNumber"
  | "serialNumber"
  | "nominalVoltageV"
  | "ratedCapacityAh"
  | "ratedEnergyWh";

/**
 * Which T-09 field code carries each record column on the label.
 *
 * Model and part number share `model` because the label prints one string; the
 * record splits it, and both halves came from the same read.
 */
const LABEL_FIELD_FOR: Readonly<Record<IdentityFieldKey, LabelFieldCode>> = {
  manufacturerName: "manufacturer",
  modelName: "model",
  partNumber: "model",
  serialNumber: "serial_number",
  nominalVoltageV: "voltage",
  ratedCapacityAh: "capacity_ah",
  ratedEnergyWh: "energy_wh",
};

export interface FieldSourceInput {
  /** The field codes an extraction run produced for this record's session. */
  readonly extractedFieldCodes: ReadonlySet<LabelFieldCode>;
  readonly hasCatalogMatch: boolean;
}

export function fieldSourceFor(
  field: IdentityFieldKey,
  input: FieldSourceInput,
): FieldSource {
  if (input.extractedFieldCodes.has(LABEL_FIELD_FOR[field])) {
    return "read_from_label";
  }
  if (input.hasCatalogMatch) return "matched_from_catalog";
  return "entered_by";
}

/**
 * The only two sources chemistry may have (Rules 2.9, 2.10).
 *
 * The union is the enforcement: nothing in this module can widen it, so a later
 * edit cannot quietly let a photograph claim a chemistry.
 */
export type ChemistryFieldSource = Extract<
  FieldSource,
  "matched_from_catalog" | "entered_by"
>;

/**
 * Chemistry's source, or `null` where the stored value is not one T-54 defines.
 *
 * `null` renders **no badge at all** — with the raw stored value shown beside
 * the field instead. Guessing a chemistry provenance from an unrecognised value
 * is precisely the failure `_ANCHORS.md` §7.2 exists to stop, and it is not
 * theoretical: every battery fixture stores `catalog_match_confirmed`, which is
 * outside T-54's authored set and takes this path today.
 */
export function chemistryFieldSource(
  chemistrySource: string | null,
): ChemistryFieldSource | null {
  if (chemistrySource === null) return null;
  const read = readTaxonomyValue(
    CHEMISTRY_SOURCES,
    CHEMISTRY_SOURCE_LABELS,
    chemistrySource,
  );
  if (!read.recognised) return null;
  return read.storedValue === "catalog_match"
    ? "matched_from_catalog"
    : "entered_by";
}

/**
 * Form factor is the one visual inference this product makes (T-04).
 *
 * It is proposed from a photograph and passes the same gate as any other field,
 * and it **never implies, suggests or contributes to a chemistry determination**
 * (Rule 2.25).
 */
export const FORM_FACTOR_SOURCE: FieldSource = "detected_from_image";

/**
 * Manufacture date: decoded where a date-code decode exists, otherwise the
 * ordinary ladder.
 *
 * A decode that failed renders `Undecodable` beside the raw code and **never an
 * approximate date** (Rule 2.24) — that is the caller's copy; this only names
 * the source.
 */
export function manufactureDateSource(record: BatteryRecord): FieldSource {
  if (record.dateCodeDecodeId !== null) return "decoded";
  return record.catalogEntryId !== null ? "matched_from_catalog" : "entered_by";
}
