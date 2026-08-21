import type {
  AppendInput,
  AppendOnlyRepository,
  BaseQuery,
  CreateInput,
  Repository,
  UpdateInput,
} from "./repository";
import type {
  Membership,
  Organization,
  TosAcceptance,
  User,
} from "@/types/tenancy";
import type { RoleCode } from "@/domain/taxonomy/role";
import type { TosAcceptanceStatus } from "@/domain/taxonomy/tos-acceptance-status";
import type { Uuid } from "@/types/common";

/** Tenancy and identity contracts — `ERD.md` §3. */

// --- organization -----------------------------------------------------------

export type CreateOrganization = CreateInput<
  Organization,
  | "batteryRecordSeq"
  | "containerSeq"
  | "lotSeq"
  | "shipmentSeq"
  | "emergencyVerifiedAt"
  | "emergencyVerifiedBy"
>;

/**
 * `slug` is immutable after creation; `handlerSizeClass` is set by rule
 * evaluation and **never typed by a user** (Rules 3.18–3.20); the four sequence
 * counters are allocated by the database.
 *
 * `emergencyVerifiedAt` and `emergencyVerifiedBy` are absent from both shapes
 * for a different reason: **verification is a recorded act, not a field**
 * (D-32, Rule 5.6). A profile edit that can stamp its own verification date is
 * not a verification, and the actor has to come from `ctx` the way `createdBy`
 * does rather than from whatever the caller sent. They move through a dedicated
 * method, which the unit that builds the write path adds — **so nothing in this
 * unit can set them, which is correct: every organization reads as unverified
 * and that is exactly the state D-32 defines the behaviour for.**
 * `emergencyReverificationIntervalMonths` stays settable: it is configuration,
 * not evidence.
 */
export type UpdateOrganization = UpdateInput<
  Organization,
  | "slug"
  | "handlerSizeClass"
  | "batteryRecordSeq"
  | "containerSeq"
  | "lotSeq"
  | "shipmentSeq"
  | "emergencyVerifiedAt"
  | "emergencyVerifiedBy"
>;

export interface OrganizationQuery extends BaseQuery {
  readonly slug?: string;
}

// --- user -------------------------------------------------------------------

export type CreateUser = CreateInput<User, "lastSeenAt">;

/**
 * `isPlatformAdmin` is not settable through this contract. **Only P6 may grant
 * or revoke the P6 role** (`SITE_ARCHITECTURE.md` §5.2), and it is a
 * platform-level act rather than a profile edit.
 */
export type UpdateUser = UpdateInput<User, "isPlatformAdmin" | "email">;

export interface UserQuery extends BaseQuery {
  readonly email?: string;
  readonly isPlatformAdmin?: boolean;
}

// --- membership -------------------------------------------------------------

/**
 * `holdsBindingAuthority` is not settable at creation. **Assigning it is its own
 * recorded act** (D-35) — a member who can sign on the organization's behalf
 * (Rule 7.3) does not acquire that quietly inside an invitation, and an
 * invitation that could confer it would be one act producing two grants. A new
 * membership starts without it; {@link UpdateMembership} is the assignment path.
 *
 * The three grant fields **are** settable here, and deliberately: Rule 1.15 says
 * a grant without an expiry cannot be created, which is only enforceable if the
 * expiry arrives with the insert.
 */
export type CreateMembership = CreateInput<
  Membership,
  "acceptedAt" | "revokedAt" | "revokedBy" | "holdsBindingAuthority"
>;

/**
 * `role` moves here, and a role change **takes effect on the next request**
 * because access is re-checked every request (Rule 1.28) — never retroactively
 * on records already created.
 *
 * **Revocation is never a delete**: `revokedAt` is set and the row stays, so a
 * deactivated member's name remains attached to everything they created
 * (Rule 1.13).
 */
export type UpdateMembership = UpdateInput<
  Membership,
  "invitedEmail" | "inviteTokenHash" | "invitedBy" | "invitedAt"
>;

/**
 * **Every field here narrows within the active organization, `userId` included.**
 *
 * `membership` is tenant-scoped, so `list` returns the active organization's
 * rows and nothing else — `userId` here asks *"this user's membership **here**"*,
 * never *"this user's memberships"*. That is correct for every screen and it is
 * useless for the organization switcher, which has to name the organizations the
 * caller is **not** currently acting in, before an active organization exists at
 * all.
 *
 * **That read is `identity.listSessionMemberships` (see `./identity.ts`) and it
 * is the only unscoped one in the contract.** It is bounded to the caller's own
 * user id and returns no tenant row. Do not add a second cross-organization read
 * here: an unscoped method on a tenant repository is the shape a tenancy leak
 * takes, and one of them with a written justification is a seam — two is a
 * habit.
 */
export interface MembershipQuery extends BaseQuery {
  readonly userId?: Uuid;
  readonly role?: RoleCode;
  /** `accepted_at is not null and revoked_at is null` — both halves of "active". */
  readonly isActive?: boolean;
  /** D-35. The `/settings/users` binding-authority column, and Rule 1.12's "at least one" check. */
  readonly holdsBindingAuthority?: boolean;
  readonly invitedEmail?: string;
}

// --- tos_acceptance ---------------------------------------------------------

/**
 * Append-only, with the one narrow exception `ERD.md` §3.4 documents: `status`
 * and the revocation fields move over the row's life, and everything
 * evidentiary is frozen by trigger.
 *
 * That lifecycle movement is expressed as {@link TosAcceptanceRepository.setStatus}
 * rather than as a general `update`, so the contract cannot be used to change
 * what was agreed, by whom, or when (Rule 7.5).
 */
export type CreateTosAcceptance = AppendInput<
  TosAcceptance,
  "revokedAt" | "revokedBy" | "revocationReason"
>;

export interface TosAcceptanceQuery extends BaseQuery {
  readonly status?: TosAcceptanceStatus;
  readonly documentKey?: string;
  /** The single live acceptance per document — `status in ('in_force','grace')`. */
  readonly isLive?: boolean;
}

export interface TosAcceptanceRepository extends AppendOnlyRepository<
  TosAcceptance,
  CreateTosAcceptance,
  TosAcceptanceQuery
> {
  /**
   * Move a consent row along its lifecycle — the **only** mutation this entity
   * admits.
   *
   * `in_force` → `grace` → `lapsed` / `superseded` / `revoked`. **None of these
   * changes what already happened**: per-record training eligibility is stamped
   * at capture (T-12) and no status here can claw it back (Rules 7.6, 7.18).
   *
   * **P6 can never accept, or move, a tenant's acceptance on its behalf**
   * (Rules 1.19, 7.4).
   */
  setStatus(
    ctx: import("./context").RequestContext,
    id: Uuid,
    input: {
      readonly status: TosAcceptanceStatus;
      readonly revokedBy?: Uuid;
      readonly revocationReason?: string;
    },
  ): Promise<TosAcceptance>;
}

export type OrganizationRepository = Repository<
  Organization,
  CreateOrganization,
  UpdateOrganization,
  OrganizationQuery
>;

export type UserRepository = Repository<
  User,
  CreateUser,
  UpdateUser,
  UserQuery
>;

export type MembershipRepository = Repository<
  Membership,
  CreateMembership,
  UpdateMembership,
  MembershipQuery
>;
