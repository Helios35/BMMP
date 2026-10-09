import type { Decimal } from "@/types/common";
import { CHEMISTRIES, CHEMISTRY_LABELS } from "@/domain/taxonomy/chemistry";
import { readTaxonomyValue } from "@/domain/taxonomy/lookup";
import { addDecimal } from "@/domain/units";

/**
 * Step 1's live summary — `UX_SPEC.md` §3.12; Flow B1.
 *
 * Record count, chemistries present, aggregate mass and energy **where
 * known**, and **every damaged, defective or recalled record named**. A total
 * over records some of which carry no figure is stated as partial, never as
 * the total: the sum is exact decimal arithmetic over what is recorded, and
 * the flag says it is not everything.
 */

export type ContentsSummaryRecord = {
  readonly recordNumber: string;
  /** T-01 as stored; null where not confirmed. */
  readonly chemistry: string | null;
  readonly massKg: Decimal | null;
  readonly energyWh: Decimal | null;
  /** Any DDR flag, or the stored air prohibition. */
  readonly damaged: boolean;
};

export type ContentsSummary = {
  readonly recordCount: number;
  /** Labels, in T-01 order; an unrecognised stored value as stored. */
  readonly chemistries: readonly string[];
  readonly massKg: Decimal;
  /** False where any record carries no mass — the sum above is then partial. */
  readonly massComplete: boolean;
  readonly energyWh: Decimal;
  readonly energyComplete: boolean;
  readonly damagedRecordNumbers: readonly string[];
};

export function summarizeShipmentContents(
  records: readonly ContentsSummaryRecord[],
): ContentsSummary {
  const stored = new Set(
    records.map((record) => record.chemistry ?? "unknown"),
  );
  const known = CHEMISTRIES.filter((chemistry) => stored.has(chemistry)).map(
    (chemistry) => CHEMISTRY_LABELS[chemistry],
  );
  const unrecognised = [...stored].filter((value) => {
    const read = readTaxonomyValue(CHEMISTRIES, CHEMISTRY_LABELS, value);
    return !read.recognised;
  });

  const masses = records.map((record) => record.massKg);
  const energies = records.map((record) => record.energyWh);
  const sum = (values: readonly (Decimal | null)[]) =>
    values.reduce<Decimal>(
      (total, value) => (value === null ? total : addDecimal(total, value)),
      "0",
    );

  return {
    recordCount: records.length,
    chemistries: [...known, ...unrecognised.sort()],
    massKg: sum(masses),
    massComplete: masses.every((value) => value !== null),
    energyWh: sum(energies),
    energyComplete: energies.every((value) => value !== null),
    damagedRecordNumbers: records
      .filter((record) => record.damaged)
      .map((record) => record.recordNumber)
      .sort((a, b) => a.localeCompare(b)),
  };
}
