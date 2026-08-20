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
  "batteryRecordSeq" | "containerSeq" | "lotSeq" | "shipmentSeq"
>;

/**
 * `slug` is immutable after creation; `handlerSizeClass` is set by rule
 * evaluation and **never typed by a user** (Rules 3.18–3.20); the four sequence
 * counters are allocated by the database.
 */
export type UpdateOrganization = UpdateInput<
  Organization,
  | "slug"
  | "handlerSizeClass"
  | "batteryRecordSeq"
  | "containerSeq"
  | "lotSeq"
  | "shipmentSeq"
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

export type CreateMembership = CreateInput<
  Membership,
  "acceptedAt" | "revokedAt" | "revokedBy"
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

export interface MembershipQuery extends BaseQuery {
  readonly userId?: Uuid;
  readonly role?: RoleCode;
  /** `accepted_at is not null and revoked_at is null` — both halves of "active". */
  readonly isActive?: boolean;
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
