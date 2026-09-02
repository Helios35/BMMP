/**
 * The shape of the confidence-gate configuration, and its validation — and
 * **never a value** (D-22, D-40).
 *
 * `TECHNICAL_SPEC.md` §11.1 step 5 and `BUSINESS_RULES.md` Rule 2.16: the
 * threshold value is platform configuration data owned by P6, a floor a tenant
 * may raise and can never lower. It is read through `src/data` like every other
 * read and **passed into the gate as an argument**. `src/domain` receives data as
 * arguments and reaches for nothing — this module holds what a threshold set
 * looks like and what makes one acceptable, so that the gate can refuse a set
 * that would let a record through, and so that the applied set can be stamped
 * onto `intake_session.gate_thresholds_applied` and onto each
 * `label_extraction.band_cutoffs_applied` for the decision to reproduce after
 * the cutoffs change.
 *
 * **There is no default, no example and no fallback in this file.** A gate with
 * no configuration does not run with a guessed one; it refuses, loudly, because
 * a fabricated threshold is a fabricated compliance record (Rule 2.13).
 *
 * These are not jurisdiction rules. They are not regulatory, so they do not live
 * in `rule_version`, and putting them there would blur the boundary that makes
 * rules-as-data credible.
 */

/** §11.1 step 5's three thresholds, each a score in (0, 1]. */
export interface GateThresholds {
  /** Every extracted field's raw confidence is measured against this. */
  readonly minFieldConfidence: number;
  /** The top catalog candidate's `matchScore` against this. */
  readonly minMatchScore: number;
  /**
   * The gap between the top two candidates. Two near-identical entries are an
   * ambiguous match even when both score highly (Rule 2.19).
   */
  readonly minMatchSeparation: number;
}

/**
 * The raw-score-to-band cutoffs (T-10). A score at or above `high` is `high`,
 * at or above `medium` is `medium`, at or above `low` is `low`, and anything
 * below `low` — or a field with no score at all — is `not_extracted`.
 */
export interface BandCutoffs {
  readonly high: number;
  readonly medium: number;
  readonly low: number;
}

/**
 * How far a label's printed figure may sit from a catalog entry's rated figure
 * and still count as agreement, as a fraction of the catalog figure.
 *
 * Product configuration, not a jurisdiction rule: nothing regulatory turns on
 * whether a scorer treats 355 V and 355.2 V as the same nameplate.
 */
export interface MatchTolerances {
  readonly voltageRelative: number;
  readonly capacityRelative: number;
  readonly energyRelative: number;
}

/**
 * The weights the catalog scorer assigns to each way an entry can match
 * (`TECHNICAL_SPEC.md` §11.1 step 4), each a score in (0, 1].
 *
 * Configuration rather than code for the same reason the thresholds are: a
 * weight decides which candidate ranks first, and the top candidate's score is
 * what the gate measures against `minMatchScore`. An exact part-number match
 * is the ceiling of 1 and is not tunable — a label that resolves the part
 * number outright is the strongest evidence the pipeline has.
 */
export interface MatchScoring {
  /** A model string the entry's own label patterns name. */
  readonly labelPatternScore: number;
  /** Text similarity alone is scaled into this ceiling and can never exceed it. */
  readonly similarityCeiling: number;
  /** Added once per nameplate figure that agrees within tolerance. */
  readonly numericAgreementBonus: number;
}

/** Everything the intake pipeline reads from platform configuration, in one shape. */
export interface IntakeGateConfiguration {
  /** Which configuration row produced this set, so a stamped set can be traced. */
  readonly configurationVersion: string;
  readonly thresholds: GateThresholds;
  readonly bandCutoffs: BandCutoffs;
  readonly matchTolerances: MatchTolerances;
  readonly matchScoring: MatchScoring;
}

export type ConfigurationValidation =
  | { readonly ok: true; readonly configuration: IntakeGateConfiguration }
  | { readonly ok: false; readonly issues: readonly string[] };

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A finite number in (0, 1]. A score is a fraction; zero would pass everything. */
function isUnitScore(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= 1
  );
}

/**
 * Validate a configuration set before the gate is allowed to read it.
 *
 * Every issue is reported rather than the first, so a misconfigured platform row
 * is fixed in one pass. **An invalid set is never partially accepted**: the gate
 * either has a whole, coherent configuration or it does not run.
 */
export function validateIntakeGateConfiguration(
  value: unknown,
): ConfigurationValidation {
  const issues: string[] = [];

  if (!isRecord(value)) {
    return { ok: false, issues: ["configuration is not an object"] };
  }

  const version = value.configurationVersion;
  if (typeof version !== "string" || version.trim() === "") {
    issues.push("configurationVersion must be a non-empty string");
  }

  const thresholds = isRecord(value.thresholds) ? value.thresholds : null;
  if (thresholds === null) {
    issues.push("thresholds must be an object");
  } else {
    for (const key of [
      "minFieldConfidence",
      "minMatchScore",
      "minMatchSeparation",
    ] as const) {
      if (!isUnitScore(thresholds[key])) {
        issues.push(`thresholds.${key} must be a number in (0, 1]`);
      }
    }
    if (
      isUnitScore(thresholds.minMatchScore) &&
      isUnitScore(thresholds.minMatchSeparation) &&
      thresholds.minMatchSeparation >= thresholds.minMatchScore
    ) {
      issues.push(
        "thresholds.minMatchSeparation must be smaller than thresholds.minMatchScore",
      );
    }
  }

  const cutoffs = isRecord(value.bandCutoffs) ? value.bandCutoffs : null;
  if (cutoffs === null) {
    issues.push("bandCutoffs must be an object");
  } else {
    for (const key of ["high", "medium", "low"] as const) {
      if (!isUnitScore(cutoffs[key])) {
        issues.push(`bandCutoffs.${key} must be a number in (0, 1]`);
      }
    }
    if (
      isUnitScore(cutoffs.high) &&
      isUnitScore(cutoffs.medium) &&
      isUnitScore(cutoffs.low) &&
      !(cutoffs.high > cutoffs.medium && cutoffs.medium > cutoffs.low)
    ) {
      issues.push("bandCutoffs must satisfy high > medium > low");
    }
  }

  // The gate compares bands and the stamp records a threshold; the two are
  // one number seen from two sides, and a set where they differ would stamp a
  // threshold the gate never applied (Rule 2.16).
  if (
    thresholds !== null &&
    cutoffs !== null &&
    isUnitScore(thresholds.minFieldConfidence) &&
    isUnitScore(cutoffs.high) &&
    thresholds.minFieldConfidence !== cutoffs.high
  ) {
    issues.push(
      "thresholds.minFieldConfidence must equal bandCutoffs.high — the gate compares bands, and the stamp must name the cutoff it applied",
    );
  }

  const tolerances = isRecord(value.matchTolerances)
    ? value.matchTolerances
    : null;
  if (tolerances === null) {
    issues.push("matchTolerances must be an object");
  } else {
    for (const key of [
      "voltageRelative",
      "capacityRelative",
      "energyRelative",
    ] as const) {
      if (!isUnitScore(tolerances[key])) {
        issues.push(`matchTolerances.${key} must be a number in (0, 1]`);
      }
    }
  }

  const scoring = isRecord(value.matchScoring) ? value.matchScoring : null;
  if (scoring === null) {
    issues.push("matchScoring must be an object");
  } else {
    for (const key of [
      "labelPatternScore",
      "similarityCeiling",
      "numericAgreementBonus",
    ] as const) {
      if (!isUnitScore(scoring[key])) {
        issues.push(`matchScoring.${key} must be a number in (0, 1]`);
      }
    }
  }

  if (issues.length > 0) return { ok: false, issues };

  // Every branch above has run, so the narrowing below is sound; the casts are
  // to the shapes just checked, field by field.
  const t = thresholds as Readonly<Record<keyof GateThresholds, number>>;
  const c = cutoffs as Readonly<Record<keyof BandCutoffs, number>>;
  const m = tolerances as Readonly<Record<keyof MatchTolerances, number>>;
  const w = scoring as Readonly<Record<keyof MatchScoring, number>>;

  return {
    ok: true,
    configuration: {
      configurationVersion: version as string,
      thresholds: {
        minFieldConfidence: t.minFieldConfidence,
        minMatchScore: t.minMatchScore,
        minMatchSeparation: t.minMatchSeparation,
      },
      bandCutoffs: { high: c.high, medium: c.medium, low: c.low },
      matchTolerances: {
        voltageRelative: m.voltageRelative,
        capacityRelative: m.capacityRelative,
        energyRelative: m.energyRelative,
      },
      matchScoring: {
        labelPatternScore: w.labelPatternScore,
        similarityCeiling: w.similarityCeiling,
        numericAgreementBonus: w.numericAgreementBonus,
      },
    },
  };
}
