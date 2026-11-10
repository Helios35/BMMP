import {
  ASSESSED_CONDITIONS,
  ASSESSED_CONDITION_LABELS,
} from "@/domain/taxonomy/assessed-condition";
import {
  BATTERY_RECORD_STATUSES,
  BATTERY_RECORD_STATUS_LABELS,
} from "@/domain/taxonomy/battery-record-status";
import {
  CELL_FORM_FACTORS,
  CELL_FORM_FACTOR_LABELS,
} from "@/domain/taxonomy/cell-form-factor";
import { CHEMISTRIES, CHEMISTRY_LABELS } from "@/domain/taxonomy/chemistry";
import {
  DAMAGE_ASSESSMENT_METHOD_LABELS,
  DAMAGE_ASSESSMENT_METHODS,
} from "@/domain/taxonomy/damage-assessment-method";
import { DDR_FLAG_LABELS } from "@/domain/taxonomy/ddr-flag";
import {
  RECALL_MATCH_STATUSES,
  RECALL_MATCH_STATUS_LABELS,
} from "@/domain/taxonomy/recall-match-status";
import { readTaxonomyValue } from "@/domain/taxonomy/lookup";
import { STORAGE_CLOCK_ALERT_BAND_LABELS } from "@/domain/taxonomy/storage-clock-alert-band";
import type { BatteryRecord } from "@/types/battery-record";
import type { RecallMatch } from "@/types/condition";
import type { TimeZone } from "@/types/common";
import type { Container, StorageClock } from "@/types/storage";

import { absoluteInstant, UNPLACED_RECORD_TIME_ZONE } from "./format-instant";

/**
 * `/batteries` as CSV — `UX_SPEC.md` §3.5; D-50; Rules 12.17–12.19.
 *
 * The columns the screen shows, each as the screen words it, plus the facts a
 * reader takes a copy of the list for: the DDR flags and the air
 * prohibition, the part number, and the record's status. Every taxonomy value
 * is its label from its own lookup, and an unrecognised one exports as stored
 * — never blank, never coerced (TAXONOMY.md §5.8). **No probability,
 * percentage, likelihood or score appears in any column** (Rule 1.25).
 *
 * Pure: records and their decorations in, cells out.
 */

/** The column order, and the only place these headings exist. */
export const BATTERY_CSV_HEADERS = [
  "Record ID",
  "Manufacturer",
  "Model",
  "Part number",
  "Chemistry",
  "Form factor",
  "Assessed condition",
  "DDR flags",
  "Air transport prohibited",
  "Container",
  "Storage clock tier",
  "Logged",
  "Time zone",
  "Status",
  "Catalog matched",
  "Recall associations",
  "Identified by",
  "Damage assessed by",
] as const;

/**
 * Rule 1.29 — **Identified by**: a record whose identity the label read
 * supplied (a model, confirmed by a person at the gate) or one a person typed.
 * `UX_SPEC.md` §3.5 words both.
 */
export const IDENTIFIED_BY_MODEL = "AI suggested, confirmed by a person";
export const IDENTIFIED_BY_PERSON = "Entered by a person";

function label<T extends string>(
  values: readonly T[],
  labels: Readonly<Record<T, string>>,
  value: string | null,
): string {
  if (value === null) return "";
  const read = readTaxonomyValue(values, labels, value);
  return read.recognised ? read.label : read.storedValue;
}

export interface BatteryCsvContext {
  readonly containersById: ReadonlyMap<string, Container>;
  readonly clocksByContainerId: ReadonlyMap<string, StorageClock>;
  /**
   * Every recall association on each record, dismissed and withdrawn ones
   * included — Rules 6.24, 10.16: the confirmation and the withdrawal both
   * stay visible "in every export". Absent reads as none.
   */
  readonly recallsByRecordId?: ReadonlyMap<string, readonly RecallMatch[]>;
  /**
   * Rule 1.29 — the records whose session's label read supplied at least one
   * value. Absent reads as none: every record exports "Entered by a person".
   */
  readonly identifiedByModelRecordIds?: ReadonlySet<string>;
  /**
   * T-59 as stored, of each record's current assessment. A value outside
   * T-59 exports as stored and is never read as model-assisted (STATE §7 #1).
   */
  readonly assessmentMethodByRecordId?: ReadonlyMap<string, string>;
}

/** `26-041 (Possible match — needs review)`; a withdrawal says so. Never a number about the match. */
function recallAssociations(matches: readonly RecallMatch[]): string {
  return matches
    .map((match) => {
      const status = label(
        RECALL_MATCH_STATUSES,
        RECALL_MATCH_STATUS_LABELS,
        match.status,
      );
      const withdrawn =
        match.status === "dismissed" && match.confirmedBy !== null
          ? ", withdrawn"
          : "";
      return `${match.recallNumber ?? match.providerRecordId} (${status}${withdrawn})`;
    })
    .join("; ");
}

export function batteryCsvRow(
  record: BatteryRecord,
  context: BatteryCsvContext,
): readonly string[] {
  const container =
    record.containerId === null
      ? undefined
      : context.containersById.get(record.containerId);
  const clock =
    record.containerId === null
      ? undefined
      : context.clocksByContainerId.get(record.containerId);
  // Rule 4.29 — the record's instants read in its container's site zone.
  const timeZone: TimeZone =
    container?.siteTimeZone ?? UNPLACED_RECORD_TIME_ZONE;
  return [
    record.recordNumber,
    record.manufacturerName ?? "",
    record.modelName ?? "",
    record.partNumber ?? "",
    label(CHEMISTRIES, CHEMISTRY_LABELS, record.chemistry),
    label(CELL_FORM_FACTORS, CELL_FORM_FACTOR_LABELS, record.cellFormFactor),
    label(
      ASSESSED_CONDITIONS,
      ASSESSED_CONDITION_LABELS,
      record.assessedCondition,
    ),
    record.ddrFlags.map((flag) => DDR_FLAG_LABELS[flag]).join("; "),
    record.isAirTransportProhibited ? "Yes" : "No",
    container?.containerCode ?? "",
    clock === undefined ? "" : STORAGE_CLOCK_ALERT_BAND_LABELS[clock.alertBand],
    absoluteInstant(record.createdAt, timeZone),
    timeZone,
    label(BATTERY_RECORD_STATUSES, BATTERY_RECORD_STATUS_LABELS, record.status),
    record.catalogEntryId === null ? "No" : "Yes",
    recallAssociations(context.recallsByRecordId?.get(record.id) ?? []),
    context.identifiedByModelRecordIds?.has(record.id) === true
      ? IDENTIFIED_BY_MODEL
      : IDENTIFIED_BY_PERSON,
    label(
      DAMAGE_ASSESSMENT_METHODS,
      DAMAGE_ASSESSMENT_METHOD_LABELS,
      context.assessmentMethodByRecordId?.get(record.id) ?? null,
    ),
  ];
}
