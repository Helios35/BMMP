import type { RoleCode } from "@/domain/taxonomy/role";
import type { IsoTimestamp } from "@/types/common";

/**
 * Whether a membership is in force **at a stated instant**.
 *
 * **Rule 1.28 is the reason this module exists.** Access is re-checked on every
 * request, never only at sign-in, so an expired or revoked grant ends access
 * inside a session that is already open. The instant arrives as an argument
 * rather than being read from the clock, so mid-session expiry is provable by a
 * unit test that moves `at` forward instead of by a test that waits (D-31).
 *
 * `src/domain` is pure, so this declares the small shape it needs rather than
 * importing an entity type from `src/types` — a membership row, a
 * `SessionMembership` and an invitation candidate all satisfy it.
 */

export interface MembershipGrant {
  /** T-37. The role decides whether an expiry is required at all. */
  readonly role: RoleCode;
  /** Null until an invitation is accepted (`ERD.md` §3.3). */
  readonly acceptedAt: IsoTimestamp | null;
  /** Revocation is never a delete — the row stays and this is set (Rule 1.13). */
  readonly revokedAt: IsoTimestamp | null;
  /** Rule 1.15 — a grant without an expiry cannot be created. */
  readonly grantExpiresAt: IsoTimestamp | null;
}

/** The subset of {@link MembershipGrant} an already-filtered membership can still fail. */
export interface MembershipGrantWindow {
  readonly role: RoleCode;
  readonly grantExpiresAt: IsoTimestamp | null;
}

export const GRANT_LAPSE_REASONS = [
  "not_accepted",
  "revoked",
  "grant_expired",
  "grant_missing_expiry",
] as const;

export type GrantLapseReason = (typeof GRANT_LAPSE_REASONS)[number];

/** The two lapse reasons that are a property of the grant window alone. */
export type GrantWindowLapseReason = Extract<
  GrantLapseReason,
  "grant_expired" | "grant_missing_expiry"
>;

/**
 * Which roles cannot hold access without a stated expiry.
 *
 * Rule 1.15 — every P5 grant carries a scope and an expiry. Rule 1.18 — P6 acts
 * inside a tenant only under a recorded support grant naming reason, scope and
 * expiry. Rule 1.17 — platform scope alone confers nothing, so a `platform_admin`
 * row with no expiry is not "unlimited access", it is a row that should not
 * exist.
 */
export function requiresGrantExpiry(role: RoleCode): boolean {
  return role === "auditor" || role === "platform_admin";
}

/**
 * Whether a grant window has closed at `at`, and why.
 *
 * **Fails closed on a missing expiry.** Rule 1.15 says a grant without an expiry
 * cannot be created, so a row that has one is a data defect and the only safe
 * reading of it is "no access" — never "no limit". The read is where this has to
 * hold, because the read is the one that runs a million times.
 *
 * Both sides are ISO-8601 UTC ({@link IsoTimestamp}), which compares
 * lexicographically, so no `Date` is constructed and no zone is involved.
 */
export function grantWindowLapseReason(
  membership: MembershipGrantWindow,
  at: IsoTimestamp,
): GrantWindowLapseReason | null {
  if (
    requiresGrantExpiry(membership.role) &&
    membership.grantExpiresAt === null
  ) {
    return "grant_missing_expiry";
  }
  if (membership.grantExpiresAt !== null && membership.grantExpiresAt <= at) {
    return "grant_expired";
  }
  return null;
}

/**
 * Null when the membership is in force at `at`; otherwise why it is not.
 *
 * Order matters and is stated rather than incidental: a revoked membership reads
 * as revoked even if its grant had also expired, because revocation is the act
 * someone performed and the expiry is only the clock running out.
 */
export function grantLapseReason(
  membership: MembershipGrant,
  at: IsoTimestamp,
): GrantLapseReason | null {
  if (membership.revokedAt !== null) return "revoked";
  if (membership.acceptedAt === null) return "not_accepted";
  return grantWindowLapseReason(membership, at);
}

/** Whether the membership may be resolved into a `RequestContext` at `at` (Rule 1.28). */
export function isMembershipInForce(
  membership: MembershipGrant,
  at: IsoTimestamp,
): boolean {
  return grantLapseReason(membership, at) === null;
}
