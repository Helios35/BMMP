import type { IsoTimestamp, JsonObject, TimeZone } from "@/types/common";
import {
  addCivilDays,
  civilDateInZone,
  startOfCivilDay,
  storageClockDisplay,
} from "@/domain/storage/clock-display";
import type { AlertSeverity } from "@/domain/taxonomy/alert-severity";
import { ALERT_TYPE_DEFAULT_AUDIENCE } from "@/domain/taxonomy/alert-type";
import {
  ROLE_CODES,
  ROLE_PERSONA_IDS,
  type RoleCode,
} from "@/domain/taxonomy/role";
import {
  STORAGE_CLOCK_ALERT_BAND_LABELS,
  STORAGE_CLOCK_ALERT_BANDS,
  type StorageClockAlertBand,
} from "@/domain/taxonomy/storage-clock-alert-band";
import type { StorageClockStatus } from "@/domain/taxonomy/storage-clock-status";

/**
 * The alert job's evaluation of one storage clock — Rules 4.13, 4.15, 4.29.
 *
 * **This is the one place a clock's state is decided.** `clock-display.ts`
 * supplies figures and decides nothing; a screen reads the stored status the
 * job wrote. The job runs where time moves a clock — and, in B1a's mock, at the
 * moment a move re-dates one, because a container that inherits an earlier
 * start **becomes overdue on receipt** and the screen must show it at the
 * moment of the move, not after a refresh (Rule 4.10; E-6).
 *
 * **The ladder is data.** The tier dates are the `alert_schedule` materialised
 * from the rule version's offsets when the clock started; nothing here holds an
 * offset, a period or a tier count. Overdue is the period elapsing: the instant
 * after `due_at`, which is the end of the last day inside the period at the
 * site (Rule 4.29).
 *
 * **Bands move one way within an instance** (T-27), and overdue is never
 * cleared by evaluation (Rule 4.15) — so the result is never behind what was
 * stored.
 */

/** The ordered alert tiers, between `none` and `overdue`. */
const LADDER_TIERS = STORAGE_CLOCK_ALERT_BANDS.filter(
  (band) => band !== "none" && band !== "overdue",
);

export interface ClockStateFacts {
  readonly status: StorageClockStatus;
  readonly alertBand: StorageClockAlertBand;
  readonly dueAt: IsoTimestamp;
  /** Tier → `YYYY-MM-DD` at the site, materialised from the rule payload. */
  readonly alertSchedule: JsonObject;
  readonly timeZone: TimeZone;
  readonly stoppedAt: IsoTimestamp | null;
}

export interface ClockEvaluation {
  readonly status: StorageClockStatus;
  readonly alertBand: StorageClockAlertBand;
  /** When the job next needs to look, or null once nothing further can fire. */
  readonly nextAlertAt: IsoTimestamp | null;
  /** The band or status differs from what was stored. */
  readonly changed: boolean;
}

function bandRank(band: StorageClockAlertBand): number {
  return STORAGE_CLOCK_ALERT_BANDS.indexOf(band);
}

function scheduledDate(schedule: JsonObject, tier: string): string | null {
  const value = schedule[tier];
  return typeof value === "string" ? value : null;
}

/** The instant the period elapses — the first moment of the day after the last day inside it. */
function elapsesAt(dueAt: IsoTimestamp, timeZone: TimeZone): IsoTimestamp {
  return startOfCivilDay(
    addCivilDays(civilDateInZone(dueAt, timeZone), 1),
    timeZone,
  );
}

/**
 * The clock's status and band as of `asOf`.
 *
 * A stopped clock is left exactly as it is. Otherwise: past `due_at` is
 * overdue; short of it, the highest tier whose scheduled date has arrived at
 * the site; and the result is never less advanced than the stored state.
 */
export function evaluateStorageClock(
  clock: ClockStateFacts,
  asOf: IsoTimestamp,
): ClockEvaluation {
  if (clock.stoppedAt !== null || clock.status === "stopped") {
    return {
      status: clock.status,
      alertBand: clock.alertBand,
      nextAlertAt: null,
      changed: false,
    };
  }

  const isPastDue = Date.parse(asOf) > Date.parse(clock.dueAt);
  const today = civilDateInZone(asOf, clock.timeZone);

  let computed: StorageClockAlertBand = "none";
  if (isPastDue) {
    computed = "overdue";
  } else {
    for (const tier of LADDER_TIERS) {
      const date = scheduledDate(clock.alertSchedule, tier);
      if (date !== null && date <= today) computed = tier;
    }
  }

  const alertBand =
    bandRank(computed) >= bandRank(clock.alertBand)
      ? computed
      : clock.alertBand;

  const status: StorageClockStatus =
    alertBand === "overdue" || clock.status === "overdue"
      ? "overdue"
      : alertBand === "none"
        ? "running"
        : "approaching_limit";

  let nextAlertAt: IsoTimestamp | null = null;
  if (status !== "overdue") {
    const nextTier = LADDER_TIERS.filter(
      (tier) => bandRank(tier) > bandRank(alertBand),
    )
      .map((tier) => scheduledDate(clock.alertSchedule, tier))
      .filter((date): date is string => date !== null && date > today)
      .sort()[0];
    nextAlertAt =
      nextTier === undefined
        ? elapsesAt(clock.dueAt, clock.timeZone)
        : startOfCivilDay(nextTier, clock.timeZone);
  }

  return {
    status,
    alertBand: status === "overdue" ? "overdue" : alertBand,
    nextAlertAt,
    changed:
      status !== clock.status ||
      (status === "overdue" ? "overdue" : alertBand) !== clock.alertBand,
  };
}

// --- the alert a band raises --------------------------------------------------------------

export interface StorageClockAlertInput {
  readonly containerCode: string;
  readonly containerId: string;
  readonly storageClockId: string;
  /** The band just entered. `none` raises nothing. */
  readonly band: Exclude<StorageClockAlertBand, "none">;
  readonly clockStartAt: IsoTimestamp;
  readonly dueAt: IsoTimestamp;
  readonly maxDurationDays: number;
  readonly timeZone: TimeZone;
  readonly governingRuleVersionId: string;
  readonly asOf: IsoTimestamp;
}

/** An `alert` row as the job raises it — the shape `alerts.raiseIfAbsent` takes. */
export interface StorageClockAlertDraft {
  readonly alertType: "storage_clock";
  readonly severity: AlertSeverity;
  readonly title: string;
  readonly body: string;
  readonly storageClockId: string;
  readonly containerId: string;
  readonly audienceRoles: readonly RoleCode[];
  readonly governingRuleVersionId: string;
  readonly triggerSnapshot: JsonObject;
  readonly raisedAt: IsoTimestamp;
  readonly dedupeKey: string;
}

/**
 * T-44's default routing as role codes — P1 and P2 for a storage clock
 * (Rule 4.14). **Routing, not permission.**
 */
export function alertAudienceRoles(
  alertType: keyof typeof ALERT_TYPE_DEFAULT_AUDIENCE,
): readonly RoleCode[] {
  const personas = ALERT_TYPE_DEFAULT_AUDIENCE[alertType];
  return ROLE_CODES.filter((role) => personas.includes(ROLE_PERSONA_IDS[role]));
}

/** `Jun 12, 2026` — the product's civil-date style, read as the calendar date it is. */
function civilDateText(civilDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(`${civilDate}T00:00:00.000Z`));
}

function days(count: number): string {
  return `${count} ${count === 1 ? "day" : "days"}`;
}

/**
 * The alert a clock raises on entering a band.
 *
 * **Severity is set from the condition, per T-48** — overdue is `critical`, a
 * band short of it is `attention` — and never derived from the band's position
 * on the ladder. The title and body state the condition and the required
 * handling, in the site's zone, **and never a chance of anything** (Rules 1.25,
 * 10.3). Every number in them is read from the clock: the period came from the
 * rule version, the dates from the stored schedule.
 *
 * The dedupe key is stable per (clock, band), so raising twice is harmless.
 */
export function storageClockAlert(
  input: StorageClockAlertInput,
): StorageClockAlertDraft {
  const display = storageClockDisplay(
    input.clockStartAt,
    input.dueAt,
    input.maxDurationDays,
    input.asOf,
    input.timeZone,
  );
  const lastDay = civilDateText(display.dueDateInZone);
  const code = input.containerCode;

  const isOverdue = input.band === "overdue";
  const title = isOverdue
    ? `Container ${code} accumulation period has elapsed`
    : `Container ${code}: ${STORAGE_CLOCK_ALERT_BAND_LABELS[input.band]}`;
  const body = isOverdue
    ? `The accumulation period for ${code} elapsed at the end of ${lastDay} (${input.timeZone}). ` +
      "The container accepts no new items. Its contents leave only on a shipment, " +
      "or by a remediation recorded by a Facility Manager."
    : `${code} is due at the end of ${lastDay} (${input.timeZone}), ${days(display.remainingDays)} from now. ` +
      "Ship its contents before then — the clock never pauses.";

  return {
    alertType: "storage_clock",
    severity: isOverdue ? "critical" : "attention",
    title,
    body,
    storageClockId: input.storageClockId,
    containerId: input.containerId,
    audienceRoles: alertAudienceRoles("storage_clock"),
    governingRuleVersionId: input.governingRuleVersionId,
    triggerSnapshot: {
      band: input.band,
      accumulationStartedAt: input.clockStartAt,
      dueAt: input.dueAt,
      maxDurationDays: input.maxDurationDays,
      evaluatedAt: input.asOf,
    },
    raisedAt: input.asOf,
    dedupeKey: `storage_clock:${input.storageClockId}:${input.band}`,
  };
}
