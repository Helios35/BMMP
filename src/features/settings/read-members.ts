import "server-only";

import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import {
  grantLapseReason,
  requiresGrantExpiry,
  type GrantLapseReason,
} from "@/domain/access/grant";
import type { Membership, User } from "@/types/tenancy";
import type { IsoTimestamp } from "@/types/common";

/**
 * Everything `/settings/users` renders, read once through `src/data`.
 *
 * **`membership` is tenant-scoped, so this returns the active organization's
 * rows and nothing else** — `MEMBERSHIP.joRainier` is invisible to a Cascade
 * caller, and that is this route's tenant-scoping assertion rather than a
 * filter written here.
 *
 * Names are resolved **only for ids that came out of this organization's own
 * membership rows.** `user` is a platform table with an unscoped `get`; calling
 * `users.list` from a tenant screen would return people who are not members of
 * anything the caller can see.
 */

/** Rule 1.12 guarantees at least one member; the cap is far beyond any B1a tenant. */
const MEMBERSHIP_SCAN_LIMIT = 100;

/**
 * **Plain text, never a `StatusBadge`.**
 *
 * No `TAXONOMY.md` system governs membership status, `StatusBadge` renders
 * taxonomy values only, and a badge over an ungoverned string is how an invented
 * vocabulary acquires a colour — which is the first step to it being treated as
 * a governed one (`TAXONOMY.md` §1.1).
 */
export const MEMBERSHIP_STATUSES = [
  "Active",
  "Invited",
  "Deactivated",
] as const;

export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

/** Active first, then pending invitations, then people whose access ended. */
const STATUS_ORDER: Readonly<Record<MembershipStatus, number>> = {
  Active: 0,
  Invited: 1,
  Deactivated: 2,
};

export interface MemberGrantView {
  /** Rule 1.18 — a grant with no stated reason is not a recorded grant. */
  readonly reason: string | null;
  /** Rule 12.19 — what it covers, and what an export under it may contain. */
  readonly scope: string | null;
  /** Rule 1.15 — required. `null` here is a data defect, read as "no access". */
  readonly expiresAt: IsoTimestamp | null;
  readonly isInForce: boolean;
  /** Why it is not in force. `null` while it is. */
  readonly lapseReason: GrantLapseReason | null;
}

export interface MemberRow {
  readonly membership: Membership;
  readonly user: User | null;
  /** `user.fullName`, or the invited address while an invitation is outstanding. */
  readonly displayName: string;
  readonly email: string | null;
  readonly status: MembershipStatus;
  /** Rule 1.11 — the row the viewer cannot change the role of. */
  readonly isViewer: boolean;
  /**
   * Present for the two roles that hold access **by grant rather than by
   * employment** — P5, and P6 acting inside a tenant — and for any row that
   * carries grant data (Rules 1.15, 1.17, 1.18; D-31).
   */
  readonly grant: MemberGrantView | null;
}

export interface MembersView {
  readonly rows: readonly MemberRow[];
  /** D-35, Rule 1.12. An organization always retains at least one. */
  readonly bindingAuthorityHolders: readonly MemberRow[];
  readonly grantedRows: readonly MemberRow[];
  readonly asOf: IsoTimestamp;
}

function membershipStatus(membership: Membership): MembershipStatus {
  // Revoked outranks everything: it is an act someone performed, where the other
  // two are properties of where the row sits in its lifecycle.
  if (membership.revokedAt !== null) return "Deactivated";
  if (membership.acceptedAt === null) return "Invited";
  return "Active";
}

function grantView(
  membership: Membership,
  asOf: IsoTimestamp,
): MemberGrantView | null {
  const carriesGrantData =
    membership.grantReason !== null ||
    membership.grantScope !== null ||
    membership.grantExpiresAt !== null;

  if (!requiresGrantExpiry(membership.role) && !carriesGrantData) return null;

  const lapseReason = grantLapseReason(membership, asOf);
  return {
    reason: membership.grantReason,
    scope: membership.grantScope,
    expiresAt: membership.grantExpiresAt,
    isInForce: lapseReason === null,
    lapseReason,
  };
}

/**
 * Read the member list for the active organization.
 *
 * `asOf` is an argument with a default rather than a clock read inside the
 * composition: **Rule 1.28's mid-session expiry is proven by passing `at`
 * forward in a test, never by waiting** (D-31).
 */
export async function readMembers(
  ctx: RequestContext,
  asOf: IsoTimestamp = new Date().toISOString(),
): Promise<MembersView> {
  const page = await data.memberships.list(ctx, {
    limit: MEMBERSHIP_SCAN_LIMIT,
  });

  const rows: MemberRow[] = [];
  for (const membership of page.items) {
    const user =
      membership.userId === null
        ? null
        : await data.users.get(ctx, membership.userId);

    rows.push({
      membership,
      user,
      displayName:
        user?.fullName ?? membership.invitedEmail ?? user?.email ?? "Unnamed",
      email: user?.email ?? membership.invitedEmail ?? null,
      status: membershipStatus(membership),
      isViewer: membership.userId !== null && membership.userId === ctx.userId,
      grant: grantView(membership, asOf),
    });
  }

  rows.sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      a.displayName.localeCompare(b.displayName),
  );

  return {
    rows,
    // Rule 1.12 counts **active** holders: a deactivated member's flag is
    // history, not authority, and counting it would let an organization believe
    // it still has someone who can sign (Rule 7.3).
    bindingAuthorityHolders: rows.filter(
      (row) => row.membership.holdsBindingAuthority && row.status === "Active",
    ),
    grantedRows: rows.filter((row) => row.grant !== null),
    asOf,
  };
}
