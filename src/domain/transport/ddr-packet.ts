import type { IsoTimestamp, TimeZone } from "@/types/common";
import { printedInstant } from "@/domain/documents/document-identity";
import { ruleOutcome, type RuleOutcome } from "@/domain/rules/outcome";
import type { ResolvedRule } from "@/domain/rules/resolve";
import { CHEMISTRIES, CHEMISTRY_LABELS } from "@/domain/taxonomy/chemistry";
import {
  CONTAINER_TYPE_LABELS,
  CONTAINER_TYPES,
} from "@/domain/taxonomy/container-type";
import {
  DAMAGE_FINDING_TYPE_LABELS,
  DAMAGE_FINDING_TYPES,
} from "@/domain/taxonomy/damage-finding-type";
import { DDR_FLAG_LABELS, type DdrFlag } from "@/domain/taxonomy/ddr-flag";
import { readTaxonomyValue } from "@/domain/taxonomy/lookup";

import {
  appliedVersion,
  DDR_PACKAGING_RULE_KEY,
  ddrPackagingFamilyFor,
  readDdrPackagingRule,
  type DdrPackagingItem,
} from "./rule-data";

/**
 * The damaged/defective packet — `BUSINESS_RULES.md` Rules 6.15–6.17; T-38
 * `ddr_packet`; `SPEC_ddr-packaging-rule-data_2026-10-22.md`; D-71.
 *
 * **One packet per shipment that holds any record on the DDR path** — a DDR
 * flag or the air prohibition (Rule 6.16). It lists each such record with its
 * flags, its confirmed findings and who confirmed them, and the quarantine
 * container it is in (Rule 6.17); and for each record whose chemistry the
 * packaging rule covers, the packaging and marking the rule version carries,
 * **every item beside its own citation** (Rule 12.15).
 *
 * **Nothing here is a literal requirement.** The items, the marking text, its
 * minimum height and every citation are the rule version's payload (Rules
 * 1.23, 6.15). A record whose chemistry has **no rule on file** is listed with
 * the plain statement that says so, and the packet carries it as a gap that
 * **holds departure** (D-71) — the system never assumes packaging, the same as
 * D-58 #2. Air is forbidden for every record here already (Rules 6.7, 6.8);
 * the packet prints the rule's citation for it.
 */

/** Printed for a record whose chemistry no family of the rule covers — the spec's words. */
export const NO_PACKAGING_RULE_STATEMENT =
  "No damaged/defective packaging rule on file for this chemistry.";

/** Printed where the rule carries no packing level (D-58 #12) — the spec's words. */
export const PACKING_LEVEL_NOT_ON_FILE = "The packing level is not on file.";

/** Printed where a record's assessment names no confirmer. Never a guessed name. */
export const NOT_RECORDED = "Not recorded";

export interface DdrPacketRecordInput {
  readonly recordId: string;
  readonly recordNumber: string;
  /** T-01 as stored. */
  readonly chemistry: string | null;
  readonly chemistryConfirmed: boolean;
  readonly ddrFlags: readonly DdrFlag[];
  readonly isAirTransportProhibited: boolean;
  /** The current, human-confirmed assessment's findings (T-29), as stored. */
  readonly findings: readonly string[];
  /** Who confirmed that assessment, and when (Rule 6.6). */
  readonly assessedByName: string | null;
  readonly assessedAt: IsoTimestamp | null;
  readonly containerCode: string;
  /** T-23 as stored. */
  readonly containerType: string;
}

export interface DdrPacketInput {
  readonly shipmentNumber: string;
  /** The site's zone — every instant prints in it (Rule 4.29). */
  readonly timeZone: TimeZone;
  /** Every record on the shipment. Only the DDR path is listed. */
  readonly records: readonly DdrPacketRecordInput[];
  /** `transport.ddr_packaging` in force at the site on the date, or null. */
  readonly rule: ResolvedRule | null;
}

export type DdrPacketRecordEntry = {
  readonly recordId: string;
  readonly recordNumber: string;
  readonly chemistryLabel: string;
  readonly flagLabels: readonly string[];
  readonly findingLabels: readonly string[];
  readonly assessedBy: string;
  readonly assessedAtText: string;
  readonly containerCode: string;
  readonly containerTypeLabel: string;
  /** The rule's marking for the record's family; null when none is on file (D-71). */
  readonly marking: {
    readonly text: string;
    readonly citation: string;
  } | null;
};

/** A type, not an interface: it is the render's JSON snapshot (`TECHNICAL_SPEC.md` §8.2). */
export type DdrPacketContent = {
  readonly shipmentNumber: string;
  readonly timeZone: TimeZone;
  readonly records: readonly DdrPacketRecordEntry[];
  readonly packaging: readonly DdrPackagingItem[];
  /** The rule's packing level, or the statement that it is not on file. */
  readonly packingLevelText: string;
  /** The packing level's own citation, where the rule version carries one (v2). */
  readonly packingLevelCitation: string | null;
  readonly markingMinimumHeight: string;
  readonly markingMinimumHeightCitation: string;
  readonly air: { readonly requirement: string; readonly citation: string };
  /** Record numbers whose chemistry has no packaging rule on file — the departure hold (D-71). */
  readonly recordsWithoutPackagingRule: readonly string[];
  /** Exactly the DDR records the packet describes — sorted, for currency checks (Rule 5.13). */
  readonly recordIds: readonly string[];
};

export type DdrPacketBuild =
  /** No record on the shipment is on the DDR path. No packet is generated. */
  | { readonly kind: "not_required" }
  /**
   * DDR records are on the shipment and no packaging rule version is in force
   * or readable — nothing to generate the packet from, so none is, and
   * departure holds as the packet missing (Rule 6.16).
   */
  | { readonly kind: "no_rule"; readonly recordNumbers: readonly string[] }
  | {
      readonly kind: "packet";
      readonly outcome: RuleOutcome<DdrPacketContent>;
    };

/** On the DDR path: a flag, or the stored prohibition (Rule 6.16; T-30). */
export function onDdrPath(record: {
  readonly ddrFlags: readonly DdrFlag[];
  readonly isAirTransportProhibited: boolean;
}): boolean {
  return record.ddrFlags.length > 0 || record.isAirTransportProhibited;
}

function label<T extends string>(
  values: readonly T[],
  labels: Readonly<Record<T, string>>,
  value: string,
): string {
  const read = readTaxonomyValue(values, labels, value);
  return read.recognised ? read.label : read.storedValue;
}

export function buildDdrPacketContent(input: DdrPacketInput): DdrPacketBuild {
  const ddr = input.records
    .filter(onDdrPath)
    .sort((a, b) => a.recordNumber.localeCompare(b.recordNumber));
  if (ddr.length === 0) return { kind: "not_required" };

  const rule = input.rule === null ? null : readDdrPackagingRule(input.rule);
  if (input.rule === null || rule === null) {
    return {
      kind: "no_rule",
      recordNumbers: ddr.map((record) => record.recordNumber),
    };
  }

  const records: DdrPacketRecordEntry[] = ddr.map((record) => {
    // An unconfirmed chemistry is no chemistry: no family can be read from
    // it, so it is listed as having no rule on file (D-71).
    const family = record.chemistryConfirmed
      ? ddrPackagingFamilyFor(rule, record.chemistry)
      : null;
    return {
      recordId: record.recordId,
      recordNumber: record.recordNumber,
      chemistryLabel:
        record.chemistry === null || !record.chemistryConfirmed
          ? CHEMISTRY_LABELS.unknown
          : label(CHEMISTRIES, CHEMISTRY_LABELS, record.chemistry),
      flagLabels: record.ddrFlags.map((flag) => DDR_FLAG_LABELS[flag]),
      findingLabels: record.findings.map((finding) =>
        label(DAMAGE_FINDING_TYPES, DAMAGE_FINDING_TYPE_LABELS, finding),
      ),
      assessedBy: record.assessedByName ?? NOT_RECORDED,
      assessedAtText:
        record.assessedAt === null
          ? NOT_RECORDED
          : printedInstant(record.assessedAt, input.timeZone),
      containerCode: record.containerCode,
      containerTypeLabel: label(
        CONTAINER_TYPES,
        CONTAINER_TYPE_LABELS,
        record.containerType,
      ),
      marking:
        family === null
          ? null
          : { text: family.markingText, citation: rule.marking.citation },
    };
  });

  const recordsWithoutPackagingRule = records
    .filter((record) => record.marking === null)
    .map((record) => record.recordNumber);
  const recordIds = records.map((record) => record.recordId).sort();

  return {
    kind: "packet",
    outcome: ruleOutcome({
      result: {
        shipmentNumber: input.shipmentNumber,
        timeZone: input.timeZone,
        records,
        packaging: rule.packaging,
        packingLevelText: rule.packingLevel?.text ?? PACKING_LEVEL_NOT_ON_FILE,
        packingLevelCitation: rule.packingLevel?.citation ?? null,
        markingMinimumHeight: rule.marking.minimumHeight,
        markingMinimumHeightCitation: rule.marking.minimumHeightCitation,
        air: rule.air,
        recordsWithoutPackagingRule,
        recordIds,
      },
      reasoning:
        `Damaged/defective packet for ${input.shipmentNumber}: ${records.length} ${records.length === 1 ? "record" : "records"} on the damaged, defective or recalled path, ` +
        `the packaging and marking the governing rule version carries for each covered chemistry, each with its citation` +
        (recordsWithoutPackagingRule.length === 0
          ? "."
          : `; ${recordsWithoutPackagingRule.join(", ")} ${recordsWithoutPackagingRule.length === 1 ? "has" : "have"} no packaging rule on file for its chemistry, and departure holds until one is or the record leaves the shipment.`),
      ruleVersionsApplied: [
        appliedVersion(
          input.rule,
          { recordIds },
          recordsWithoutPackagingRule.length === 0
            ? "ddr_packet"
            : "ddr_packet_with_gaps",
        ),
      ],
      inputsSnapshot: { shipmentNumber: input.shipmentNumber, recordIds },
      context: DDR_PACKAGING_RULE_KEY,
    }),
  };
}
