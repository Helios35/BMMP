import { describe, expect, it } from "vitest";

import * as fixtures from "@/data/mock/fixtures";
import * as ID from "@/data/mock/fixtures/ids";
import {
  formatAddressLine,
  organizationSites,
} from "@/features/settings/sites";
import type { Container } from "@/types/storage";
import type { Organization } from "@/types/tenancy";

/**
 * The site derivation — `UX_SPEC.md` §3.17, Rule 3.5.
 *
 * **The premise under test is that a site is always a list**, never a field.
 * `/settings/organization` must never present one organisation-wide
 * jurisdiction, even where there is exactly one site today, because an
 * organization with sites in two states classifies the same battery two ways and
 * a single field can only ever hold one of the answers.
 */

function organization(id: string): Organization {
  const found = fixtures.organizations.find((row) => row.id === id);
  if (found === undefined) throw new Error(`No organization fixture ${id}`);
  return found;
}

function containersFor(organizationId: string): readonly Container[] {
  return fixtures.containers.filter(
    (row) => row.organizationId === organizationId,
  );
}

describe("organizationSites", () => {
  it("returns a one-row list for a single-site organization, not a single value", () => {
    const cascade = organization(ID.ORG.cascade);
    const sites = organizationSites(cascade, containersFor(ID.ORG.cascade));

    expect(Array.isArray(sites)).toBe(true);
    expect(sites).toHaveLength(1);
    expect(sites[0]?.address).toEqual(cascade.primaryAddress);
    expect(sites[0]?.containerCount).toBe(3);
  });

  it("still returns one row for an organization with no containers", () => {
    const rainier = organization(ID.ORG.rainier);
    const sites = organizationSites(rainier, []);

    // The organization has an address whatever its container count is, and a
    // profile has to hang off something.
    expect(sites).toHaveLength(1);
    expect(sites[0]?.containerCount).toBe(0);
    expect(sites[0]?.isOrganizationAddress).toBe(true);
  });

  it("splits a second site out when a container carries its own address", () => {
    const cascade = organization(ID.ORG.cascade);
    const [first, ...rest] = containersFor(ID.ORG.cascade);
    if (first === undefined) throw new Error("No container fixture");

    const sites = organizationSites(cascade, [
      {
        ...first,
        siteAddress: {
          line1: "500 Riverside Court",
          line2: null,
          city: "Spokane",
          region: "WA",
          postalCode: "99201",
          country: "US",
        },
        siteTimeZone: "America/Los_Angeles",
      },
      ...rest,
    ]);

    expect(sites).toHaveLength(2);
    expect(sites.map((site) => site.containerCount)).toEqual([2, 1]);
  });

  it("carries each site's own jurisdiction, and null is a real state", () => {
    const cascade = organization(ID.ORG.cascade);
    const sites = organizationSites(cascade, containersFor(ID.ORG.cascade));
    expect(sites[0]?.jurisdictionId).toBe(cascade.primaryJurisdictionId);

    // Rule 3.10 — no fallback jurisdiction and no "assume federal".
    const withoutProfile = organizationSites(
      { ...cascade, primaryJurisdictionId: null },
      containersFor(ID.ORG.cascade),
    );
    expect(withoutProfile[0]?.jurisdictionId).toBeNull();
  });
});

describe("formatAddressLine", () => {
  it("drops absent parts rather than rendering a blank between commas", () => {
    expect(
      formatAddressLine({
        line1: "1420 Industrial Way SW",
        line2: null,
        city: "Tumwater",
        region: "WA",
        postalCode: "98512",
        country: "US",
      }),
    ).toBe("1420 Industrial Way SW, Tumwater, WA, 98512, US");
  });
});
