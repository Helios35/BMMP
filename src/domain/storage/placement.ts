import type { IsoTimestamp, JsonObject, TimeZone } from "@/types/common";
import {
  type AppliedRuleVersion,
  type RuleOutcome,
  ruleOutcome,
} from "@/domain/rules/outcome";
import type { ResolvedRule } from "@/domain/rules/resolve";
import {
  addCivilDays,
  civilDateInZone,
  endOfCivilDay,
  startOfCivilDay,
} from "@/domain/storage/clock-display";
import {
  type ContainerStatus,
  CONTAINER_STATUS_LABELS,
} from "@/domain/taxonomy/container-status";
import {
  type ContainerType,
  CONTAINER_TYPE_LABELS,
} from "@/domain/taxonomy/container-type";
import type { DamageAssessmentStatus } from "@/domain/taxonomy/damage-assessment-status";
import type { DdrFlag } from "@/domain/taxonomy/ddr-flag";
import { isTaxonomyValue } from "@/domain/taxonomy/lookup";
import { STORAGE_CLOCK_ALERT_BANDS } from "@/domain/taxonomy/storage-clock-alert-band";
import type { WasteClassification } from "@/domain/taxonomy/waste-classification";

/**
 * Placement — which container a record may enter (Rules 4.16, 4.28, 6.17,
 * 6.18; T-23).
 *
 * **A container holds one segregation class, and the constraint is enforced at
 * placement, not advised** (Rule 4.28). T-23 makes the class a composite of two
 * dimensions — the classification outcome of the contents crossed with their
 * condition state — and every value names both, so two consequences follow
 * mechanically rather than by builder judgement: no container ever holds two
 * waste classification outcomes, and no container holds sound material beside
 * damaged, defective or recalled material.
 *
 * This module reads the two dimensions and names the one container type that
 * admits the record. It reads no threshold, no fill limit and no separation
 * distance — those are `jurisdiction_rule` data and not properties of the type.
 */

/**
 * The container type a record with this classification and condition may enter.
 *
 * `null` where the classification is `undetermined`: T-23 gives such a record
 * no container at all — Rule 3.10 blocks the decision and Rule 3.12 blocks
 * every downstream document until the missing input is supplied (EC-16).
 *
 * The condition state is read from the DDR flags and the assessment status
 * together: any flag → the `_ddr` quarantine class (Rules 6.17, 6.18); an
 * assessment still `not_assessed` → the `_hold` class, from which no document
 * issues; otherwise sound.
 */
export function requiredContainerType(
  classification: WasteClassification,
  condition: {
    readonly ddrFlags: readonly DdrFlag[];
    readonly assessmentStatus: DamageAssessmentStatus;
  },
): ContainerType | null {
  if (classification === "undetermined") return null;

  const family =
    classification === "fully_regulated" ? "fully_regulated" : "light_category";

  if (condition.ddrFlags.length > 0) return `${family}_ddr`;
  if (condition.assessmentStatus === "not_assessed") return `${family}_hold`;
  return `${family}_sound`;
}

/* ------------------------------------------------------------- admission */

/**
 * Whether one container may take one record, and if not, the stated reason.
 *
 * Every refusal names why (Rules 4.16, 4.28) — a container picker renders the
 * refused row with the reason rather than hiding it, so the handler learns what
 * would have to change instead of wondering why the drum they are standing next
 * to is not on the list.
 */
export type PlacementAdmission =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason:
        | "container_overdue"
        | "segregation_class_mismatch"
        | "container_not_open"
        | "classification_undetermined";
      readonly message: string;
    };

/**
 * Decide whether a container admits a record that needs `required`.
 *
 * Checked in the order a handler can act on: an undetermined classification is
 * the record's problem, an overdue container is the container's (Rule 4.16 —
 * the two paths out are to ship the contents or record a remediation), a
 * container that is not open is not taking anything, and a segregation
 * mismatch is the placement itself being wrong (Rule 4.28). The reasons carry
 * type labels from the taxonomy, never an inline name.
 */
export function admitToContainer(
  container: {
    readonly status: ContainerStatus;
    readonly containerType: ContainerType;
  },
  required: ContainerType | null,
): PlacementAdmission {
  if (required === null) {
    return {
      ok: false,
      reason: "classification_undetermined",
      message:
        "No container can be chosen until the waste classification is decided.",
    };
  }
  if (container.status === "overdue") {
    return {
      ok: false,
      reason: "container_overdue",
      message:
        "This container is overdue and accepts no new items. Ship its contents or record a remediation.",
    };
  }
  if (container.status !== "open") {
    return {
      ok: false,
      reason: "container_not_open",
      message: `This container is ${CONTAINER_STATUS_LABELS[container.status]} and is not accepting items.`,
    };
  }
  if (container.containerType !== required) {
    return {
      ok: false,
      reason: "segregation_class_mismatch",
      message: `This container holds ${CONTAINER_TYPE_LABELS[container.containerType]}. This record needs ${CONTAINER_TYPE_LABELS[required]}.`,
    };
  }
  return { ok: true };
}

/* ----------------------------------------------------------- clock start */

export const ACCUMULATION_RULE_KEY = "storage.accumulation_period";

/** The payload schema this module knows how to read. Anything else is refused. */
const ACCUMULATION_PAYLOAD_SCHEMA_KEY = "storage.accumulation_period.v1";

export interface ClockStartInput {
  readonly placedAt: IsoTimestamp;
  /** The **site's** zone (Rule 4.29), never the server's or the user's. */
  readonly timeZone: TimeZone;
  /**
   * The container's running clock, where it has one. A record placed into a
   * container that is already accumulating joins that clock (Rule 4.4): the
   * start date is the first placement's, not this one's.
   */
  readonly existingClock: { readonly clockStartAt: IsoTimestamp } | null;
}

export interface ClockStart {
  readonly clockStartAt: IsoTimestamp;
  /** Stamped from the rule payload so a later rule change cannot move a running clock (Rule 4.5). */
  readonly maxDurationDays: number;
  readonly dueAt: IsoTimestamp;
  /** Tier name → `YYYY-MM-DD`, one entry per offset the payload declares (Rule 4.13). */
  readonly alertSchedule: JsonObject;
  readonly nextAlertAt: IsoTimestamp | null;
  readonly timeZone: TimeZone;
  /**
   * `true` when `existingClock` was supplied: the figures describe the clock
   * the record joins, and **no new `storage_clock` row is written** — the
   * caller records the join. The stored row's stamped figures remain the
   * authority where a later rule version would differ from these.
   */
  readonly joinsExistingClock: boolean;
}

/**
 * Thrown when a resolved rule version's payload is not one this evaluator can
 * read.
 *
 * A clock started from a guessed period is a clock that will say "in time" on
 * a container that is not. Refusing is the only defensible answer (Rule 4.5).
 */
export class InvalidRulePayloadError extends Error {
  constructor(
    readonly ruleKey: string,
    readonly payloadSchemaKey: string,
    readonly detail: string,
  ) {
    super(
      `The payload of rule "${ruleKey}" (schema ${payloadSchemaKey}) cannot be read: ${detail}. ` +
        "No clock starts from a guessed period — Rule 4.5.",
    );
    this.name = "InvalidRulePayloadError";
  }
}

interface AccumulationPayload {
  readonly maxDurationDays: number;
  /** Tier name → whole days before the due date. */
  readonly alertOffsetsDays: Readonly<Record<string, number>>;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWholeDays(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/**
 * Read the `storage.accumulation_period.v1` payload, or refuse.
 *
 * Every tier name is checked against T-27 because the schedule is later read
 * back by tier (`storage_clock.alert_band`), and a tier the taxonomy does not
 * know would be an alert nothing can render.
 */
function readAccumulationPayload(resolved: ResolvedRule): AccumulationPayload {
  const refuse = (detail: string): never => {
    throw new InvalidRulePayloadError(
      resolved.ruleKey,
      resolved.version.payloadSchemaKey,
      detail,
    );
  };

  if (resolved.ruleKey !== ACCUMULATION_RULE_KEY) {
    return refuse(`expected rule ${ACCUMULATION_RULE_KEY}`);
  }
  if (resolved.version.payloadSchemaKey !== ACCUMULATION_PAYLOAD_SCHEMA_KEY) {
    return refuse(`expected schema ${ACCUMULATION_PAYLOAD_SCHEMA_KEY}`);
  }

  const payload: unknown = resolved.version.payload;
  if (!isRecord(payload)) return refuse("payload is not an object");

  const { maxDurationDays, alertOffsetsDays, measure } = payload;
  if (measure !== "days") return refuse("measure must be days");
  if (!isWholeDays(maxDurationDays) || maxDurationDays === 0) {
    return refuse("maxDurationDays must be a positive whole number");
  }
  if (!isRecord(alertOffsetsDays)) {
    return refuse("alertOffsetsDays must be an object");
  }

  const offsets: Record<string, number> = {};
  for (const [tier, days] of Object.entries(alertOffsetsDays)) {
    if (!isTaxonomyValue(STORAGE_CLOCK_ALERT_BANDS, tier)) {
      return refuse(`alertOffsetsDays.${tier} is not a T-27 alert band`);
    }
    if (!isWholeDays(days)) {
      return refuse(`alertOffsetsDays.${tier} must be a whole number of days`);
    }
    offsets[tier] = days;
  }
  if (Object.keys(offsets).length === 0) {
    return refuse("alertOffsetsDays declares no tier");
  }

  return { maxDurationDays, alertOffsetsDays: offsets };
}

/**
 * Start — or join — the storage clock for a placement.
 *
 * The maths, in the site's zone throughout (Rule 4.29):
 *
 * - the start date is the civil date of the first placement (Rule 4.4);
 * - the due date is the start date plus the period, in calendar days;
 * - the clock is due at the **end of the day before** the due date, so a
 *   period of N days spans exactly N civil days from the start date inclusive;
 * - each alert tier is dated `dueDate − offset` (Rule 4.13), and the next alert
 *   fires at the start of the earliest of those dates.
 *
 * Every figure comes from the resolved rule version and is returned inside a
 * `RuleOutcome` so the row that stores it also stores which version said so —
 * that is what lets a clock started under one version keep its due date after
 * the next version is published (Rule 4.5).
 */
export function startStorageClock(
  input: ClockStartInput,
  resolved: ResolvedRule,
): RuleOutcome<ClockStart> {
  const payload = readAccumulationPayload(resolved);
  const joinsExistingClock = input.existingClock !== null;
  const clockStartAt = input.existingClock?.clockStartAt ?? input.placedAt;
  const { timeZone } = input;

  const startDate = civilDateInZone(clockStartAt, timeZone);
  const dueDate = addCivilDays(startDate, payload.maxDurationDays);
  const lastDayInside = addCivilDays(dueDate, -1);
  const dueAt = endOfCivilDay(lastDayInside, timeZone);

  const alertSchedule: Record<string, string> = {};
  for (const [tier, offset] of Object.entries(payload.alertOffsetsDays)) {
    alertSchedule[tier] = addCivilDays(dueDate, -offset);
  }
  // ISO dates order lexicographically, so the earliest alert is the smallest.
  const earliestAlertDate = Object.values(alertSchedule).sort()[0] ?? null;
  const nextAlertAt =
    earliestAlertDate === null
      ? null
      : startOfCivilDay(earliestAlertDate, timeZone);

  const applied: AppliedRuleVersion = {
    jurisdictionRuleId: resolved.version.jurisdictionRuleId,
    ruleVersionId: resolved.version.ruleVersionId,
    ruleKey: resolved.ruleKey,
    versionLabel: resolved.version.versionLabel,
    citation: resolved.version.citation,
    inputs: { clockStartAt, timeZone, joinsExistingClock },
    outcome: `max_duration_days=${payload.maxDurationDays}`,
  };

  const reasoning = joinsExistingClock
    ? `This record joins the container's running clock, which started on ${startDate} at the site. ` +
      `Under the rule version in force it is due at the end of ${lastDayInside}.`
    : `The clock starts on ${startDate}, the date of the first placement at the site, ` +
      `and is due at the end of ${lastDayInside} under the rule version in force on that date.`;

  return ruleOutcome<ClockStart>({
    result: {
      clockStartAt,
      maxDurationDays: payload.maxDurationDays,
      dueAt,
      alertSchedule,
      nextAlertAt,
      timeZone,
      joinsExistingClock,
    },
    reasoning,
    ruleVersionsApplied: [applied],
    inputsSnapshot: {
      placedAt: input.placedAt,
      clockStartAt,
      timeZone,
      joinsExistingClock,
    },
    context: ACCUMULATION_RULE_KEY,
  });
}
