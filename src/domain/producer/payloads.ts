import { z } from "zod";

import type { FormatCategory } from "@/domain/taxonomy/format-category";
import type { IsoDate } from "@/types/common";

import { conditionSchema, type Condition } from "./conditions";

/**
 * The two rules a state's producer law is — Rule 8.7; spec §6.
 *
 * - `producer.coverage` (T-41 `format_threshold`): the state's battery classes
 *   and their limits, checked in order (Rule 8.8)
 * - `producer.obligations` (T-41 `producer_obligation`): what a producer must
 *   do, and by when (Rules 8.9, 8.10)
 *
 * Each payload is validated by its Zod schema, keyed by the version's
 * `payload_schema_key` (`ERD.md` §4.3). **Every class and every obligation
 * carries its own citation, and every class the law's own label** — the
 * words a person reads come from the rule data, never from this file.
 *
 * A payload that does not parse is a loud failure that names the rule: a
 * malformed limit applied as if it were right is a wrong answer filed as a
 * right one.
 */

/** The stable machine keys a state's two producer rules resolve by. */
export const COVERAGE_RULE_KEY = "producer.coverage";
export const OBLIGATIONS_RULE_KEY = "producer.obligations";

export const COVERAGE_SCHEMA_KEY = "producer.coverage.v1";
export const OBLIGATIONS_SCHEMA_KEY = "producer.obligations.v1";

/** The bands a class may assign — T-06's three covered bands. */
export const CLASS_BANDS = [
  "portable",
  "medium_format",
  "large_format",
] as const satisfies readonly FormatCategory[];
export type ClassBand = (typeof CLASS_BANDS)[number];

const ISO_DATE = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, "a date is YYYY-MM-DD")
  .refine(isCalendarDate, "not a calendar date");

const TEXT = z.string().trim().min(1);

function isCalendarDate(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

// --- producer.coverage.v1 -------------------------------------------------------------------

const coverageClass = z.strictObject({
  key: TEXT,
  /** The law's own label — "Medium format battery", "Covered battery (…)". */
  label: TEXT,
  band: z.enum(CLASS_BANDS),
  citation: TEXT,
  when: conditionSchema(false),
});

const coveragePayload = z
  .strictObject({
    classes: z.array(coverageClass).min(1),
    /** Exclusions a product's catalog facts cannot test — shown as "Not checked". */
    notChecked: z.array(TEXT),
  })
  .refine(
    (payload) =>
      new Set(payload.classes.map((entry) => entry.key)).size ===
      payload.classes.length,
    "class keys repeat",
  );

export interface CoverageClass {
  readonly key: string;
  readonly label: string;
  readonly band: ClassBand;
  readonly citation: string;
  readonly when: Condition;
}

export interface CoveragePayload {
  readonly classes: readonly CoverageClass[];
  readonly notChecked: readonly string[];
}

// --- producer.obligations.v1 ----------------------------------------------------------------

export type Due =
  /** A date written in the law (T-70 `statutory_date`). */
  | { readonly kind: "statutory_date"; readonly on: IsoDate }
  /** One deadline a year (T-70 `annual`), from `firstOn`. */
  | {
      readonly kind: "annual";
      readonly month: number;
      readonly day: number;
      readonly firstOn: IsoDate;
    }
  /** Waits on an event that hasn't happened — no deadline (Rule 8.10). */
  | { readonly kind: "no_date"; readonly event: string };

const due = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("statutory_date"), on: ISO_DATE }),
  z
    .strictObject({
      kind: z.literal("annual"),
      month: z.number().int().min(1).max(12),
      day: z.number().int().min(1).max(31),
      firstOn: ISO_DATE,
    })
    .refine(
      (annual) =>
        annual.firstOn.slice(5) ===
        `${String(annual.month).padStart(2, "0")}-${String(annual.day).padStart(2, "0")}`,
      "an annual date's first date falls on its month and day",
    )
    // A 29 February would have no date three years in four.
    .refine(
      (annual) => !(annual.month === 2 && annual.day === 29),
      "an annual date cannot be 29 February",
    ),
  z.strictObject({ kind: z.literal("no_date"), event: TEXT }),
]);

const obligation = z.strictObject({
  key: TEXT,
  /** What the producer must do, in plain words. */
  duty: TEXT,
  citation: TEXT,
  appliesTo: conditionSchema(true),
  due,
});

const obligationsPayload = z
  .strictObject({
    agency: TEXT,
    /** Named as the rule data names them — never an endorsement. */
    stewardshipOrganizations: z.array(TEXT),
    obligations: z.array(obligation).min(1),
  })
  .refine(
    (payload) =>
      new Set(payload.obligations.map((entry) => entry.key)).size ===
      payload.obligations.length,
    "obligation keys repeat",
  );

export interface ObligationDefinition {
  readonly key: string;
  readonly duty: string;
  readonly citation: string;
  readonly appliesTo: Condition;
  readonly due: Due;
}

export interface ObligationsPayload {
  readonly agency: string;
  readonly stewardshipOrganizations: readonly string[];
  readonly obligations: readonly ObligationDefinition[];
}

// --- parsing --------------------------------------------------------------------------------

export type PayloadParse<T> =
  | { readonly ok: true; readonly payload: T }
  | { readonly ok: false; readonly issues: readonly string[] };

function issuesOf(error: z.ZodError): readonly string[] {
  return error.issues.map(
    (issue) => `${issue.path.join(".") || "payload"}: ${issue.message}`,
  );
}

export function parseCoveragePayload(
  value: unknown,
): PayloadParse<CoveragePayload> {
  const parsed = coveragePayload.safeParse(value);
  return parsed.success
    ? { ok: true, payload: parsed.data }
    : { ok: false, issues: issuesOf(parsed.error) };
}

export function parseObligationsPayload(
  value: unknown,
): PayloadParse<ObligationsPayload> {
  const parsed = obligationsPayload.safeParse(value);
  return parsed.success
    ? { ok: true, payload: parsed.data }
    : { ok: false, issues: issuesOf(parsed.error) };
}

/**
 * A producer rule version whose payload does not parse. Thrown, because the
 * run must not write an answer built on a rule it could not read — the rule
 * data is wrong, and P6 corrects it with a new version (EC-53).
 */
export class ProducerRulePayloadError extends Error {
  constructor(
    readonly ruleKey: string,
    readonly versionLabel: string,
    readonly issues: readonly string[],
  ) {
    super(
      `The payload of rule "${ruleKey}" version ${versionLabel} cannot be read: ${issues.join("; ")}.`,
    );
    this.name = "ProducerRulePayloadError";
  }
}
