import type { RecallStanding } from "@/domain/recalls/standing";
import { CHEMISTRIES, CHEMISTRY_LABELS } from "@/domain/taxonomy/chemistry";
import {
  COSMETIC_FINDING_TYPES,
  DAMAGED_OR_DEFECTIVE_FINDING_TYPES,
} from "@/domain/taxonomy/damage-finding-type";
import type { HazardFactorCode } from "@/domain/taxonomy/hazard-factor-code";
import { readTaxonomyValue } from "@/domain/taxonomy/lookup";
import {
  STATE_OF_CHARGE_BANDS,
  STATE_OF_CHARGE_BAND_LABELS,
} from "@/domain/taxonomy/state-of-charge-band";
import { addDecimal, isDecimalString } from "@/domain/units";
import type {
  Decimal,
  IsoDate,
  IsoTimestamp,
  JsonValue,
  TimeZone,
  Uuid,
} from "@/types/common";

import {
  NOT_RECORDED_LEVEL,
  schemeFactor,
  type HazardRankingScheme,
  type SchemeFactor,
} from "./scheme";
import { basisCivilDate, basisDay, wattHours } from "./words";

/**
 * Each factor's level for one item, and where it came from — Rules 10.20,
 * 10.22; T-34.
 *
 * **Every reading is from the confirmed record, never a proposal**: the
 * current human assessment, the recall standing, the confirmed chemistry, the
 * T-21 band, the manufacture date and the marks read from the label. The
 * evidence becomes a level through the scheme; **evidence the scheme does not
 * place reads "Not recorded" and ranks level with the factor's highest level**
 * — a gap never moves an item down (Rule 10.20). That includes T-01 `other`,
 * T-21 `not_captured`, a recall standing of `not_checked` and a value this
 * build does not recognise (STATE §7 #1).
 *
 * The input shapes are this module's own and name only what it reads; the
 * stored rows satisfy them as they are.
 */

export interface RankingBatteryInput {
  readonly id: Uuid;
  readonly recordNumber: string;
  readonly status: string;
  readonly containerId: Uuid | null;
  readonly chemistry: string | null;
  readonly chemistryConfirmedBy: Uuid | null;
  readonly chemistryConfirmedAt: IsoTimestamp | null;
  readonly stateOfChargeBand: string;
  readonly manufacturedOn: IsoDate | null;
  readonly certificationMarks: JsonValue | null;
  readonly ratedEnergyWh: Decimal | null;
  readonly ddrFlags: readonly string[];
}

export interface RankingAssessmentInput {
  readonly id: Uuid;
  readonly batteryRecordId: Uuid;
  readonly status: string;
  readonly findingTypes: readonly string[];
  readonly assessedAt: IsoTimestamp;
  readonly assessedBy: Uuid | null;
  readonly createdAt: IsoTimestamp;
  readonly supersedesDamageAssessmentId: Uuid | null;
}

export interface FactorReading {
  readonly code: HazardFactorCode;
  /** The scheme level, or {@link NOT_RECORDED_LEVEL}. */
  readonly level: string;
  /** The level's label, or the factor's "Not recorded" label. */
  readonly label: string;
  /** `0` is the highest level. "Not recorded" is `0` (Rule 10.20). */
  readonly rankIndex: number;
  /** Where the level came from, in words (Rule 10.25). */
  readonly basis: string;
  /** What was read, for "Changed since" (Rule 10.24). Never shown. */
  readonly inputRef: string;
}

export interface ReadingContext {
  readonly asOf: IsoTimestamp;
  readonly timeZone: TimeZone;
  readonly names: ReadonlyMap<Uuid, string>;
}

/** The evidence a factor read: a stored value, a number, or nothing recorded. */
interface Evidence {
  readonly value: string | number | null;
  readonly basis: string;
  readonly inputRef: string;
}

function notRecorded(factor: SchemeFactor, evidence: Evidence): FactorReading {
  return {
    code: factor.code,
    level: NOT_RECORDED_LEVEL,
    label: factor.notRecordedLabel,
    rankIndex: 0,
    basis: evidence.basis,
    inputRef: evidence.inputRef,
  };
}

/** Evidence becomes a level through the scheme, or reads "Not recorded". */
export function levelFor(
  factor: SchemeFactor,
  evidence: Evidence,
): FactorReading {
  const { value } = evidence;
  if (value === null) return notRecorded(factor, evidence);
  let index = -1;
  if (factor.reading === "matched") {
    if (typeof value === "string") {
      index = factor.levels.findIndex((level) =>
        level.evidenceValues.includes(value),
      );
    }
  } else if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0
  ) {
    index = factor.levels.findIndex((level) => value >= level.atLeast);
  }
  const level = index === -1 ? undefined : factor.levels[index];
  if (level === undefined) return notRecorded(factor, evidence);
  return {
    code: factor.code,
    level: level.level,
    label: level.label,
    rankIndex: index,
    basis: evidence.basis,
    inputRef: evidence.inputRef,
  };
}

function nameOf(ctx: ReadingContext, id: Uuid | null): string | null {
  return id === null ? null : (ctx.names.get(id) ?? null);
}

// --- damage indicators -------------------------------------------------------------------------

/** The record's current assessment: the newest that no later one superseded. */
export function currentAssessment(
  assessments: readonly RankingAssessmentInput[],
): RankingAssessmentInput | null {
  const superseded = new Set(
    assessments
      .map((row) => row.supersedesDamageAssessmentId)
      .filter((id): id is Uuid => id !== null),
  );
  const live = assessments.filter(
    (row) => row.status !== "superseded" && !superseded.has(row.id),
  );
  const [newest] = [...live].sort(
    (a, b) =>
      b.assessedAt.localeCompare(a.assessedAt) ||
      b.createdAt.localeCompare(a.createdAt),
  );
  return newest ?? null;
}

/**
 * The damage evidence — T-29's two-way split and T-30's flags, and nothing
 * else (Rule 6.4). A `damaged` or `defective` flag is damaged or defective
 * whatever the findings; with no assessment and no flag, nothing is recorded.
 */
export function damageEvidenceValue(
  assessment: RankingAssessmentInput | null,
  ddrFlags: readonly string[],
): "damaged_or_defective" | "cosmetic_only" | "none_observed" | null {
  if (ddrFlags.includes("damaged") || ddrFlags.includes("defective")) {
    return "damaged_or_defective";
  }
  if (assessment === null || assessment.status === "not_assessed") return null;
  const findings = assessment.findingTypes;
  if (
    findings.some((finding) =>
      (DAMAGED_OR_DEFECTIVE_FINDING_TYPES as readonly string[]).includes(
        finding,
      ),
    )
  ) {
    return "damaged_or_defective";
  }
  if (
    findings.some((finding) =>
      (COSMETIC_FINDING_TYPES as readonly string[]).includes(finding),
    )
  ) {
    return "cosmetic_only";
  }
  if (findings.includes("none_observed")) return "none_observed";
  return null;
}

function damageEvidence(
  battery: RankingBatteryInput,
  assessments: readonly RankingAssessmentInput[],
  ctx: ReadingContext,
): Evidence {
  const assessment = currentAssessment(assessments);
  const value = damageEvidenceValue(assessment, battery.ddrFlags);
  const flags = [...battery.ddrFlags].sort().join("+");
  const inputRef = `assessment:${assessment?.id ?? "none"};flags:${flags}`;
  if (assessment === null) {
    return {
      value,
      basis:
        value === null
          ? "no damage assessment on the record"
          : "a DDR flag on the record, with no damage assessment",
      inputRef,
    };
  }
  const day = basisDay(assessment.assessedAt, ctx.timeZone);
  const who = nameOf(ctx, assessment.assessedBy);
  return {
    value,
    basis: who === null ? `assessment ${day}` : `assessment ${day} by ${who}`,
    inputRef,
  };
}

// --- recall status -----------------------------------------------------------------------------

function recallEvidence(
  standing: RecallStanding,
  matchRefs: readonly string[],
  ctx: ReadingContext,
): Evidence {
  // The standing and the decisions on the record — not when it was last
  // checked, so a nightly run that finds the same thing changes nothing.
  const inputRef = `standing:${standing.status};matches:${[...matchRefs].sort().join(",")}`;
  const when =
    standing.lastCheckedAt === null
      ? null
      : basisDay(standing.lastCheckedAt, ctx.timeZone);
  switch (standing.status) {
    case "confirmed_match":
      return {
        value: standing.status,
        basis: "a confirmed recall on the record",
        inputRef,
      };
    case "possible_match":
      return {
        value: standing.status,
        basis: "an open possible match on the record",
        inputRef,
      };
    case "no_match":
      return {
        value: standing.status,
        basis:
          when === null
            ? "no match on any source"
            : `checked ${when}; no match on any source`,
        inputRef,
      };
    case "not_checked":
      return {
        value: standing.status,
        basis:
          standing.reason === "source_unavailable"
            ? `not checked — the source was unavailable${when === null ? "" : ` on ${when}`}`
            : standing.reason === "nothing_to_match"
              ? "not checked — nothing to match against"
              : "never checked",
        inputRef,
      };
  }
}

// --- chemistry ---------------------------------------------------------------------------------

function chemistryEvidence(
  battery: RankingBatteryInput,
  ctx: ReadingContext,
): Evidence {
  const stored = battery.chemistry;
  const inputRef = `chemistry:${stored ?? ""}`;
  if (stored === null) {
    return { value: null, basis: "no confirmed chemistry", inputRef };
  }
  const read = readTaxonomyValue(CHEMISTRIES, CHEMISTRY_LABELS, stored);
  if (!read.recognised) {
    return {
      value: null,
      basis: `chemistry stored as ${read.storedValue}, a value this build does not recognise`,
      inputRef,
    };
  }
  const who = nameOf(ctx, battery.chemistryConfirmedBy);
  const when =
    battery.chemistryConfirmedAt === null
      ? null
      : basisDay(battery.chemistryConfirmedAt, ctx.timeZone);
  const confirmed =
    who === null
      ? when === null
        ? ""
        : `, ${when}`
      : `, by ${who}${when === null ? "" : ` on ${when}`}`;
  return {
    value: stored,
    basis: `confirmed chemistry: ${read.label}${confirmed}`,
    inputRef,
  };
}

// --- charge at intake --------------------------------------------------------------------------

function chargeEvidence(battery: RankingBatteryInput): Evidence {
  const stored = battery.stateOfChargeBand;
  const inputRef = `charge:${stored}`;
  const read = readTaxonomyValue(
    STATE_OF_CHARGE_BANDS,
    STATE_OF_CHARGE_BAND_LABELS,
    stored,
  );
  if (!read.recognised) {
    return {
      value: null,
      basis: `charge band stored as ${read.storedValue}, a value this build does not recognise`,
      inputRef,
    };
  }
  if (read.storedValue === "not_captured") {
    return {
      value: stored,
      basis: "no charge reading was taken at intake",
      inputRef,
    };
  }
  // No percentage, not even the reading itself: the T-21 label (Rule 10.20).
  return {
    value: stored,
    basis: `charge band recorded at intake: ${read.label}`,
    inputRef,
  };
}

// --- age from date code ------------------------------------------------------------------------

/** Whole years from a civil date to another, or `null` when the first is later. */
export function wholeYearsBetween(from: IsoDate, to: IsoDate): number | null {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  if (
    fy === undefined ||
    fm === undefined ||
    fd === undefined ||
    ty === undefined ||
    tm === undefined ||
    td === undefined ||
    [fy, fm, fd, ty, tm, td].some((part) => !Number.isInteger(part))
  ) {
    return null;
  }
  let years = ty - fy;
  if (tm < fm || (tm === fm && td < fd)) years -= 1;
  return years < 0 ? null : years;
}

function civilDateIn(instant: IsoTimestamp, timeZone: TimeZone): IsoDate {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instant));
}

const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/;

function ageEvidence(
  battery: RankingBatteryInput,
  ctx: ReadingContext,
): Evidence {
  const made = battery.manufacturedOn;
  const inputRef = `made:${made ?? ""}`;
  if (made === null || !CIVIL_DATE.test(made)) {
    return {
      value: null,
      basis: "no manufacture date on the record",
      inputRef,
    };
  }
  const years = wholeYearsBetween(made, civilDateIn(ctx.asOf, ctx.timeZone));
  if (years === null) {
    return {
      value: null,
      basis: `manufacture date ${basisCivilDate(made)} is later than the as-of date`,
      inputRef,
    };
  }
  return {
    value: years,
    basis: `manufactured ${basisCivilDate(made)}, ${years} ${years === 1 ? "year" : "years"} before the as-of date`,
    inputRef,
  };
}

// --- certification marks -----------------------------------------------------------------------

/**
 * The marks read from the label. `null` is never captured — "Not recorded";
 * an empty list is a label read with no marks on it — "None read".
 */
export function certificationMarksRead(
  value: JsonValue | null,
): readonly string[] | null {
  if (value === null) return null;
  if (typeof value === "string") {
    return value.trim() === "" ? [] : [value.trim()];
  }
  if (Array.isArray(value)) {
    if (!value.every((item) => typeof item === "string")) return null;
    return (value as readonly string[])
      .map((item) => item.trim())
      .filter((item) => item !== "");
  }
  return null;
}

function marksEvidence(battery: RankingBatteryInput): Evidence {
  const marks = certificationMarksRead(battery.certificationMarks);
  const inputRef = `marks:${JSON.stringify(battery.certificationMarks)}`;
  if (marks === null) {
    return { value: null, basis: "marks never captured", inputRef };
  }
  if (marks.length === 0) {
    return {
      value: "none_read",
      basis: "the label was read and no marks were found on it",
      inputRef,
    };
  }
  return {
    value: "marks_read",
    basis: `marks read from the label: ${marks.join(", ")}`,
    inputRef,
  };
}

// --- one battery -------------------------------------------------------------------------------

export interface BatteryReadingInput {
  readonly battery: RankingBatteryInput;
  readonly assessments: readonly RankingAssessmentInput[];
  readonly standing: RecallStanding;
  /** `<id>:<status>` per recall match on the record. */
  readonly recallMatchRefs: readonly string[];
}

/** A battery's reading on each factor, in the order given. */
export function batteryReadings(
  input: BatteryReadingInput,
  order: readonly HazardFactorCode[],
  scheme: HazardRankingScheme,
  ctx: ReadingContext,
): readonly FactorReading[] {
  return order.map((code) => {
    const factor = schemeFactor(scheme, code);
    switch (code) {
      case "damage_indicators":
        return levelFor(
          factor,
          damageEvidence(input.battery, input.assessments, ctx),
        );
      case "recall_status":
        return levelFor(
          factor,
          recallEvidence(input.standing, input.recallMatchRefs, ctx),
        );
      case "chemistry":
        return levelFor(factor, chemistryEvidence(input.battery, ctx));
      case "state_of_charge_at_intake":
        return levelFor(factor, chargeEvidence(input.battery));
      case "age_from_date_code":
        return levelFor(factor, ageEvidence(input.battery, ctx));
      case "certification_marks":
        return levelFor(factor, marksEvidence(input.battery));
      case "storage_aggregation":
        // A battery is never ranked on aggregation (Rule 10.22); the scheme
        // validation refuses an order that asks for it.
        throw new Error("storage_aggregation is not a battery factor.");
    }
  });
}

// --- containers and lots -----------------------------------------------------------------------

export interface GroupMember {
  readonly id: Uuid;
  readonly label: string;
  readonly ratedEnergyWh: Decimal | null;
  /** The member's own readings, by factor. */
  readonly readings: ReadonlyMap<HazardFactorCode, FactorReading>;
}

/**
 * A container or lot on one battery factor: **its batteries' highest level**
 * (Rule 10.22). "Not recorded" ties with the highest level, so a container
 * holding a battery with nothing recorded is never placed below one holding
 * a battery at the top level; where they tie, the recorded level is the one
 * shown.
 */
function groupFactorReading(
  factor: SchemeFactor,
  members: readonly GroupMember[],
): FactorReading {
  const readings = members
    .map((member) => ({ member, reading: member.readings.get(factor.code) }))
    .filter(
      (entry): entry is { member: GroupMember; reading: FactorReading } =>
        entry.reading !== undefined,
    );
  const best = Math.min(...readings.map((entry) => entry.reading.rankIndex));
  const atBest = readings.filter((entry) => entry.reading.rankIndex === best);
  const shown =
    atBest.find((entry) => entry.reading.level !== NOT_RECORDED_LEVEL) ??
    atBest[0];
  const inputRef = readings
    .map((entry) => `${entry.member.id}=${entry.reading.inputRef}`)
    .sort()
    .join(",");
  if (shown === undefined) {
    return {
      code: factor.code,
      level: NOT_RECORDED_LEVEL,
      label: factor.notRecordedLabel,
      rankIndex: 0,
      basis: "no battery to read",
      inputRef,
    };
  }
  return {
    ...shown.reading,
    basis: `${shown.member.label}: ${shown.reading.basis}`,
    inputRef,
  };
}

/**
 * Storage aggregation: the rated energy held together, in the scheme's bands
 * (Rule 10.22). **Any battery with no rated energy makes it "Not fully
 * recorded"**, level with the highest band — an unknown amount is never read
 * as a small one.
 */
function aggregationReading(
  factor: SchemeFactor,
  members: readonly GroupMember[],
): FactorReading {
  const sorted = [...members].sort((a, b) => a.label.localeCompare(b.label));
  const inputRef = `members:${sorted.map((member) => `${member.id}=${member.ratedEnergyWh ?? ""}`).join(",")}`;
  const unknown = sorted.filter(
    (member) =>
      member.ratedEnergyWh === null || !isDecimalString(member.ratedEnergyWh),
  );
  if (unknown.length > 0) {
    return levelFor(factor, {
      value: null,
      basis: `rated energy not recorded for ${unknown.map((member) => member.label).join(", ")}`,
      inputRef,
    });
  }
  const held = sorted.reduce(
    (sum, member) => addDecimal(sum, member.ratedEnergyWh as Decimal),
    "0",
  );
  const count = sorted.length;
  return levelFor(factor, {
    value: Number(held),
    basis: `rated energy held together: ${wattHours(held)} across ${count} ${count === 1 ? "battery" : "batteries"}`,
    inputRef,
  });
}

/** A container's or lot's reading on each factor, in the order given. */
export function groupReadings(
  members: readonly GroupMember[],
  order: readonly HazardFactorCode[],
  scheme: HazardRankingScheme,
): readonly FactorReading[] {
  return order.map((code) => {
    const factor = schemeFactor(scheme, code);
    return code === "storage_aggregation"
      ? aggregationReading(factor, members)
      : groupFactorReading(factor, members);
  });
}
