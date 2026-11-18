import { basisCivilDate } from "@/domain/hazard/words";
import { civilDaysBetween } from "@/domain/storage/clock-display";
import type { AlertSeverity } from "@/domain/taxonomy/alert-severity";
import type { ObligationDeadlineStatus } from "@/domain/taxonomy/obligation-deadline-status";
import type { ProducerObligationStatus } from "@/domain/taxonomy/producer-obligation-status";
import type { IsoDate, JsonObject, Uuid } from "@/types/common";

/**
 * Deadline alerts — Rule 8.13; T-44 `obligation_deadline`, T-48.
 *
 * The nightly job raises an alert for an open deadline at each configured
 * number of days before it (`attention`), and once it has passed
 * (`critical`). **The offsets are versioned platform configuration** (the
 * D-40 pattern) — this module holds the shape and its validation, never a
 * day count. One alert per deadline per offset, by its dedupe key; marking
 * the deadline done, or its withdrawal, resolves its alerts.
 *
 * A deadline shows **one** tier at a time: the nearest offset whose window
 * has opened, or overdue. When it moves to a nearer tier, the job resolves
 * the farther one rather than leaving two cards for one date.
 */

export interface ObligationAlertConfiguration {
  /** Stamped on every alert's trigger snapshot (Rule 12.15). */
  readonly configurationVersion: string;
  /** Days before the due date, farthest first. */
  readonly daysBefore: readonly number[];
  /** Whether a passed deadline raises its `critical` alert. */
  readonly overdue: boolean;
}

export type ObligationAlertConfigurationValidation =
  | { readonly ok: true; readonly configuration: ObligationAlertConfiguration }
  | { readonly ok: false; readonly issues: readonly string[] };

/**
 * A missing or malformed row is a loud failure, never a permissive default —
 * an offset list that defaulted to empty would quietly stop every reminder.
 */
export function validateObligationAlertConfiguration(
  value: unknown,
): ObligationAlertConfigurationValidation {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, issues: ["configuration is not an object"] };
  }
  const row = value as Record<string, unknown>;
  const issues: string[] = [];
  const version = row.configurationVersion;
  if (typeof version !== "string" || version.trim() === "") {
    issues.push("configurationVersion must be a non-empty string");
  }
  const days = row.daysBefore;
  if (
    !Array.isArray(days) ||
    days.length === 0 ||
    !days.every((day) => Number.isInteger(day) && (day as number) > 0)
  ) {
    issues.push("daysBefore must be a non-empty list of whole days");
  } else if (
    !days.every(
      (day, index) =>
        index === 0 || (days[index - 1] as number) > (day as number),
    )
  ) {
    issues.push("daysBefore must run farthest first, without repeats");
  }
  if (typeof row.overdue !== "boolean") {
    issues.push("overdue must be true or false");
  }
  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    configuration: {
      configurationVersion: version as string,
      daysBefore: [...(days as number[])],
      overdue: row.overdue as boolean,
    },
  };
}

/** A deadline's alert tier today: `overdue`, a number of days, or none yet. */
export type DeadlineAlertTier = "overdue" | number;

export function deadlineAlertTier(
  dueOn: IsoDate,
  today: IsoDate,
  configuration: ObligationAlertConfiguration,
): DeadlineAlertTier | null {
  const daysUntil = civilDaysBetween(today, dueOn);
  if (daysUntil < 0) return configuration.overdue ? "overdue" : null;
  const opened = configuration.daysBefore.filter((days) => daysUntil <= days);
  const nearest = opened[opened.length - 1];
  return nearest ?? null;
}

const KEY_PREFIX = "obligation_deadline:";

export function deadlineAlertKey(
  deadlineId: Uuid,
  tier: DeadlineAlertTier,
): string {
  return `${KEY_PREFIX}${deadlineId}:${tier === "overdue" ? "overdue" : `days-${tier}`}`;
}

/** The deadline an `obligation_deadline` alert's key names, or `null`. */
export function deadlineOfAlertKey(dedupeKey: string): Uuid | null {
  if (!dedupeKey.startsWith(KEY_PREFIX)) return null;
  const rest = dedupeKey.slice(KEY_PREFIX.length);
  const end = rest.lastIndexOf(":");
  return end <= 0 ? null : rest.slice(0, end);
}

/** One open deadline, with what its alert says. */
export interface DeadlineAlertSubject {
  readonly deadlineId: Uuid;
  readonly dueOn: IsoDate;
  readonly deadlineStatus: ObligationDeadlineStatus;
  readonly obligationStatus: ProducerObligationStatus;
  readonly stateName: string;
  /** The state's T-40 code — where the alert links (Rule 8.13). Never parsed. */
  readonly jurisdictionCode: string;
  readonly duty: string;
  readonly citation: string;
  /** For an `undetermined` obligation: which product, and what is missing. */
  readonly cantTellNote: string | null;
}

export interface DeadlineAlertDraft {
  readonly deadlineId: Uuid;
  readonly dedupeKey: string;
  readonly tier: DeadlineAlertTier;
  readonly severity: AlertSeverity;
  readonly title: string;
  readonly body: string;
  readonly triggerSnapshot: JsonObject;
}

function alertWords(
  subject: DeadlineAlertSubject,
  tier: DeadlineAlertTier,
): { readonly title: string; readonly body: string } {
  const date = basisCivilDate(subject.dueOn);
  const note =
    subject.cantTellNote === null
      ? ""
      : ` Can't tell yet whether it applies: ${subject.cantTellNote}.`;
  if (tier === "overdue") {
    return {
      title: `${subject.stateName} obligation overdue since ${date}`,
      body: `${subject.duty} (${subject.citation}). It was due ${date} and is not marked done. Mark it done on Obligations once it is met.${note}`,
    };
  }
  return {
    title: `${subject.stateName} obligation due ${date}`,
    body: `${subject.duty} (${subject.citation}). Due ${date} — the ${tier}-day notice. Mark it done on Obligations once it is met.${note}`,
  };
}

/**
 * The alerts that should be open today. An obligation that doesn't apply, or
 * a deadline that is done or withdrawn, wants none.
 */
export function wantedDeadlineAlerts(
  subjects: readonly DeadlineAlertSubject[],
  configuration: ObligationAlertConfiguration,
  today: IsoDate,
): readonly DeadlineAlertDraft[] {
  const drafts: DeadlineAlertDraft[] = [];
  for (const subject of subjects) {
    if (subject.deadlineStatus !== "open") continue;
    if (subject.obligationStatus === "not_applicable") continue;
    const tier = deadlineAlertTier(subject.dueOn, today, configuration);
    if (tier === null) continue;
    drafts.push({
      deadlineId: subject.deadlineId,
      dedupeKey: deadlineAlertKey(subject.deadlineId, tier),
      tier,
      severity: tier === "overdue" ? "critical" : "attention",
      ...alertWords(subject, tier),
      triggerSnapshot: {
        dueOn: subject.dueOn,
        today,
        tier: tier === "overdue" ? "overdue" : tier,
        configurationVersion: configuration.configurationVersion,
        obligationStatus: subject.obligationStatus,
        jurisdictionCode: subject.jurisdictionCode,
      },
    });
  }
  return drafts;
}
