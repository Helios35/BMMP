import type { TosAcceptanceStatus } from "@/domain/taxonomy/tos-acceptance-status";
import type { IsoDate } from "@/types/common";

/**
 * Whether this organization may log a battery — Rules 7.1, 7.2, 7.13, 7.14,
 * 7.18.
 *
 * **The gate blocks intake, not the app** (`SITE_ARCHITECTURE.md` §5.3(2),
 * E-12). Every read-only route stays reachable while consent is pending, so an
 * organization can be set up before it has accepted anything. Putting this in
 * middleware or in a layout locks the product, which is the failure Rule 7.2
 * exists to prevent.
 *
 * **It is not skippable, not deferrable, and no role turns it off** — including
 * P6 (Rules 7.4, 1.19).
 *
 * `src/domain` is pure, so this declares the small shape it needs rather than
 * importing the `tos_acceptance` entity: the evaluator has no business knowing
 * about `documentContentHash`, `ipAddress` or a row id.
 */

export interface ConsentRecord {
  /** T-47. `not_accepted` is a real value, not an absent row. */
  readonly status: TosAcceptanceStatus;
  readonly documentKey: string;
  readonly documentVersion: string;
  /** D-2 — the grant that has to be in force before the first battery is logged. */
  readonly trainingRightsGranted: boolean;
  /** End of the grace window (Rule 7.13). */
  readonly reacceptanceDeadlineOn: IsoDate | null;
  readonly revokedAt: string | null;
}

export type IntakeGateStatus = "open" | "grace" | "blocked";

export const INTAKE_BLOCK_REASONS = [
  "no_acceptance",
  "lapsed",
  "revoked",
  "no_training_rights",
] as const;

export type IntakeBlockReason = (typeof INTAKE_BLOCK_REASONS)[number];

export interface IntakeGate {
  readonly status: IntakeGateStatus;
  /** Null when `status` is `open` or `grace`; always set when `blocked`. */
  readonly reason: IntakeBlockReason | null;
  /** The document the decision was taken against, where one was found. */
  readonly documentKey: string | null;
  readonly documentVersion: string | null;
  /** Present in `grace`, and in `blocked`/`lapsed` where the deadline is known (Rule 7.13). */
  readonly reacceptanceDeadlineOn: IsoDate | null;
}

function blocked(
  reason: IntakeBlockReason,
  record: ConsentRecord | null,
): IntakeGate {
  return {
    status: "blocked",
    reason,
    documentKey: record?.documentKey ?? null,
    documentVersion: record?.documentVersion ?? null,
    reacceptanceDeadlineOn: record?.reacceptanceDeadlineOn ?? null,
  };
}

/**
 * Resolve the gate for one organization's consent rows at a stated day.
 *
 * `today` is an argument rather than a clock read, because `src/domain` reads no
 * clock and because the boundary day — a grace window whose deadline is *today*
 * — is the case a test has to be able to pin.
 *
 * The order below is the rule, not an implementation detail:
 *
 * 1. `revoked` first (Rule 7.18) — revocation is an act someone performed, and
 *    it outranks a clock running out on a different row.
 * 2. `in_force` **with** the training-rights grant → open (Rules 7.1, D-2).
 * 3. `in_force` **without** it → blocked. **Fails closed:** D-2 makes the grant
 *    the thing that must be in force, not merely an acceptance, so an acceptance
 *    that withholds it is not consent to capture.
 * 4. `grace` inside its window → intake continues (Rule 7.13).
 * 5. `grace` past its deadline, or `lapsed` → blocked (Rule 7.14).
 * 6. Anything else — no row, every row `not_accepted`, or only superseded rows
 *    with no live successor → blocked as `no_acceptance`. **A status this
 *    function does not recognise blocks**; a gate that opens on an unfamiliar
 *    value is a gate that opens on the next taxonomy addition.
 *
 * Dates are ISO calendar days, which compare lexicographically, so no `Date` is
 * constructed and no zone is involved.
 */
export function evaluateIntakeGate(
  acceptances: readonly ConsentRecord[],
  today: IsoDate,
): IntakeGate {
  const revoked = acceptances.find(
    (record) => record.status === "revoked" || record.revokedAt !== null,
  );
  if (revoked !== undefined) return blocked("revoked", revoked);

  const inForce = acceptances.find((record) => record.status === "in_force");
  if (inForce !== undefined) {
    if (!inForce.trainingRightsGranted) {
      return blocked("no_training_rights", inForce);
    }
    return {
      status: "open",
      reason: null,
      documentKey: inForce.documentKey,
      documentVersion: inForce.documentVersion,
      reacceptanceDeadlineOn: null,
    };
  }

  const grace = acceptances.find((record) => record.status === "grace");
  if (grace !== undefined) {
    const deadline = grace.reacceptanceDeadlineOn;
    // A grace row with no deadline cannot be shown to be inside its window, and
    // Rule 7.14 is what closes it — so it fails closed rather than granting an
    // open-ended extension.
    if (deadline !== null && deadline >= today) {
      return {
        status: "grace",
        reason: null,
        documentKey: grace.documentKey,
        documentVersion: grace.documentVersion,
        reacceptanceDeadlineOn: deadline,
      };
    }
    return blocked("lapsed", grace);
  }

  const lapsed = acceptances.find((record) => record.status === "lapsed");
  if (lapsed !== undefined) return blocked("lapsed", lapsed);

  return blocked("no_acceptance", acceptances[0] ?? null);
}
