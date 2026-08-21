import type { RequestContext } from "@/data/contracts/context";
import type {
  CreateAccountInput,
  CredentialInput,
  IdentityRepository,
  InvitationView,
  PublicContext,
  SessionIdentity,
  SessionMembership,
} from "@/data/contracts/identity";
import type { Membership, Organization, User } from "@/types/tenancy";
import type { IsoTimestamp, Uuid } from "@/types/common";
import { isMembershipInForce } from "@/domain/access/grant";
import { ConflictError, ValidationError } from "@/lib/errors";
import { now } from "./factory";
import { nextId } from "./ids";
import { mockStore } from "./store";

/**
 * Identity, mocked — D-39.
 *
 * `TECHNICAL_SPEC.md` §9.1 specifies Supabase Auth, and Supabase is not wired in
 * B1a. **So the screens are real, the guard is real, the tenancy is real and the
 * audit is real; only the credential check is fake.** It sits on the same
 * contract every other read goes through, so when Supabase Auth lands one module
 * changes and no screen does.
 *
 * Three of the six methods take a {@link PublicContext} rather than a
 * {@link RequestContext}, because resolving one is what they are for. That is the
 * contract's single exception and it is documented in
 * `src/data/contracts/identity.ts`.
 */

/**
 * The one password every fixture identity signs in with.
 *
 * **Fake credentials for fake data.** It never reaches production:
 * `resolveAdapter` refuses `DATA_ADAPTER=mock` under `VERCEL_ENV=production` and
 * throws rather than falling back (§5.1.1, D-16). It is not prefixed
 * `NEXT_PUBLIC_` and it is not an environment variable, **because it is a
 * fixture, not a secret** — an environment variable would imply there is a
 * deployment where changing it matters.
 */
export const MOCK_DEV_PASSWORD = "bmmp-dev-password";

const store = () => mockStore();

/** SHA-256, hex. Web Crypto rather than `node:crypto`, so the edge runtime resolves it too. */
async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Append a row with no policy check, because **there is no caller to check.**
 *
 * `createAccount` runs before the caller holds an identity or an organization,
 * and founding one requires an `organization` INSERT that
 * `TECHNICAL_SPEC.md` §9.5 admits for the platform admin alone — so in
 * production this is a `security definer` sign-up bootstrap rather than an
 * ordinary insert, and `POLICY_MATRIX.organization.insert` is `[]` faithfully.
 *
 * **Used by `createAccount` and `acceptInvitation` and by nothing else.** Every
 * other write in the mock goes through the policy check.
 */
function bootstrapAppend<T extends { readonly id: Uuid }>(
  table: { all(): readonly T[]; replaceAll(rows: readonly T[]): void },
  row: T,
): T {
  table.replaceAll([...table.all(), row]);
  return row;
}

/** The same bootstrap, patching a row that already exists — an invitation being accepted. */
function bootstrapPatch<T extends { readonly id: Uuid }>(
  table: { all(): readonly T[]; replaceAll(rows: readonly T[]): void },
  id: Uuid,
  patch: Partial<T>,
): void {
  table.replaceAll(
    table.all().map((row) => (row.id === id ? { ...row, ...patch } : row)),
  );
}

function findUserById(userId: Uuid): User | null {
  return (
    store()
      .users.all()
      .find((candidate) => candidate.id === userId) ?? null
  );
}

function findUserByEmail(email: string): User | null {
  const needle = email.trim().toLowerCase();
  return (
    store()
      .users.all()
      .find((candidate) => candidate.email.toLowerCase() === needle) ?? null
  );
}

function findOrganization(organizationId: Uuid): Organization | null {
  return (
    store()
      .organizations.all()
      .find((candidate) => candidate.id === organizationId) ?? null
  );
}

/**
 * Reads `FIXTURES.organizations` directly rather than through
 * `scopedOrganizations`, which would refuse — correctly, since no active
 * organization exists yet. A membership whose organization is missing is a data
 * defect and is dropped rather than rendered with a blank name.
 */
function toSessionMembership(membership: Membership): SessionMembership | null {
  const organization = findOrganization(membership.organizationId);
  if (organization === null) return null;
  return {
    membershipId: membership.id,
    organizationId: organization.id,
    organizationName: organization.name,
    role: membership.role,
    holdsBindingAuthority: membership.holdsBindingAuthority,
    grantExpiresAt: membership.grantExpiresAt,
    grantScope: membership.grantScope,
    grantReason: membership.grantReason,
  };
}

/**
 * Every membership this user may act in **right now**.
 *
 * Sorted by organization name so the switcher and the sign-in default land on
 * the same entry every run — an order that depends on insertion order is an
 * order that changes when a fixture is added.
 */
function inForceMembershipsFor(
  userId: Uuid,
  at: IsoTimestamp,
): readonly SessionMembership[] {
  return store()
    .memberships.all()
    .filter(
      (membership) =>
        membership.userId === userId && isMembershipInForce(membership, at),
    )
    .flatMap((membership) => {
      const session = toSessionMembership(membership);
      return session === null ? [] : [session];
    })
    .sort((a, b) => a.organizationName.localeCompare(b.organizationName));
}

function toSessionIdentity(user: User, at: IsoTimestamp): SessionIdentity {
  return {
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    isPlatformAdmin: user.isPlatformAdmin,
    memberships: inForceMembershipsFor(user.id, at),
  };
}

/**
 * The invitation a token names, whatever state it is in.
 *
 * Unscoped by necessity: the holder of an invitation is, by definition, not yet
 * a member of the organization that issued it. The bound is the token — a caller
 * who does not hold one learns nothing, and a caller who does learns only what
 * {@link InvitationView} carries.
 */
async function findInvitation(token: string): Promise<Membership | null> {
  const trimmed = token.trim();
  if (trimmed === "") return null;
  const hash = await sha256Hex(trimmed);
  return (
    store()
      .memberships.all()
      .find((membership) => membership.inviteTokenHash === hash) ?? null
  );
}

/**
 * `revoked` → `used` → `expired`, and `null` when the invitation is live.
 *
 * The order is the contract's and it matters: an invitation that was withdrawn
 * **and** has since expired reads as withdrawn, because that is the fact its
 * holder needs.
 */
function unusableReason(
  membership: Membership,
  at: IsoTimestamp,
): "revoked" | "used" | "expired" | null {
  if (membership.revokedAt !== null) return "revoked";
  if (membership.acceptedAt !== null) return "used";
  if (membership.inviteExpiresAt !== null && membership.inviteExpiresAt <= at) {
    return "expired";
  }
  return null;
}

export const mockIdentity: IdentityRepository = {
  async verifyCredentials(
    _pub: PublicContext,
    input: CredentialInput,
  ): Promise<SessionIdentity | null> {
    const user = findUserByEmail(input.email);
    // One `null` for every failure — no timing games and no partial hints, so a
    // caller cannot learn which half was wrong or which addresses exist
    // (`UX_SPEC.md` §3.1).
    if (user === null) return null;
    // Rule 1.13 — deactivated, never deleted. The row stays and the access does
    // not.
    if (user.status !== "active") return null;
    if (input.password !== MOCK_DEV_PASSWORD) return null;
    return toSessionIdentity(user, now());
  },

  async createAccount(
    pub: PublicContext,
    input: CreateAccountInput,
  ): Promise<SessionIdentity> {
    const at = now();
    const hasInvitation = input.invitationToken !== null;
    const hasOrganizationName = input.organizationName !== null;
    // Rule 1.8 — founding or invited, and there is no third way. Both at once is
    // one act producing two grants.
    if (hasInvitation === hasOrganizationName) {
      throw new ValidationError({
        userMessage:
          "An account is created either by founding an organization or by accepting an invitation.",
        correlationId: pub.correlationId,
        context: { hasInvitation, hasOrganizationName },
      });
    }
    if (findUserByEmail(input.email) !== null) {
      throw new ConflictError({
        userMessage: "An account already exists for that email address.",
        correlationId: pub.correlationId,
      });
    }

    const user: User = {
      id: nextId(),
      email: input.email,
      fullName: input.fullName,
      phone: null,
      avatarUrl: null,
      // Never conferred at sign-up. Granting P6 is a platform-level act
      // (`SITE_ARCHITECTURE.md` §5.2).
      isPlatformAdmin: false,
      locale: null,
      status: "active",
      lastSeenAt: null,
      createdAt: at,
      updatedAt: at,
    };
    bootstrapAppend(store().users, user);

    if (hasInvitation) {
      const membership = await findInvitation(input.invitationToken ?? "");
      if (membership === null || unusableReason(membership, at) !== null) {
        throw new ValidationError({
          userMessage: "That invitation link isn't valid.",
          correlationId: pub.correlationId,
        });
      }
      bootstrapPatch<Membership>(store().memberships, membership.id, {
        userId: user.id,
        acceptedAt: at,
        updatedAt: at,
      });
      return toSessionIdentity(user, at);
    }

    const organization: Organization = {
      id: nextId(),
      name: input.organizationName ?? "",
      legalName: null,
      slug: slugify(input.organizationName ?? ""),
      handlerIdentifier: null,
      // T-15. Determined by rule evaluation against quantity on site, never
      // typed by a user (Rules 3.18–3.20) — so a new organization starts
      // undetermined rather than guessing small.
      handlerSizeClass: "undetermined",
      primaryAddress: {
        line1: "",
        line2: null,
        city: "",
        region: "",
        postalCode: "",
        country: "US",
      },
      mailingAddress: null,
      timeZone: "UTC",
      // Rule 3.10 — no fallback jurisdiction and no "assume federal".
      // Classification is blocked until someone supplies one, never defaulted.
      primaryJurisdictionId: null,
      jurisdictionProfile: null,
      emergencyResponsePhone: null,
      emergencyResponseContractRef: null,
      // D-32 — verification is a recorded act with a person attached, so a new
      // organization has none and its emergency number cannot go on a shipping
      // paper until someone performs one (Rule 5.6).
      emergencyVerifiedAt: null,
      emergencyVerifiedBy: null,
      emergencyReverificationIntervalMonths: null,
      defaultTransportMode: null,
      status: "active",
      batteryRecordSeq: 0,
      containerSeq: 0,
      lotSeq: 0,
      shipmentSeq: 0,
      createdAt: at,
      updatedAt: at,
      createdBy: user.id,
      updatedBy: user.id,
    };
    bootstrapAppend(store().organizations, organization);

    const membership: Membership = {
      id: nextId(),
      organizationId: organization.id,
      userId: user.id,
      invitedEmail: null,
      role: "facility_manager",
      // D-35, Rule 1.12 — the founder holds it, because an organization that
      // starts with nobody able to accept its terms can never accept them.
      holdsBindingAuthority: true,
      invitedBy: null,
      invitedAt: null,
      inviteTokenHash: null,
      inviteExpiresAt: null,
      acceptedAt: at,
      revokedAt: null,
      revokedBy: null,
      grantReason: null,
      grantScope: null,
      grantExpiresAt: null,
      createdAt: at,
      updatedAt: at,
    };
    bootstrapAppend(store().memberships, membership);

    // Rule 7.5 — the exact version accepted, recorded at the instant it was
    // accepted and never inferred later.
    bootstrapAppend(store().tosAcceptances, {
      id: nextId(),
      organizationId: organization.id,
      status: "in_force",
      userId: user.id,
      documentKey: input.tosDocumentKey,
      documentVersion: input.tosDocumentVersion,
      documentContentHash: "",
      trainingRightsGranted: input.trainingRightsGranted,
      grants: { modelTraining: input.trainingRightsGranted },
      acceptedAt: at,
      inForceOn: at.slice(0, 10),
      reacceptanceDeadlineOn: null,
      supersedesTosAcceptanceId: null,
      revokedAt: null,
      revokedBy: null,
      revocationReason: null,
      ipAddress: pub.ipAddress,
      userAgent: pub.userAgent,
      createdAt: at,
      updatedAt: at,
    });

    return toSessionIdentity(user, at);
  },

  async readInvitation(
    _pub: PublicContext,
    token: string,
  ): Promise<InvitationView> {
    const at = now();
    const membership = await findInvitation(token);
    // `unknown` reads identically for a well-formed token that never existed and
    // for a string of gibberish (Rule 1.2).
    if (membership === null) return { state: "unknown" };

    const unusable = unusableReason(membership, at);
    if (unusable !== null) return { state: unusable };

    const organization = findOrganization(membership.organizationId);
    // A live invitation with no organization or no invited address is a data
    // defect. It fails closed to `unknown` rather than rendering a card with a
    // hole in it.
    if (organization === null || membership.invitedEmail === null) {
      return { state: "unknown" };
    }
    const invitedBy =
      membership.invitedBy === null ? null : findUserById(membership.invitedBy);
    return {
      state: "valid",
      organizationName: organization.name,
      role: membership.role,
      invitedByName: invitedBy?.fullName ?? null,
      invitedEmail: membership.invitedEmail,
      // Flow E step 2 — routes to `/sign-up` rather than `/sign-in`.
      requiresAccount: findUserByEmail(membership.invitedEmail) === null,
    };
  },

  async acceptInvitation(
    pub: PublicContext,
    input: { readonly token: string; readonly userId: Uuid },
  ): Promise<SessionIdentity> {
    const at = now();
    const user = findUserById(input.userId);
    if (user === null || user.status !== "active") {
      throw new ValidationError({
        userMessage: "That invitation link isn't valid.",
        correlationId: pub.correlationId,
      });
    }

    const membership = await findInvitation(input.token);
    if (membership === null) {
      throw new ValidationError({
        userMessage: "That invitation link isn't valid.",
        correlationId: pub.correlationId,
      });
    }
    // Idempotent: the same user accepting twice finds `acceptedAt` already set
    // and gets the same identity back. A *different* user is a conflict, not a
    // repeat, and the message names neither the organization nor the holder.
    if (membership.acceptedAt !== null) {
      if (membership.userId === user.id) return toSessionIdentity(user, at);
      throw new ConflictError({
        userMessage: "This invitation has already been used.",
        correlationId: pub.correlationId,
      });
    }
    const unusable = unusableReason(membership, at);
    if (unusable !== null) {
      throw new ValidationError({
        userMessage:
          unusable === "revoked"
            ? "This invitation was withdrawn."
            : "This invitation has expired.",
        correlationId: pub.correlationId,
      });
    }
    // Rule 1.4 — one role per organization, and a user cannot hold two.
    const alreadyMember = store()
      .memberships.all()
      .some(
        (candidate) =>
          candidate.userId === user.id &&
          candidate.organizationId === membership.organizationId &&
          candidate.revokedAt === null,
      );
    if (alreadyMember) {
      throw new ConflictError({
        userMessage: "You are already a member of that organization.",
        correlationId: pub.correlationId,
      });
    }

    bootstrapPatch<Membership>(store().memberships, membership.id, {
      userId: user.id,
      acceptedAt: at,
      updatedAt: at,
    });
    return toSessionIdentity(user, at);
  },

  async resolveSession(
    pub: PublicContext,
    input: {
      readonly userId: Uuid;
      readonly organizationId: Uuid;
      readonly at: IsoTimestamp;
    },
  ): Promise<RequestContext | null> {
    const user = findUserById(input.userId);
    if (user === null || user.status !== "active") return null;

    const membership = store()
      .memberships.all()
      .find(
        (candidate) =>
          candidate.userId === input.userId &&
          candidate.organizationId === input.organizationId,
      );
    if (membership === undefined) return null;
    // **Rule 1.28.** Re-checked on every request, never only at sign-in: a
    // revoked membership, an unaccepted one, and an expired grant all end access
    // inside an already-open session.
    if (!isMembershipInForce(membership, input.at)) return null;

    return {
      userId: user.id,
      organizationId: membership.organizationId,
      role: membership.role,
      // P6 acting inside a tenant carries **both**, and only under an in-force
      // grant (Rule 1.17). `src/data/mock/index.ts` refuses
      // `tosAcceptances.setStatus` on exactly `isPlatformAdmin && role ===
      // "platform_admin"` (Rules 1.19, 7.4) — resolving P6's role as anything
      // else silently disables that refusal.
      isPlatformAdmin:
        user.isPlatformAdmin && membership.role === "platform_admin",
      correlationId: pub.correlationId,
    };
  },

  async listSessionMemberships(
    _pub: PublicContext,
    input: { readonly userId: Uuid; readonly at: IsoTimestamp },
  ): Promise<readonly SessionMembership[]> {
    return inForceMembershipsFor(input.userId, input.at);
  },
};

/** URL-safe and immutable after creation (`ERD.md` §3.1). */
function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
