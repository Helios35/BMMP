import type { IsoTimestamp } from "@/types/common";

/**
 * Whether the 24-hour emergency contact number's verification stands — D-32,
 * Rules 5.6, 5.7.
 *
 * **A lapsed verification is treated exactly as an absent one** (D-32). There is
 * **one** not-in-force state, not two: the same alert, the same copy, the same
 * consequence, whether the number was never verified, was verified and has since
 * lapsed, or carries no interval to measure against. A distinct "expired"
 * treatment is a defect. {@link EmergencyVerification.notInForceReason} exists
 * so a test can name which entry point it came through — **never so a screen can
 * render it differently.**
 *
 * **No interval is a literal here or anywhere else in `src/`.** The
 * re-verification interval is organization configuration with a platform
 * default; where the effective interval is unknown the lapse date is `null` and
 * renders as nothing at all. A duration typed into a component is the same
 * defect class as a hard-coded jurisdiction threshold (Rule 1.23).
 *
 * Pure. The instant and the configuration arrive as arguments; nothing here
 * reads a clock or the data layer.
 */

export interface EmergencyVerificationInput {
  /** `organization.emergencyResponsePhone`. */
  readonly phone: string | null;
  /** When it was last verified. Null means never. */
  readonly verifiedAt: IsoTimestamp | null;
  /** Rule 5.6 wants a person. A verification nobody is attached to is not one. */
  readonly verifiedBy: string | null;
  /**
   * Whole months a verification stands for.
   *
   * Null means the platform default applies — it does **not** mean "never
   * lapses", and no screen may substitute a number of its own.
   */
  readonly reverificationIntervalMonths: number | null;
}

export const EMERGENCY_VERIFICATION_LAPSE_REASONS = [
  "no_number",
  "never_verified",
  "interval_unknown",
  "lapsed",
] as const;

export type EmergencyVerificationLapseReason =
  (typeof EMERGENCY_VERIFICATION_LAPSE_REASONS)[number];

export interface EmergencyVerification {
  readonly isInForce: boolean;
  /**
   * Which entry point into the single not-in-force state this was. `null` when
   * the verification is in force.
   *
   * **For tests and for data, never for a second visual treatment** (D-32).
   */
  readonly notInForceReason: EmergencyVerificationLapseReason | null;
  /** The recorded act, where there is one. */
  readonly verifiedAt: IsoTimestamp | null;
  readonly verifiedBy: string | null;
  /**
   * When the verification lapses, or lapsed. **`null` where the effective
   * interval is unknown** — the date renders as nothing at all rather than as a
   * number a component chose.
   */
  readonly lapsesAt: IsoTimestamp | null;
}

/**
 * `at` plus whole months, clamped to the end of the target month.
 *
 * Clamping rather than rolling over: a verification stamped on 31 January lapses
 * on 28 February, not on 3 March. The earlier date is the one that fails closed,
 * and this is a date after which a number may not go on a shipping paper.
 */
export function addWholeMonths(
  instant: IsoTimestamp,
  months: number,
): IsoTimestamp {
  const from = new Date(instant);
  if (Number.isNaN(from.getTime())) return instant;

  const targetMonth = from.getUTCMonth() + months;
  const lastDayOfTargetMonth = new Date(
    Date.UTC(from.getUTCFullYear(), targetMonth + 1, 0),
  ).getUTCDate();

  return new Date(
    Date.UTC(
      from.getUTCFullYear(),
      targetMonth,
      Math.min(from.getUTCDate(), lastDayOfTargetMonth),
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
      from.getUTCMilliseconds(),
    ),
  ).toISOString();
}

/**
 * Resolve the verification at a stated instant.
 *
 * **Fails closed.** A verification whose lapse date cannot be computed cannot be
 * shown to still stand, and Rule 5.6 makes standing verification the thing that
 * lets a number reach a shipping paper — so an unknown interval reads as not in
 * force, exactly as an absent verification does. Reading it the other way would
 * put an unverified number on a legal document.
 */
export function emergencyVerification(
  input: EmergencyVerificationInput,
  at: IsoTimestamp,
): EmergencyVerification {
  const { phone, verifiedAt, verifiedBy, reverificationIntervalMonths } = input;

  const lapsesAt =
    verifiedAt !== null && reverificationIntervalMonths !== null
      ? addWholeMonths(verifiedAt, reverificationIntervalMonths)
      : null;

  const base = { verifiedAt, verifiedBy, lapsesAt } as const;

  if (phone === null || phone.trim() === "") {
    return { ...base, isInForce: false, notInForceReason: "no_number" };
  }
  if (verifiedAt === null) {
    return { ...base, isInForce: false, notInForceReason: "never_verified" };
  }
  if (lapsesAt === null) {
    return { ...base, isInForce: false, notInForceReason: "interval_unknown" };
  }
  // ISO-8601 UTC compares lexicographically, so no second `Date` is built.
  if (lapsesAt <= at) {
    return { ...base, isInForce: false, notInForceReason: "lapsed" };
  }

  return { ...base, isInForce: true, notInForceReason: null };
}
