import type { Container } from "@/types/storage";
import type { Organization } from "@/types/tenancy";
import type { PostalAddress, TimeZone, Uuid } from "@/types/common";

/**
 * The site set an organization has, derived — `UX_SPEC.md` §3.17,
 * `SITE_ARCHITECTURE.md` §7.6b, Rule 3.5.
 *
 * **There is no `site` entity.** `ERD.md` has none: a site lives as
 * `container.siteAddress` and `container.siteTimeZone`, falling back to the
 * organization's own address and zone. This module is the one place that
 * derivation happens, so two screens can never disagree about how many sites an
 * organization has.
 *
 * **The result is always a list, and the list is never empty.** An organization
 * with one site renders a one-row list rather than one organization-wide field,
 * because *"the UI must never present one org-wide jurisdiction, even when there
 * is only one site today"* (§3.17). An organization with sites in two states
 * holds two jurisdiction profiles and classifies the same battery two ways,
 * correctly — a single field can only ever hold one state's answer, which makes
 * every other state's answer wrong.
 *
 * Pure: containers and the organization arrive as arguments and nothing here
 * reads a clock, an environment or the data layer.
 */

export interface OrganizationSite {
  /** Stable within one render, derived from the address. Not an entity id. */
  readonly key: string;
  readonly address: PostalAddress;
  /** IANA zone. Every date on this site renders in it (Rule 4.29). */
  readonly timeZone: TimeZone;
  /**
   * The **site's** jurisdiction — not the organization's headquarters
   * (Rule 3.5).
   *
   * No column carries a per-container jurisdiction, so today every derived site
   * inherits `organization.primaryJurisdictionId`. `null` is a real state and it
   * blocks classification rather than defaulting it (Rule 3.10, E-13).
   */
  readonly jurisdictionId: Uuid | null;
  readonly containerCount: number;
  /** True where this row came from the organization's own address, not a container's. */
  readonly isOrganizationAddress: boolean;
}

/**
 * The address a site is keyed on. Joined with a separator that cannot appear in
 * a field, so two different addresses cannot collide into one row.
 */
function addressKey(address: PostalAddress): string {
  return [
    address.line1,
    address.line2 ?? "",
    address.city,
    address.region,
    address.postalCode,
    address.country,
  ].join("");
}

/** One line, for a heading. Empty parts are dropped rather than rendered blank. */
export function formatAddressLine(address: PostalAddress): string {
  return [
    address.line1,
    address.line2,
    address.city,
    address.region,
    address.postalCode,
    address.country,
  ]
    .filter(
      (part): part is string => typeof part === "string" && part.trim() !== "",
    )
    .join(", ");
}

/**
 * The organization's sites, most-populated first, then by address.
 *
 * A container with no `siteAddress` is at the organization's primary address —
 * that is what the null means, and it is why the fallback is a fold into the
 * same row rather than a separate "unassigned" bucket.
 */
export function organizationSites(
  organization: Organization,
  containers: readonly Container[],
): readonly OrganizationSite[] {
  const byKey = new Map<string, OrganizationSite>();

  const fallbackKey = addressKey(organization.primaryAddress);
  byKey.set(fallbackKey, {
    key: fallbackKey,
    address: organization.primaryAddress,
    timeZone: organization.timeZone,
    jurisdictionId: organization.primaryJurisdictionId,
    containerCount: 0,
    isOrganizationAddress: true,
  });

  for (const container of containers) {
    const address = container.siteAddress ?? organization.primaryAddress;
    const key = addressKey(address);
    const existing = byKey.get(key);

    if (existing === undefined) {
      byKey.set(key, {
        key,
        address,
        timeZone: container.siteTimeZone,
        jurisdictionId: organization.primaryJurisdictionId,
        containerCount: 1,
        isOrganizationAddress: false,
      });
      continue;
    }

    byKey.set(key, {
      ...existing,
      // A container states the zone it is stored in; the organization default
      // only applies where no container has said otherwise (Rule 4.29).
      timeZone:
        existing.containerCount === 0
          ? container.siteTimeZone
          : existing.timeZone,
      containerCount: existing.containerCount + 1,
    });
  }

  return [...byKey.values()].sort(
    (a, b) =>
      b.containerCount - a.containerCount ||
      formatAddressLine(a.address).localeCompare(formatAddressLine(b.address)),
  );
}
