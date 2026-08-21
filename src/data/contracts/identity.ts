import type { RequestContext } from "./context";
import type { RoleCode } from "@/domain/taxonomy/role";
import type { IsoTimestamp, Uuid } from "@/types/common";

/**
 * Identity, sessions and invitations — `ERD.md` §3, `TECHNICAL_SPEC.md` §9.1.
 *
 * **The screens are real, the guard is real, the tenancy is real, the audit is
 * real. Only the credential check is fake** (D-39). Supabase Auth is not wired
 * in B1a, so `verifyCredentials` is a fixture lookup in the mock and
 * `NotImplementedError` in the Supabase adapter — but it sits on this contract,
 * behind the same seam every other read goes through, so that when Supabase Auth
 * lands **one module changes and no screen does**.
 */

/**
 * The caller before a session exists — `/sign-in`, `/sign-up`, `/invite/[token]`.
 *
 * **This is the one exception to "every contract method takes a `RequestContext`
 * first" (see `./index.ts`), and it is written down here so it is not copied
 * elsewhere.** The three public routes of `SITE_ARCHITECTURE.md` §5.6 cannot
 * carry a `RequestContext`, because resolving one is the whole point of the
 * methods that take this instead. Every other method on every other repository
 * takes the full context. **A new method anywhere else that takes a
 * `PublicContext` is a leak, not a precedent** — if the caller can name a user
 * and an organization, it takes a `RequestContext`.
 *
 * It carries only what a log line and an `audit_event` need. Deliberately no
 * user id, no organization id and no role: nothing here may be mistaken for an
 * identity the caller has not yet proved.
 */
export interface PublicContext {
  /** Threads one attempt through every log line it produces. Minted per request. */
  readonly correlationId: string;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}

/**
 * One organization this user may act in, with everything the guard and the
 * organization switcher need and nothing they do not.
 *
 * A user may belong to several organizations but **acts in exactly one at a
 * time** (Rules 1.3, 1.5). This is a candidate, not an active context — the
 * active one is a {@link RequestContext}, and only `resolveSession` mints one.
 */
export interface SessionMembership {
  readonly membershipId: Uuid;
  readonly organizationId: Uuid;
  readonly organizationName: string;
  /** T-37. This user's role **in this organization** (Rules 1.4, 1.22). */
  readonly role: RoleCode;
  /** D-35. An attribute of a P2 membership; the only holder who may accept terms (Rule 7.3). */
  readonly holdsBindingAuthority: boolean;
  /** Rules 1.15, 1.18 — null for an ordinary member, required for P5 and for a P6 support grant. */
  readonly grantExpiresAt: IsoTimestamp | null;
  readonly grantScope: string | null;
  readonly grantReason: string | null;
}

export interface SessionIdentity {
  readonly userId: Uuid;
  readonly email: string;
  readonly fullName: string | null;
  /** `user.is_platform_admin` — **platform scope alone confers no tenant data access** (Rule 1.17). */
  readonly isPlatformAdmin: boolean;
  /** Only memberships in force at the instant this was resolved (Rule 1.28). */
  readonly memberships: readonly SessionMembership[];
}

/**
 * What `/invite/[token]` found. **All five are a 200 — a spent invitation is a
 * state, not an error**, and each gets a stated reason and a "Request a new
 * invitation" action rather than a raw error page (`UX_SPEC.md` §3.3).
 *
 * Precedence when more than one holds: `revoked` → `used` → `expired` →
 * `unknown`.
 */
export type InvitationState =
  "valid" | "expired" | "used" | "revoked" | "unknown";

/** The four states that cannot be accepted. Each renders its own copy; none renders tenant data. */
export type UnusableInvitationState = Exclude<InvitationState, "valid">;

/**
 * A live invitation, and the **only** arm of {@link InvitationView} that carries
 * anything belonging to a tenant.
 *
 * Organization name, role and inviter and nothing else — `UX_SPEC.md` §3.3:
 * **no tenant data before authentication.** No record counts, no site list, no
 * member list, no logo, no address.
 */
export interface ValidInvitation {
  readonly state: "valid";
  readonly organizationName: string;
  /** T-37. Rendered through `ROLE_LABELS`, never as a hand-written string. */
  readonly role: RoleCode;
  /** Null where the inviter cannot be resolved — the founding bootstrap has none. */
  readonly invitedByName: string | null;
  readonly invitedEmail: string;
  /** True when no `user` row exists for `invitedEmail` — routes to `/sign-up` rather than `/sign-in` (Flow E step 2). */
  readonly requiresAccount: boolean;
}

/**
 * A token that cannot be accepted, and **it discloses nothing**.
 *
 * The absence of every tenant field on this arm is the enforcement rather than a
 * convention: a withdrawn, spent, expired or unrecognised token hands its holder
 * no organization name, no role and no inviter, so `unknown` reads identically
 * for a well-formed token that never existed and for a string of gibberish
 * (Rule 1.2). A screen cannot leak what the type does not carry.
 */
export interface UnusableInvitation {
  readonly state: UnusableInvitationState;
}

export type InvitationView = ValidInvitation | UnusableInvitation;

export interface CredentialInput {
  readonly email: string;
  readonly password: string;
}

/**
 * Rule 1.8 — the two ways into an organization, and there is no third. Founding
 * carries `organizationName`; accepting carries `invitationToken`. Never both.
 */
export interface CreateAccountInput {
  readonly email: string;
  readonly password: string;
  readonly fullName: string;
  /** Present when signing up from an invitation; absent when founding an organization. */
  readonly invitationToken: string | null;
  /** Absent when accepting an invitation. */
  readonly organizationName: string | null;
  /** Rule 7.5 — the exact version accepted, never inferred later. */
  readonly tosDocumentKey: string;
  readonly tosDocumentVersion: string;
  /** D-2. The grant stated in the visible label at sign-up (`UX_SPEC.md` §3.2). */
  readonly trainingRightsGranted: boolean;
}

export interface IdentityRepository {
  /**
   * **The fake half, and the only fake half** (D-39). Under Supabase this is
   * `auth.signInWithPassword`; in the mock it is a fixture lookup against a
   * single dev password. Returns `null` on any failure and **never says which
   * half was wrong** (`UX_SPEC.md` §3.1).
   */
  verifyCredentials(
    pub: PublicContext,
    input: CredentialInput,
  ): Promise<SessionIdentity | null>;

  /**
   * Rule 1.8. Founding creates `organization`, `user`, a `facility_manager`
   * `membership` holding binding authority (D-35), and the `tos_acceptance`
   * (Rule 7.5). Invited creates `user` and accepts the token's `membership`.
   *
   * **A `security definer` bootstrap.** `TECHNICAL_SPEC.md` §9.5 gives
   * `organization` INSERT to the platform admin only, so self-serve founding is
   * an elevated function in production too, not an ordinary insert.
   */
  createAccount(
    pub: PublicContext,
    input: CreateAccountInput,
  ): Promise<SessionIdentity>;

  /**
   * Takes the **plaintext** token; the adapter hashes it. The token itself is
   * never stored — `membership.invite_token_hash` holds SHA-256 of it
   * (`ERD.md` §3.3).
   */
  readInvitation(pub: PublicContext, token: string): Promise<InvitationView>;

  /**
   * Accept an invitation as a user who already exists. **Idempotent**: a second
   * call finds `acceptedAt` already set and the invitation reads as `used`.
   */
  acceptInvitation(
    pub: PublicContext,
    input: { readonly token: string; readonly userId: Uuid },
  ): Promise<SessionIdentity>;

  /**
   * **Rule 1.28, and the whole reason this method exists.** Called on **every
   * request** by the guard, never only at sign-in. Returns `null` when the
   * membership is revoked, not yet accepted, or its grant has expired — which is
   * how an expired grant ends access inside an already-open session.
   *
   * `at` is passed in rather than read from the clock, so the behaviour is
   * unit-testable without waiting (D-31).
   */
  resolveSession(
    pub: PublicContext,
    input: {
      readonly userId: Uuid;
      readonly organizationId: Uuid;
      readonly at: IsoTimestamp;
    },
  ): Promise<RequestContext | null>;

  /**
   * Every organization this user may act in right now. **The organization
   * switcher's only source, and the reason E-16 is reachable at all.**
   *
   * ## Why this one read is not scoped to an organization
   *
   * `membership` is tenant-scoped, so `memberships.list` structurally cannot see
   * a user's memberships in the organizations they are not currently acting in —
   * correct for every screen, and useless for a switcher whose whole job is to
   * name the organizations the user is *not* in yet. This read also runs
   * **before** an active organization exists at all, which is why it lives on
   * the identity/session path rather than on `MembershipRepository`.
   *
   * **An unscoped read is the shape of a tenancy leak, so read the bound
   * carefully:** it is scoped to the caller's own `user_id` and to nothing else,
   * it returns memberships rather than tenant records, and it says nothing about
   * an organization beyond its id, its name and this user's own standing in it.
   * Under Supabase the equivalent is `app.member_org_ids()`, which is exactly the
   * RLS floor of `TECHNICAL_SPEC.md` §9.1 — *RLS permits every organization the
   * user actually belongs to, and the application narrows to the active one.*
   * **This method is that floor. Widening it to accept a `userId` other than the
   * caller's own, or to return any tenant row, breaks Rule 1.2.**
   */
  listSessionMemberships(
    pub: PublicContext,
    input: { readonly userId: Uuid; readonly at: IsoTimestamp },
  ): Promise<readonly SessionMembership[]>;
}
