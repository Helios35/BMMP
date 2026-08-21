import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import type { RoleCode } from "@/domain/taxonomy/role";
import type { Uuid } from "@/types/common";

/**
 * Who the people in the audit log are — `UX_SPEC.md` §3.20's Actor and Role
 * columns, and the Actor filter's options.
 *
 * **Built from `membership`, which is tenant-scoped, and never from a list of
 * users.** `user` is a platform table that every authenticated caller may read,
 * so listing it would put another organization's people in this organization's
 * filter. Walking the memberships and resolving each one's user by id keeps the
 * directory inside the tenant by construction rather than by a filter someone
 * has to remember (Rule 1.2).
 *
 * **Revoked memberships are included.** Revocation is never a delete, and a
 * deactivated member's name stays attached to everything they did (Rule 1.13) —
 * an audit log that renders a former colleague as a bare UUID is an audit log
 * that lost the answer to "who".
 */

/**
 * How many memberships one page of this directory reads.
 *
 * An engineering bound on one query, not a regulatory limit: nothing in
 * `BUSINESS_RULES.md` caps an organization's membership count, and no threshold
 * from a jurisdiction is expressed here (Rule 1.23).
 */
const MEMBERSHIP_PAGE_LIMIT = 250;

export interface AuditActor {
  readonly userId: Uuid;
  /** Full name where the account has one, the email address otherwise. */
  readonly name: string;
  /** T-37, from the membership. `null` where this actor holds none here. */
  readonly role: RoleCode | null;
  /** Whether the membership is in force right now — half of the Actor label. */
  readonly isActive: boolean;
}

export interface AuditActorDirectory {
  readonly byUserId: ReadonlyMap<string, AuditActor>;
  /** The Actor filter's options, in name order. */
  readonly options: readonly {
    readonly value: string;
    readonly label: string;
  }[];
}

export async function readAuditActorDirectory(
  ctx: RequestContext,
): Promise<AuditActorDirectory> {
  const memberships = await data.memberships.list(ctx, {
    limit: MEMBERSHIP_PAGE_LIMIT,
  });

  const byUserId = new Map<string, AuditActor>();

  for (const membership of memberships.items) {
    const userId = membership.userId;
    // An invitation that was never accepted carries no user and never appears
    // as an actor, because nobody has acted as it yet.
    if (userId === null) continue;

    const isActive =
      membership.acceptedAt !== null && membership.revokedAt === null;

    // Rule 1.4 — one role per organization. A revoked row and an in-force row
    // for the same person can still both exist; the in-force one is the answer.
    const existing = byUserId.get(userId);
    if (existing !== undefined && existing.isActive && !isActive) continue;

    const user = await data.users.get(ctx, userId);
    byUserId.set(userId, {
      userId,
      name: user?.fullName ?? user?.email ?? userId,
      role: membership.role,
      isActive,
    });
  }

  const options = [...byUserId.values()]
    .map((actor) => ({ value: actor.userId, label: actor.name }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return { byUserId, options };
}
