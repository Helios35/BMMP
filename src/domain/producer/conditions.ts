import { z } from "zod";

import {
  APPLICATION_CLASSES,
  type ApplicationClass,
} from "@/domain/taxonomy/application-class";
import { CHEMISTRIES, type Chemistry } from "@/domain/taxonomy/chemistry";
import {
  FORMAT_CATEGORIES,
  type FormatCategory,
} from "@/domain/taxonomy/format-category";
import {
  REMOVABILITIES,
  type Removability,
} from "@/domain/taxonomy/removability";
import { compareDecimal, toKilograms, toWattHours } from "@/domain/units";
import type { Decimal } from "@/types/common";

/**
 * The conditions a state's producer law sets — Rules 8.8, 8.9; spec §6.
 *
 * A condition is `all`, `any`, or one test: `mass` or `energy` against a limit
 * in the statute's own unit, or membership of the product's chemistry,
 * removability, application class or — for an obligation only — its band in
 * that state. **Every limit, list and unit is rule data**; this module holds
 * the shape and the logic of testing it, never a number (Rule 1.23).
 *
 * Each test answers **true, false or can't-tell**. A missing input is
 * can't-tell and names what is missing; it is never false, because a gap
 * treated as "outside" is how a covered product drops off a state's list
 * (Rules 8.8, 8.9). `all` and `any` combine the three answers the way a person
 * would: one false settles an `all`, one true settles an `any`, and otherwise a
 * can't-tell leaves it open.
 */

// --- the shape ------------------------------------------------------------------------------

export const COMPARATORS = ["lt", "lte", "gt", "gte"] as const;
export type Comparator = (typeof COMPARATORS)[number];

export const MASS_UNITS = ["lb", "kg"] as const;
export const ENERGY_UNITS = ["Wh"] as const;

export interface LimitTest<Unit extends string> {
  readonly op: Comparator;
  /** The limit, as the statute states it. A decimal string, never a float. */
  readonly value: Decimal;
  /** The statute's own unit. Converted only by `src/domain/units.ts`. */
  readonly unit: Unit;
}

export type Condition =
  | { readonly all: readonly Condition[] }
  | { readonly any: readonly Condition[] }
  | { readonly mass: LimitTest<(typeof MASS_UNITS)[number]> }
  | { readonly energy: LimitTest<(typeof ENERGY_UNITS)[number]> }
  | { readonly chemistryIn: readonly Chemistry[] }
  | { readonly removabilityIn: readonly Removability[] }
  | { readonly applicationIn: readonly ApplicationClass[] }
  /** Obligations only — a coverage class cannot test the band it assigns. */
  | { readonly bandIn: readonly FormatCategory[] };

const DECIMAL = z
  .string()
  .regex(/^\d+(\.\d+)?$/u, "a limit is a non-negative decimal string");

function limitTest<const Units extends readonly [string, ...string[]]>(
  units: Units,
) {
  return z.strictObject({
    op: z.enum(COMPARATORS),
    value: DECIMAL,
    unit: z.enum(units),
  });
}

function nonEmptyList<const Values extends readonly [string, ...string[]]>(
  values: Values,
) {
  return z.array(z.enum(values)).min(1);
}

/**
 * The Zod schema for a condition. `allowBand` is false for a coverage class
 * (it assigns the band) and true for an obligation (it reads it).
 *
 * Strict: an unknown key is refused rather than ignored, so a misspelled test
 * fails the payload instead of silently testing nothing.
 */
export function conditionSchema(allowBand: boolean): z.ZodType<Condition> {
  const schema: z.ZodType<Condition> = z.lazy(() => {
    const tests = [
      z.strictObject({ all: z.array(schema).min(1) }),
      z.strictObject({ any: z.array(schema).min(1) }),
      z.strictObject({ mass: limitTest(MASS_UNITS) }),
      z.strictObject({ energy: limitTest(ENERGY_UNITS) }),
      z.strictObject({ chemistryIn: nonEmptyList(CHEMISTRIES) }),
      z.strictObject({ removabilityIn: nonEmptyList(REMOVABILITIES) }),
      z.strictObject({ applicationIn: nonEmptyList(APPLICATION_CLASSES) }),
    ] as const;
    return allowBand
      ? z.union([
          ...tests,
          z.strictObject({ bandIn: nonEmptyList(FORMAT_CATEGORIES) }),
        ])
      : z.union(tests);
  });
  return schema;
}

// --- what a condition is tested against -----------------------------------------------------

/**
 * A product's facts, read from its catalog entry (Rule 8.6). **Never typed on
 * the obligations page.** Mass in kg and energy in Wh, as the catalog stores
 * them; `null` where the catalog has no value — normal, and said so.
 */
export interface ProductFacts {
  readonly chemistry: Chemistry;
  readonly massKg: Decimal | null;
  readonly energyWh: Decimal | null;
  readonly removability: Removability;
  readonly applicationClass: ApplicationClass;
}

/**
 * Why a test could not be told. Each one is a value on the catalog entry that
 * P6 can fill, or a rule that is not on file.
 */
export const MISSING_INPUTS = [
  "mass",
  "energy",
  "chemistry_unconfirmed",
  "chemistry_other",
  "removability",
  "application",
  "coverage_rule",
] as const;
export type MissingInput = (typeof MISSING_INPUTS)[number];

/** How a missing input reads: "Can't tell in OR: energy not recorded". */
export const MISSING_INPUT_WORDS: Readonly<Record<MissingInput, string>> = {
  mass: "weight not recorded",
  energy: "energy not recorded",
  chemistry_unconfirmed: "chemistry not confirmed",
  chemistry_other: "chemistry recorded as Other",
  removability: "removability not recorded",
  application: "application not recorded",
  coverage_rule: "no coverage rule on file",
};

/** The band a product holds in the state an obligation is tested in. */
export interface BandFact {
  readonly band: FormatCategory;
  /** Why the band is `undetermined`; empty otherwise. */
  readonly missing: readonly MissingInput[];
}

export type Truth = "true" | "false" | "cant_tell";

export interface ConditionResult {
  readonly truth: Truth;
  /** What would have to be recorded to tell. Empty unless `cant_tell`. */
  readonly missing: readonly MissingInput[];
}

const TRUE: ConditionResult = { truth: "true", missing: [] };
const FALSE: ConditionResult = { truth: "false", missing: [] };

function cantTell(missing: readonly MissingInput[]): ConditionResult {
  return { truth: "cant_tell", missing: uniqueMissing(missing) };
}

export function uniqueMissing(
  missing: readonly MissingInput[],
): readonly MissingInput[] {
  return MISSING_INPUTS.filter((input) => missing.includes(input));
}

function compared(op: Comparator, order: -1 | 0 | 1): boolean {
  switch (op) {
    case "lt":
      return order < 0;
    case "lte":
      return order <= 0;
    case "gt":
      return order > 0;
    case "gte":
      return order >= 0;
  }
}

function testLimit(
  actual: Decimal | null,
  limitInRecordUnit: string | null,
  op: Comparator,
  missing: MissingInput,
): ConditionResult {
  if (actual === null) return cantTell([missing]);
  if (limitInRecordUnit === null) {
    // A unit the units module cannot convert is a malformed rule; the
    // payload schema refuses it first, so reaching here is a defect.
    throw new RangeError(`a ${missing} limit's unit cannot be converted`);
  }
  return compared(op, compareDecimal(actual, limitInRecordUnit)) ? TRUE : FALSE;
}

function testMembership<T extends string>(
  value: T,
  list: readonly T[],
  unknownValues: readonly T[],
  missing: MissingInput,
): ConditionResult {
  if (unknownValues.includes(value)) return cantTell([missing]);
  return list.includes(value) ? TRUE : FALSE;
}

function testChemistry(
  chemistry: Chemistry,
  list: readonly Chemistry[],
): ConditionResult {
  // T-01 `unknown` is not yet confirmed; `other` is confirmed but outside
  // every value a rule can name (zinc-air, silver-oxide, carbon-zinc) — so
  // neither can be told against a list, whatever the list holds.
  if (chemistry === "unknown") return cantTell(["chemistry_unconfirmed"]);
  if (chemistry === "other") return cantTell(["chemistry_other"]);
  return list.includes(chemistry) ? TRUE : FALSE;
}

/**
 * Test a condition. `band` is the product's band in the state — required
 * for an obligation's `bandIn`, and absent for a coverage class, whose schema
 * cannot contain one.
 */
export function evaluateCondition(
  condition: Condition,
  facts: ProductFacts,
  band?: BandFact,
): ConditionResult {
  if ("all" in condition) {
    const results = condition.all.map((child) =>
      evaluateCondition(child, facts, band),
    );
    if (results.some((result) => result.truth === "false")) return FALSE;
    const open = results.filter((result) => result.truth === "cant_tell");
    return open.length === 0
      ? TRUE
      : cantTell(open.flatMap((result) => result.missing));
  }
  if ("any" in condition) {
    const results = condition.any.map((child) =>
      evaluateCondition(child, facts, band),
    );
    if (results.some((result) => result.truth === "true")) return TRUE;
    const open = results.filter((result) => result.truth === "cant_tell");
    return open.length === 0
      ? FALSE
      : cantTell(open.flatMap((result) => result.missing));
  }
  if ("mass" in condition) {
    const { op, value, unit } = condition.mass;
    return testLimit(facts.massKg, toKilograms({ value, unit }), op, "mass");
  }
  if ("energy" in condition) {
    const { op, value, unit } = condition.energy;
    return testLimit(
      facts.energyWh,
      toWattHours({ value, unit }),
      op,
      "energy",
    );
  }
  if ("chemistryIn" in condition) {
    return testChemistry(facts.chemistry, condition.chemistryIn);
  }
  if ("removabilityIn" in condition) {
    return testMembership(
      facts.removability,
      condition.removabilityIn,
      ["unknown"],
      "removability",
    );
  }
  if ("applicationIn" in condition) {
    return testMembership(
      facts.applicationClass,
      condition.applicationIn,
      ["unknown"],
      "application",
    );
  }
  if (band === undefined) {
    throw new RangeError(
      "a bandIn test was reached with no band — a coverage class cannot test the band it assigns",
    );
  }
  if (band.band === "undetermined") {
    return cantTell(
      band.missing.length === 0 ? ["coverage_rule"] : band.missing,
    );
  }
  return condition.bandIn.includes(band.band) ? TRUE : FALSE;
}
