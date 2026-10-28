import type { Chemistry } from "@/domain/taxonomy/chemistry";
import type { LabelFieldCode } from "@/domain/taxonomy/label-field-code";
import type { MatchTolerances } from "@/domain/intake/thresholds";
import {
  parseLabelQuantity,
  toAmpHours,
  toVolts,
  toWattHours,
  type Quantity,
} from "@/domain/units";

import { agreesWithinTolerance, normalizePartNumber } from "./match";

/**
 * The label-vs-catalog check, text half — `BUSINESS_RULES.md` Rule 2.35;
 * T-52 `label_catalog_mismatch`; D-56 level 2, D-68.
 *
 * **When a record gets a catalog entry** — by exact match (Rule 2.18) or by a
 * person's pick (Rule 2.19) — every field that both the label read and the
 * entry carry is compared, and each one that disagrees is returned with both
 * values. A label can say one thing while the entry it matched says another:
 * a relabelled pack, a wrong match, a bad read. This makes a person look.
 *
 * **A reason to look, never a verdict.** The result is a list of fields, not a
 * score: nothing here weighs, ranks or totals a disagreement, and nothing
 * blocks on one (Rules 1.25, 2.35). The caller routes the record to review and
 * a person decides.
 *
 * **A field the label did not read is not a disagreement** (Rule 2.11), and a
 * field the entry does not carry is not compared. The tolerances are the ones
 * catalog match scoring reads, through the same comparison (D-43) — there is
 * no second set, and none is held here.
 *
 * The photo half — a reference label photo and a look comparison — is unit
 * 10's (D-68).
 */

/** The T-09 fields Rule 2.35 compares, in its order. No other field is compared. */
export const LABEL_CATALOG_FIELDS = [
  "manufacturer",
  "model",
  "voltage",
  "capacity_ah",
  "energy_wh",
  "chemistry_code",
] as const satisfies readonly LabelFieldCode[];

export type LabelCatalogField = (typeof LABEL_CATALOG_FIELDS)[number];

/** What the label read, as printed. `null` where the label did not read it. */
export interface LabelCatalogRead {
  readonly manufacturer: string | null;
  readonly model: string | null;
  readonly voltage: string | null;
  readonly capacityAh: string | null;
  readonly energyWh: string | null;
  /**
   * The printed chemistry code, **resolved to one T-01 value through the
   * resolution catalog matching uses** — `null` where it resolves to none, and
   * then it is not compared (Rule 2.35). Catalog matching carries no such
   * resolution in this version, so every caller passes `null` today; the
   * comparison is here so that authoring one is the only change.
   */
  readonly chemistry: Chemistry | null;
}

/** The slice of the matched `catalog_entry` the check reads. */
export interface LabelCatalogEntry {
  readonly catalogEntryId: string;
  readonly manufacturerName: string;
  readonly brandName: string | null;
  readonly partNumber: string | null;
  readonly partNumberNormalized: string | null;
  readonly nominalVoltageV: string | null;
  readonly ratedCapacityAh: string | null;
  readonly ratedEnergyWh: string | null;
  readonly chemistry: Chemistry | null;
}

export interface LabelCatalogDisagreement {
  readonly fieldCode: LabelCatalogField;
  /** What the label printed, as read. */
  readonly labelSays: string;
  /** The entry's value as stored, in the entry's unit. */
  readonly catalogSays: string;
  /**
   * The relative tolerance that applied to a quantity — the configured value,
   * kept on the record's history beside the values (Rule 12.15). `null` for a
   * text field, which has no tolerance.
   */
  readonly toleranceRelative: number | null;
}

export interface LabelCatalogComparison {
  readonly catalogEntryId: string;
  /** The fields both sides carried, in Rule 2.35's order. */
  readonly compared: readonly LabelCatalogField[];
  /** Every compared field that disagrees, in the same order. Empty means none. */
  readonly disagreements: readonly LabelCatalogDisagreement[];
}

/** Present on both sides and not blank — Rule 2.11's honest null is not a reading. */
function present(value: string | null): value is string {
  return value !== null && value.trim() !== "";
}

function textAgrees(label: string, catalog: readonly string[]): boolean {
  const read = normalizePartNumber(label);
  return catalog.some((value) => normalizePartNumber(value) === read);
}

function quantityRead(
  text: string,
  to: (quantity: Quantity) => string | null,
): string | null {
  const parsed = parseLabelQuantity(text);
  return parsed === null ? null : to(parsed);
}

/**
 * Compare one label read with the entry the record is matched to.
 *
 * - `manufacturer` against `manufacturer_name`, or `brand_name` where the
 *   entry has one — the label may print either — normalised the way part
 *   numbers are;
 * - `model` against `part_number`, on its normalised form;
 * - `voltage`, `capacity_ah`, `energy_wh` against the rated figures, within
 *   the configured relative tolerance. A printed figure this version cannot
 *   read as a quantity is not compared: it was never a reading in the
 *   entry's unit;
 * - `chemistry_code` only where it resolved to a T-01 value.
 */
export function compareLabelToCatalog(
  read: LabelCatalogRead,
  entry: LabelCatalogEntry,
  tolerances: MatchTolerances,
): LabelCatalogComparison {
  const compared: LabelCatalogField[] = [];
  const disagreements: LabelCatalogDisagreement[] = [];

  const disagree = (
    fieldCode: LabelCatalogField,
    labelSays: string,
    catalogSays: string,
    toleranceRelative: number | null,
  ): void => {
    disagreements.push({
      fieldCode,
      labelSays,
      catalogSays,
      toleranceRelative,
    });
  };

  if (present(read.manufacturer)) {
    const names = [entry.manufacturerName, entry.brandName].filter(present);
    if (names.length > 0) {
      compared.push("manufacturer");
      if (!textAgrees(read.manufacturer, names)) {
        disagree("manufacturer", read.manufacturer, names.join(" / "), null);
      }
    }
  }

  const entryPart =
    entry.partNumberNormalized ??
    (entry.partNumber === null ? null : normalizePartNumber(entry.partNumber));
  if (present(read.model) && present(entryPart)) {
    compared.push("model");
    if (normalizePartNumber(read.model) !== entryPart) {
      disagree("model", read.model, entry.partNumber ?? entryPart, null);
    }
  }

  const quantities = [
    {
      fieldCode: "voltage",
      printed: read.voltage,
      catalog: entry.nominalVoltageV,
      to: toVolts,
      tolerance: tolerances.voltageRelative,
    },
    {
      fieldCode: "capacity_ah",
      printed: read.capacityAh,
      catalog: entry.ratedCapacityAh,
      to: toAmpHours,
      tolerance: tolerances.capacityRelative,
    },
    {
      fieldCode: "energy_wh",
      printed: read.energyWh,
      catalog: entry.ratedEnergyWh,
      to: toWattHours,
      tolerance: tolerances.energyRelative,
    },
  ] as const;
  for (const quantity of quantities) {
    if (!present(quantity.printed) || !present(quantity.catalog)) continue;
    const value = quantityRead(quantity.printed, quantity.to);
    if (value === null) continue;
    compared.push(quantity.fieldCode);
    if (!agreesWithinTolerance(value, quantity.catalog, quantity.tolerance)) {
      disagree(
        quantity.fieldCode,
        quantity.printed,
        quantity.catalog,
        quantity.tolerance,
      );
    }
  }

  if (read.chemistry !== null && entry.chemistry !== null) {
    compared.push("chemistry_code");
    if (read.chemistry !== entry.chemistry) {
      disagree("chemistry_code", read.chemistry, entry.chemistry, null);
    }
  }

  return {
    catalogEntryId: entry.catalogEntryId,
    compared,
    disagreements,
  };
}

/** Rule 2.35's routing question: does anything the label read disagree? */
export function labelDisagreesWithCatalog(
  comparison: LabelCatalogComparison | null,
): boolean {
  return comparison !== null && comparison.disagreements.length > 0;
}
