import {
  HAZARD_FACTOR_CODES,
  type HazardFactorCode,
} from "@/domain/taxonomy/hazard-factor-code";
import { HAZARD_RANKING_BANDS } from "@/domain/taxonomy/hazard-ranking-band";
import {
  HAZARD_RANKING_SCOPES,
  type HazardRankingScope,
} from "@/domain/taxonomy/hazard-ranking-scope";
import { isTaxonomyValue } from "@/domain/taxonomy/lookup";

import { containsProhibitedRankingWord } from "./words";

/**
 * The ranking scheme — Rules 10.20–10.23, Rule 1.23; D-40, D-77 #2.
 *
 * **The order, the levels, the age bands, the aggregation energy bands and the
 * band cut points are data, never code.** They are versioned platform
 * configuration read through `platformConfiguration.readHazardRankingScheme`
 * and handed in; this module holds the shape and its validation, and no level,
 * band or cut point lives here. Changing the order is a new scheme version,
 * stamped on every row it produces, so a ranking can be re-explained after
 * the scheme moves on (Rule 12.15).
 *
 * What *is* code is how each factor's evidence is read — a T-01 value is
 * matched, an age is a number of whole years, an aggregation is watt-hours —
 * because that is the shape of the record, not a judgment about hazard
 * ({@link FACTOR_READINGS}).
 */

/** The level a factor reads when nothing is recorded (Rule 10.20). No scheme level may use it. */
export const NOT_RECORDED_LEVEL = "not_recorded";

/** A level a factor's evidence value is matched to, by stored value. */
export interface MatchedLevel {
  /** Lower `snake_case`; stored on the row's factor entry. */
  readonly level: string;
  readonly label: string;
  /** The evidence values that read as this level. A value in none reads "Not recorded". */
  readonly evidenceValues: readonly string[];
}

/** A band a factor's number falls in — the first, highest first, whose lower bound it reaches. */
export interface BandedLevel {
  readonly level: string;
  readonly label: string;
  /** Inclusive lower bound, in the factor's unit. The last band's is `0`. */
  readonly atLeast: number;
}

export type SchemeFactor =
  | {
      readonly code: HazardFactorCode;
      readonly reading: "matched";
      /** Highest first. */
      readonly levels: readonly MatchedLevel[];
      readonly notRecordedLabel: string;
    }
  | {
      readonly code: HazardFactorCode;
      readonly reading: "banded";
      readonly unit: BandedUnit;
      /** Highest first. */
      readonly levels: readonly BandedLevel[];
      readonly notRecordedLabel: string;
    };

export type BandedUnit = "years" | "watt_hours";

export interface HazardRankingScheme {
  readonly schemeVersion: string;
  /** Per T-67 scope, the factors in the order they are compared (Rule 10.21). */
  readonly factorOrder: Readonly<
    Record<HazardRankingScope, readonly HazardFactorCode[]>
  >;
  readonly factors: readonly SchemeFactor[];
  /**
   * Ascending, strictly between 0 and 1; one fewer than the T-33 bands
   * (`band_1`…`band_4`). Below the first is Band 1; up to each next is the
   * next band; the rest is the last (Rule 10.23).
   */
  readonly bandCutPoints: readonly number[];
}

/** How each factor's evidence is read — the record's shape, not a hazard judgment. */
export const FACTOR_READINGS: Readonly<
  Record<
    HazardFactorCode,
    | { readonly reading: "matched" }
    | { readonly reading: "banded"; readonly unit: BandedUnit }
  >
> = {
  damage_indicators: { reading: "matched" },
  recall_status: { reading: "matched" },
  chemistry: { reading: "matched" },
  state_of_charge_at_intake: { reading: "matched" },
  age_from_date_code: { reading: "banded", unit: "years" },
  certification_marks: { reading: "matched" },
  storage_aggregation: { reading: "banded", unit: "watt_hours" },
};

/** T-34 — `storage_aggregation` applies to containers and lots only (Rule 10.22). */
export const GROUP_ONLY_FACTOR: HazardFactorCode = "storage_aggregation";

/** The T-33 bands a position can fall in — every value but `not_ranked`. */
export const PLACED_BANDS = HAZARD_RANKING_BANDS.filter(
  (band) => band !== "not_ranked",
);

export type HazardRankingSchemeValidation =
  | { readonly ok: true; readonly scheme: HazardRankingScheme }
  | { readonly ok: false; readonly issues: readonly string[] };

const LEVEL_CODE = /^[a-z][a-z0-9_]*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function validateLabel(
  issues: string[],
  where: string,
  value: unknown,
): value is string {
  if (!isText(value)) {
    issues.push(`${where} must be a non-empty string`);
    return false;
  }
  if (containsProhibitedRankingWord(value)) {
    issues.push(`${where} "${value}" uses a word no ranking may carry`);
    return false;
  }
  return true;
}

function validateOrder(
  issues: string[],
  value: unknown,
): value is Record<HazardRankingScope, readonly HazardFactorCode[]> {
  if (!isRecord(value)) {
    issues.push("factorOrder must be an object keyed by scope");
    return false;
  }
  let ok = true;
  for (const scope of HAZARD_RANKING_SCOPES) {
    const order = value[scope];
    if (
      !Array.isArray(order) ||
      order.length === 0 ||
      !order.every(
        (code) =>
          typeof code === "string" &&
          isTaxonomyValue(HAZARD_FACTOR_CODES, code),
      ) ||
      new Set(order).size !== order.length
    ) {
      issues.push(
        `factorOrder.${scope} must list distinct T-34 factor codes, at least one`,
      );
      ok = false;
    }
  }
  if (!ok) return false;
  const battery = value.battery_record as readonly HazardFactorCode[];
  if (battery.includes(GROUP_ONLY_FACTOR)) {
    issues.push(
      "factorOrder.battery_record must not carry storage_aggregation (Rule 10.22)",
    );
    ok = false;
  }
  for (const scope of ["container", "lot"] as const) {
    const order = value[scope] as readonly HazardFactorCode[];
    const expected = new Set<HazardFactorCode>([...battery, GROUP_ONLY_FACTOR]);
    if (
      order.length !== expected.size ||
      !order.every((code) => expected.has(code))
    ) {
      issues.push(
        `factorOrder.${scope} must carry every battery factor and storage_aggregation (Rule 10.22)`,
      );
      ok = false;
    }
  }
  return ok;
}

function validateFactor(issues: string[], value: unknown, index: number): void {
  const where = `factors[${index}]`;
  if (!isRecord(value)) {
    issues.push(`${where} must be an object`);
    return;
  }
  const code = value.code;
  if (typeof code !== "string" || !isTaxonomyValue(HAZARD_FACTOR_CODES, code)) {
    issues.push(`${where}.code must be a T-34 factor code`);
    return;
  }
  const reading = FACTOR_READINGS[code];
  if (value.reading !== reading.reading) {
    issues.push(`${where} (${code}) must be read as ${reading.reading}`);
    return;
  }
  if (reading.reading === "banded" && value.unit !== reading.unit) {
    issues.push(`${where} (${code}) must be banded in ${reading.unit}`);
  }
  validateLabel(issues, `${where}.notRecordedLabel`, value.notRecordedLabel);
  const levels = value.levels;
  if (!Array.isArray(levels) || levels.length === 0) {
    issues.push(`${where}.levels must list at least one level`);
    return;
  }
  const codes = new Set<string>();
  const evidence = new Set<string>();
  let previousBound = Number.POSITIVE_INFINITY;
  levels.forEach((level: unknown, levelIndex) => {
    const at = `${where}.levels[${levelIndex}]`;
    if (!isRecord(level)) {
      issues.push(`${at} must be an object`);
      return;
    }
    const levelCode = level.level;
    if (
      typeof levelCode !== "string" ||
      !LEVEL_CODE.test(levelCode) ||
      levelCode === NOT_RECORDED_LEVEL ||
      codes.has(levelCode)
    ) {
      issues.push(
        `${at}.level must be a distinct lower snake_case code other than ${NOT_RECORDED_LEVEL}`,
      );
    } else {
      codes.add(levelCode);
    }
    validateLabel(issues, `${at}.label`, level.label);
    if (reading.reading === "matched") {
      const values = level.evidenceValues;
      if (
        !Array.isArray(values) ||
        values.length === 0 ||
        !values.every((item) => isText(item))
      ) {
        issues.push(`${at}.evidenceValues must list at least one value`);
        return;
      }
      for (const item of values as string[]) {
        if (evidence.has(item)) {
          issues.push(`${at}: ${item} reads as two levels`);
        }
        evidence.add(item);
      }
      return;
    }
    const bound = level.atLeast;
    if (
      typeof bound !== "number" ||
      !Number.isFinite(bound) ||
      bound < 0 ||
      bound >= previousBound
    ) {
      issues.push(
        `${at}.atLeast must be a number ≥ 0, below the band above it`,
      );
      return;
    }
    previousBound = bound;
  });
  if (reading.reading === "banded" && previousBound !== 0) {
    issues.push(`${where} (${code}): the last band must start at 0`);
  }
}

/**
 * A missing or malformed scheme is a loud failure, never a permissive
 * default: a scheme that silently dropped a factor would rank every item as
 * though that factor did not exist — the gap Rule 10.20 forbids.
 */
export function validateHazardRankingScheme(
  value: unknown,
): HazardRankingSchemeValidation {
  if (!isRecord(value)) {
    return { ok: false, issues: ["scheme is not an object"] };
  }
  const issues: string[] = [];
  if (!isText(value.schemeVersion)) {
    issues.push("schemeVersion must be a non-empty string");
  }
  const orderOk = validateOrder(issues, value.factorOrder);

  const factors = value.factors;
  if (!Array.isArray(factors)) {
    issues.push("factors must be a list");
  } else {
    factors.forEach((factor: unknown, index) => {
      validateFactor(issues, factor, index);
    });
    const codes = factors
      .filter(isRecord)
      .map((factor) => factor.code)
      .filter((code): code is string => typeof code === "string");
    if (new Set(codes).size !== codes.length) {
      issues.push("factors must list each factor once");
    }
    if (orderOk) {
      const order = value.factorOrder as Record<string, readonly string[]>;
      for (const scope of HAZARD_RANKING_SCOPES) {
        for (const code of order[scope] ?? []) {
          if (!codes.includes(code)) {
            issues.push(
              `factorOrder.${scope} names ${code}, which has no levels`,
            );
          }
        }
      }
    }
  }

  const cuts = value.bandCutPoints;
  if (
    !Array.isArray(cuts) ||
    cuts.length !== PLACED_BANDS.length - 1 ||
    !cuts.every(
      (cut, index) =>
        typeof cut === "number" &&
        cut > 0 &&
        cut < 1 &&
        (index === 0 || cut > (cuts[index - 1] as number)),
    )
  ) {
    issues.push(
      `bandCutPoints must be ${PLACED_BANDS.length - 1} ascending numbers between 0 and 1`,
    );
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, scheme: value as unknown as HazardRankingScheme };
}

/** The scheme's entry for one factor. The scheme is validated, so every ordered factor has one. */
export function schemeFactor(
  scheme: HazardRankingScheme,
  code: HazardFactorCode,
): SchemeFactor {
  const factor = scheme.factors.find((entry) => entry.code === code);
  if (factor === undefined) {
    throw new Error(`The ranking scheme has no levels for ${code}.`);
  }
  return factor;
}
