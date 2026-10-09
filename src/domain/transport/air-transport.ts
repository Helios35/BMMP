import {
  DAMAGED_OR_DEFECTIVE_FINDING_TYPES,
  DAMAGE_FINDING_TYPES,
  DAMAGE_FINDING_TYPE_LABELS,
  type DamageFindingType,
} from "@/domain/taxonomy/damage-finding-type";
import { DDR_FLAG_LABELS, type DdrFlag } from "@/domain/taxonomy/ddr-flag";
import { isTaxonomyValue } from "@/domain/taxonomy/lookup";
import type { TransportMode } from "@/domain/taxonomy/transport-mode";

/**
 * The air prohibition — `BUSINESS_RULES.md` Rules 5.11, 6.4, 6.5, 6.7–6.9,
 * 6.13; T-18, T-30.
 *
 * **A block, not a warning.** Where any record in scope is damaged, defective
 * or recalled, the air mode is unavailable for the shipment. This module
 * decides that and nothing else: the screen renders the decision and the
 * adapter refuses on it, and **neither re-derives it** (`TECHNICAL_SPEC.md`
 * §11.2). There is no parameter here that admits air for a flagged record,
 * because there is no override — not for P1, not for P6, not by setting,
 * grant, import or API call (Rule 6.8). A builder who adds one has introduced
 * a compliance defect, not a feature.
 *
 * **Fails closed.** A record blocks when it carries any DDR flag *or* the
 * stored prohibition — either fact is enough, and the two are never weighed
 * against each other. A record whose finding cannot be named still blocks; it
 * is named by its flag instead (Rule 6.9 wants the indicator, and the flag is
 * the indicator the record carries).
 *
 * Mechanical and two-valued: no severity, no score, and never a probability of
 * anything (Rule 1.25).
 */

/** The fact on one record that put it on the DDR path — Rule 6.9's "specific indicator". */
export type AirBlockIndicator =
  /** A confirmed finding in T-29's damaged-or-defective set (Rule 6.4). */
  | { readonly kind: "finding"; readonly finding: DamageFindingType }
  /**
   * A flag with no finding behind it: `defective` (functional, human-recorded),
   * `recalled` (an active recall association — named as a recall, never as
   * damage, §2.6), or `damaged` where the confirming assessment's findings are
   * not on hand.
   */
  | { readonly kind: "flag"; readonly flag: DdrFlag };

export interface AirTransportSubject {
  readonly recordId: string;
  readonly recordNumber: string;
  readonly ddrFlags: readonly DdrFlag[];
  readonly isAirTransportProhibited: boolean;
  /** The current damage assessment's findings, as stored. Empty where none is on hand. */
  readonly currentFindings: readonly string[];
  /**
   * The citation of the rule version that set the record's condition
   * (`battery_record.condition_rule_version_id`) — "the citation carried by
   * the governing rule version" (Rule 6.9). Null where none is recorded.
   */
  readonly citation: string | null;
}

export interface AirBlockingRecord {
  readonly recordId: string;
  readonly recordNumber: string;
  /** Never empty. */
  readonly indicators: readonly AirBlockIndicator[];
  readonly citation: string | null;
}

export type AirTransportAssessment =
  | { readonly available: true }
  | {
      readonly available: false;
      /** Every record causing the block, in record-number order. Never empty. */
      readonly blockingRecords: readonly AirBlockingRecord[];
      /**
       * Every distinct citation the blocking records carry. **Empty means no
       * citation is on file** — the block holds regardless, and the notice
       * says the citation is missing rather than printing one of its own
       * (Rule 1.23).
       */
      readonly citations: readonly string[];
    };

function indicatorsFor(subject: AirTransportSubject): AirBlockIndicator[] {
  const indicators: AirBlockIndicator[] = [];
  const findings = DAMAGE_FINDING_TYPES.filter(
    (finding) =>
      subject.currentFindings.includes(finding) &&
      isTaxonomyValue(DAMAGED_OR_DEFECTIVE_FINDING_TYPES, finding),
  );
  if (subject.ddrFlags.includes("damaged")) {
    if (findings.length > 0) {
      for (const finding of findings) {
        indicators.push({ kind: "finding", finding });
      }
    } else {
      indicators.push({ kind: "flag", flag: "damaged" });
    }
  }
  if (subject.ddrFlags.includes("defective")) {
    indicators.push({ kind: "flag", flag: "defective" });
  }
  if (subject.ddrFlags.includes("recalled")) {
    indicators.push({ kind: "flag", flag: "recalled" });
  }
  // The stored prohibition with no flag behind it is a row that disagrees with
  // itself; it still blocks, named by the only fact it carries.
  if (indicators.length === 0) {
    indicators.push({ kind: "flag", flag: "damaged" });
  }
  return indicators;
}

function blocks(subject: AirTransportSubject): boolean {
  return subject.ddrFlags.length > 0 || subject.isAirTransportProhibited;
}

/** Whether air is available for a shipment holding these records, and if not, who blocks it and why. */
export function assessAirTransport(
  subjects: readonly AirTransportSubject[],
): AirTransportAssessment {
  const blocking = subjects
    .filter(blocks)
    .map((subject): AirBlockingRecord => ({
      recordId: subject.recordId,
      recordNumber: subject.recordNumber,
      indicators: indicatorsFor(subject),
      citation: subject.citation,
    }))
    .sort((a, b) => a.recordNumber.localeCompare(b.recordNumber));

  if (blocking.length === 0) return { available: true };

  const citations = [
    ...new Set(
      blocking
        .map((record) => record.citation)
        .filter((citation): citation is string => citation !== null),
    ),
  ];
  return { available: false, blockingRecords: blocking, citations };
}

/** Whether a mode may be chosen for a shipment with this assessment. Air is the only mode the block reaches (T-18). */
export function isModeAvailable(
  mode: TransportMode,
  assessment: AirTransportAssessment,
): boolean {
  return mode !== "air" || assessment.available;
}

/** The plain-language statement of the prohibition (Rule 6.9; `UX_SPEC.md` §2.6). */
export const AIR_PROHIBITION_STATEMENT =
  "Damaged, defective and recalled batteries are prohibited from air transport.";

/** Rule 6.9's specific indicator, in words: the finding's label, the flag's, or a recall named as a recall. */
export function airBlockIndicatorText(indicator: AirBlockIndicator): string {
  if (indicator.kind === "finding") {
    return DAMAGE_FINDING_TYPE_LABELS[indicator.finding].toLowerCase();
  }
  return indicator.flag === "recalled"
    ? "recall association"
    : DDR_FLAG_LABELS[indicator.flag].toLowerCase();
}

/**
 * The server's refusal of an air request, in the same words the notice uses —
 * the records, the indicator behind each, and the three ways forward (Rules
 * 6.9, 6.10). Nothing here offers a fourth.
 */
export function airTransportRefusal(
  assessment: Extract<AirTransportAssessment, { readonly available: false }>,
): string {
  const records = assessment.blockingRecords
    .map(
      (record) =>
        `${record.recordNumber} (${record.indicators.map(airBlockIndicatorText).join(", ")})`,
    )
    .join(", ");
  return (
    `Air transport is not available for this shipment. ${AIR_PROHIBITION_STATEMENT} ` +
    `Blocking: ${records}. Ship by ground, rail or vessel; remove these records and ship the rest by air; ` +
    "or re-assess the damage on a record."
  );
}
