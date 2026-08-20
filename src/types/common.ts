/**
 * The scalar primitives every entity type is built from.
 *
 * This module imports nothing. `src/domain` is allowed to read it — a rule that
 * needs to name a date or a quantity should not have to invent its own alias —
 * and it deliberately carries no taxonomy import, so `src/domain/taxonomy` and
 * this file can both be depended on without a cycle. Import `@/types/common`
 * from `src/domain`, never the `@/types` barrel.
 */

/** A `uuid` primary or foreign key. */
export type Uuid = string;

/**
 * A `timestamptz`, serialised as an ISO 8601 string in UTC — `2026-08-19T14:22:31.004Z`.
 *
 * Stored UTC always (`ERD.md` §2.2). **Wall-clock interpretation happens once, in
 * a site's IANA timezone, and only where a rule requires it** (`TECHNICAL_SPEC.md`
 * §6.4): a clock that starts on 3 March in Denver is due on 3 March, whatever
 * timezone the serverless function happens to run in. A timestamp that has been
 * reduced to a calendar day is an {@link IsoDate}, and the reduction is where the
 * zone was applied.
 */
export type IsoTimestamp = string;

/**
 * A `date` — a calendar day with no time and no zone, `YYYY-MM-DD`.
 *
 * Columns suffixed `_on` carry this (`TAXONOMY.md` §4.3). **The governing date
 * differs by rule and is named by the rule that needs it** (Rule 12.20): intake
 * date for classification (Rule 3.6), accumulation start date for the storage
 * clock (Rule 4.5), print date for artwork (Rule 5.21), shipment date for
 * packaging exceptions (Rule 5.19).
 */
export type IsoDate = string;

/**
 * An exact decimal quantity, carried as its digits — `"0.045"`, `"600.000"`.
 *
 * `ERD.md` §2.3 is unambiguous: `numeric(p,s)` for every quantity a rule reads or
 * a document prints, and **no `float` and no `double precision`, anywhere**. A
 * JavaScript `number` is a double, so typing these as `number` would reintroduce
 * in the application exactly the hazard the schema went out of its way to keep
 * out of the database — and the first place it would surface is a mass total on
 * a shipping paper.
 *
 * So the digits travel as text, which is also what a Postgres driver returns for
 * `numeric` by default, so the mock and Supabase adapters agree without a
 * conversion step. Arithmetic on these is a decimal operation, not `+`.
 *
 * SI units only, one unit per concept: mass in kg, energy in Wh, volume in m³.
 * The unit is part of the column name, never of the value.
 */
export type Decimal = string;

/** A `jsonb` value. Structure is stated by the column that holds it. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/** A `jsonb` object. */
export type JsonObject = { readonly [key: string]: JsonValue };

/**
 * The address shape carried by `organization.primary_address`,
 * `organization.mailing_address`, `container.site_address`,
 * `shipment.origin_address` and `shipment.destination_address`.
 */
export interface PostalAddress {
  readonly line1: string;
  readonly line2?: string | null;
  readonly city: string;
  readonly region: string;
  readonly postalCode: string;
  /** ISO 3166-1 alpha-2. */
  readonly country: string;
}

/**
 * An IANA timezone name — `America/Denver`.
 *
 * Never an offset and never an abbreviation. `container.site_time_zone` is where
 * a storage clock's day boundaries are evaluated (Rule 4.29).
 */
export type TimeZone = string;

/** A SHA-256 digest, lower-case hex. */
export type Sha256 = string;

/**
 * Columns every tenant-scoped table carries.
 *
 * `organization_id` is `not null references organization(id) on delete restrict`
 * on every one of them (`ERD.md` §2.6). 27 of the 32 tables carry it; the four
 * that do not are `"user"` and the three platform rule tables, and `organization`
 * is tenant-scoped by its own `id`.
 */
export interface TenantScoped {
  readonly organizationId: Uuid;
}

/** `created_at` / `updated_at`. Never supplied by the application (`ERD.md` §2.2). */
export interface Timestamped {
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
}

/** `created_at` only — the shape of an append-only row, which is never updated. */
export interface Created {
  readonly createdAt: IsoTimestamp;
}

/**
 * `created_by` / `updated_by`.
 *
 * Nullable only where the actor can legitimately be the system — an alert job, a
 * trigger, an integration webhook (`ERD.md` §2.13). Members are deactivated,
 * never deleted, so a name here stays attached to every record and audit event
 * its holder created, forever (Rule 1.13).
 */
export interface Attributed {
  readonly createdBy: Uuid | null;
  readonly updatedBy: Uuid | null;
}
