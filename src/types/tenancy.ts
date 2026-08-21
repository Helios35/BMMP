import type {
  Attributed,
  IsoDate,
  IsoTimestamp,
  JsonObject,
  PostalAddress,
  Sha256,
  TenantScoped,
  TimeZone,
  Timestamped,
  Uuid,
} from "@/types/common";
import type { HandlerSizeClass } from "@/domain/taxonomy/handler-size-class";
import type { RoleCode } from "@/domain/taxonomy/role";
import type { TosAcceptanceStatus } from "@/domain/taxonomy/tos-acceptance-status";

/**
 * Tenancy and identity — `ERD.md` §3.
 *
 * `organization` · `user` · `membership` · `tos_acceptance`.
 */

/**
 * The tenant. Every tenant-scoped row in the database hangs off this table.
 *
 * Tenant isolation is a database fact, not application behaviour: 27 of the 32
 * tables carry `organization_id`, and this one is tenant-scoped by its own `id`
 * (`ERD.md` §12.1). A record belonging to another organization resolves as **not
 * found**, never as forbidden — existence is not disclosed across tenants
 * (Rule 1.2).
 */
export interface Organization extends Timestamped, Attributed {
  readonly id: Uuid;
  readonly name: string;
  /** Printed on legal documents when present. */
  readonly legalName: string | null;
  /** URL-safe, immutable after creation. */
  readonly slug: string;
  /** The regulatory handler/site identifier printed on container labels. */
  readonly handlerIdentifier: string | null;
  /**
   * T-15. Determined by quantity on site against the applicable threshold,
   * evaluated continuously with the calendar-year latch carried in the rule
   * version — **never typed by a user** (Rules 3.18–3.20).
   */
  readonly handlerSizeClass: HandlerSizeClass;
  readonly primaryAddress: PostalAddress;
  /** Falls back to `primaryAddress`. */
  readonly mailingAddress: PostalAddress | null;
  /** IANA zone. The default for every container at this org (Rule 4.29). */
  readonly timeZone: TimeZone;
  /** The **most specific** jurisdiction. The chain is walked upward, never enumerated. */
  readonly primaryJurisdictionId: Uuid | null;
  /** B1b jurisdiction profile engine. Empty in B1a. */
  readonly jurisdictionProfile: JsonObject | null;
  /** Org default for the 24-hour emergency contact number on shipping papers. */
  readonly emergencyResponsePhone: string | null;
  /** Org default emergency response information reference. */
  readonly emergencyResponseContractRef: string | null;
  readonly defaultTransportMode: string | null;
  /**
   * **No `TAXONOMY.md` system governs this column** (`ERD.md` §3.1). Internal
   * tenant lifecycle, platform-managed. Values here are a taxonomy addition
   * routed to P6, not an invention.
   */
  readonly status: string;
  /** Per-organization counters, incremented under the org row lock inside the insert transaction. */
  readonly batteryRecordSeq: number;
  readonly containerSeq: number;
  readonly lotSeq: number;
  readonly shipmentSeq: number;
}

/**
 * Profile. Credentials live in `auth.users` and share this primary key.
 *
 * Created as `public."user"` — a reserved word in Postgres, quoted at every
 * reference and **not** renamed to `users` (`ERD.md` §2.11).
 */
export interface User extends Timestamped {
  /** Same key as the auth record. */
  readonly id: Uuid;
  readonly email: string;
  readonly fullName: string | null;
  readonly phone: string | null;
  readonly avatarUrl: string | null;
  /**
   * **This is P6.** Platform Admin is not a membership role
   * (`TECHNICAL_SPEC.md` §9.2) — modelling it as one would mean granting it
   * thirty times and revoking it twenty-nine. **Platform scope alone confers no
   * tenant data access** (Rule 1.17).
   */
  readonly isPlatformAdmin: boolean;
  readonly locale: string | null;
  /**
   * **No `TAXONOMY.md` system governs this column** (`ERD.md` §3.2). Internal
   * account lifecycle. Users are deactivated, never deleted — a deactivated
   * member's name stays attached to every record and audit event they created,
   * forever (Rule 1.13).
   */
  readonly status: string;
  readonly lastSeenAt: IsoTimestamp | null;
}

/**
 * User ↔ organization with a role. The join that makes tenancy and the whole
 * policy matrix work.
 *
 * **A membership carries exactly one role** and a user cannot hold two in the
 * same organization (Rule 1.4). One person may hold different roles in different
 * organizations; the roles do not combine and do not leak (Rules 1.5, 1.22).
 * A `user.role` column is a defect (T-37).
 */
export interface Membership extends TenantScoped, Timestamped {
  readonly id: Uuid;
  /** Null until an invitation is accepted. */
  readonly userId: Uuid | null;
  /** Carries the invitation before a user exists. */
  readonly invitedEmail: string | null;
  /** T-37. One-to-one with the persona IDs, which are never stored. */
  readonly role: RoleCode;
  readonly invitedBy: Uuid | null;
  readonly invitedAt: IsoTimestamp | null;
  /** SHA-256 of a 32-byte token. **The token itself is never stored.** */
  readonly inviteTokenHash: Sha256 | null;
  /** Seven days. */
  readonly inviteExpiresAt: IsoTimestamp | null;
  /** Non-null is half of "active". */
  readonly acceptedAt: IsoTimestamp | null;
  /** Null is the other half. **Revocation is never a delete.** */
  readonly revokedAt: IsoTimestamp | null;
  readonly revokedBy: Uuid | null;
}

/**
 * The record that the training-rights grant was in force before the first
 * battery was logged — **APPEND-ONLY**.
 *
 * D-2 makes this non-negotiable and day-one, and D-26 requires the Terms of
 * Service to be in force before the first real battery is logged. A trigger on
 * `intake_session` insert refuses when the organization has no acceptance at
 * `in_force` or `grace` (Rules 7.1, 7.2, 7.14).
 *
 * **This records organisational consent. It never governs whether an
 * already-captured record may be used for training** — that is T-12 on
 * `intake_photo`, stamped once and immutable (Rules 7.6, 7.18).
 *
 * The evidentiary content is frozen: only `status` and the revocation columns
 * ever move, enforced by a `before update` trigger (`ERD.md` §3.4).
 */
export interface TosAcceptance extends TenantScoped, Timestamped {
  readonly id: Uuid;
  /**
   * T-47 — **not T-42**. `not_accepted` is a real value, not an absent row.
   */
  readonly status: TosAcceptanceStatus;
  /**
   * Who accepted. Null only while `not_accepted`. Must hold the organization's
   * binding authority (Rule 7.3); **never P6** (Rules 1.19, 7.4).
   */
  readonly userId: Uuid | null;
  /** Which document — terms, data-processing addendum. */
  readonly documentKey: string;
  /** The exact version accepted (Rule 7.5). */
  readonly documentVersion: string;
  /** SHA-256 of the exact text accepted. Proves *what* was agreed to, not just that something was. */
  readonly documentContentHash: Sha256;
  /** The D-2 grant, promoted to a column because the intake trigger reads it. */
  readonly trainingRightsGranted: boolean;
  readonly grants: JsonObject;
  /** Null while `not_accepted`. Carries a zone (Rule 7.5). */
  readonly acceptedAt: IsoTimestamp | null;
  readonly inForceOn: IsoDate | null;
  /** End of the grace window. Passing it moves `grace` → `lapsed` and blocks intake (Rule 7.14). */
  readonly reacceptanceDeadlineOn: IsoDate | null;
  /**
   * A later accepted version supersedes; the prior row is retained permanently
   * as the governing terms for every record captured under it (Rule 7.16).
   */
  readonly supersedesTosAcceptanceId: Uuid | null;
  /** Forward-only (Rule 7.18). */
  readonly revokedAt: IsoTimestamp | null;
  readonly revokedBy: Uuid | null;
  readonly revocationReason: string | null;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}
