import { beforeEach, describe, expect, it } from "vitest";

import type { RequestContext } from "@/data/contracts/context";
import { resetMockStore } from "@/data/mock";
import * as ID from "@/data/mock/fixtures/ids";
import { readMembers } from "@/features/settings/read-members";
import { readOrganizationSettings } from "@/features/settings/read-organization-settings";

/**
 * The two settings reads, through the seam.
 *
 * Nothing here reaches past `src/data`; every call takes a `RequestContext` the
 * way a guarded segment hands one over. The assertions are the ones a screen
 * cannot be trusted on by inspection: tenant scoping, grant expiry, and the
 * draft rule version that must never appear beside a rule a document was
 * produced under.
 */

const NOW = "2026-08-21T12:00:00.000Z";

function ctx(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    userId: ID.USER.martaManager,
    organizationId: ID.ORG.cascade,
    role: "facility_manager",
    isPlatformAdmin: false,
    correlationId: "test-corr-settings",
    ...overrides,
  };
}

const CASCADE_MANAGER = ctx();
const RAINIER_ADMIN = ctx({
  userId: ID.USER.platformAdmin,
  organizationId: ID.ORG.rainier,
  role: "platform_admin",
  isPlatformAdmin: true,
});

beforeEach(() => {
  resetMockStore();
});

describe("readMembers", () => {
  it("never returns another organization's membership", async () => {
    const view = await readMembers(CASCADE_MANAGER, NOW);
    const ids = view.rows.map((row) => row.membership.id);

    // Rule 1.2 — this is the adapter's scoping holding, not a filter this
    // feature wrote. A row from Rainier is invisible, never forbidden.
    expect(ids).not.toContain(ID.MEMBERSHIP.joRainier);
    expect(ids).toContain(ID.MEMBERSHIP.danaCascade);
  });

  it("derives the three membership states from the row, not from a stored status", async () => {
    const view = await readMembers(CASCADE_MANAGER, NOW);
    const statusOf = (membershipId: string) =>
      view.rows.find((row) => row.membership.id === membershipId)?.status;

    expect(statusOf(ID.MEMBERSHIP.danaCascade)).toBe("Active");
    expect(statusOf(ID.MEMBERSHIP.pendingInvite)).toBe("Invited");
    // Revocation is never a delete — the row stays and reads as deactivated.
    expect(statusOf(ID.MEMBERSHIP.revokedInvite)).toBe("Deactivated");
  });

  it("names the viewer's own row, which is where Rule 1.11 applies", async () => {
    const view = await readMembers(CASCADE_MANAGER, NOW);
    const own = view.rows.filter((row) => row.isViewer);
    expect(own).toHaveLength(1);
    expect(own[0]?.membership.id).toBe(ID.MEMBERSHIP.martaCascade);
  });

  it("reads a grant as in force or lapsed at the stated instant — Rule 1.28", async () => {
    const view = await readMembers(CASCADE_MANAGER, NOW);
    const grantOf = (membershipId: string) =>
      view.rows.find((row) => row.membership.id === membershipId)?.grant;

    expect(grantOf(ID.MEMBERSHIP.samCascade)?.isInForce).toBe(true);
    expect(grantOf(ID.MEMBERSHIP.samCascade)?.scope).not.toBeNull();

    const expired = grantOf(ID.MEMBERSHIP.leeCascadeExpired);
    expect(expired?.isInForce).toBe(false);
    expect(expired?.lapseReason).toBe("grant_expired");

    // P6 acting inside a tenant holds access by grant, and the grant is visible.
    expect(grantOf(ID.MEMBERSHIP.platformAdminCascadeGrant)?.isInForce).toBe(
      true,
    );
  });

  it("ends an in-force grant when the instant moves past its expiry, without waiting", async () => {
    const later = await readMembers(
      CASCADE_MANAGER,
      "2099-12-31T23:59:59.000Z",
    );
    const grant = later.rows.find(
      (row) => row.membership.id === ID.MEMBERSHIP.samCascade,
    )?.grant;
    expect(grant?.isInForce).toBe(false);
  });

  it("counts only active binding-authority holders — Rules 1.12, 7.3", async () => {
    const cascade = await readMembers(CASCADE_MANAGER, NOW);
    expect(
      cascade.bindingAuthorityHolders.map((row) => row.membership.id),
    ).toEqual([ID.MEMBERSHIP.martaCascade]);

    // Rainier holds none, which is itself a state D-35 names a remedy for.
    const rainier = await readMembers(RAINIER_ADMIN, NOW);
    expect(rainier.bindingAuthorityHolders).toHaveLength(0);
  });

  it("gives an ordinary member no grant at all", async () => {
    const view = await readMembers(CASCADE_MANAGER, NOW);
    const dana = view.rows.find(
      (row) => row.membership.id === ID.MEMBERSHIP.danaCascade,
    );
    expect(dana?.grant).toBeNull();
  });
});

describe("readOrganizationSettings", () => {
  it("renders the jurisdiction profile as a list of sites", async () => {
    const view = await readOrganizationSettings(CASCADE_MANAGER, NOW);
    expect(view.profiles).toHaveLength(1);
    expect(view.profiles[0]?.site.containerCount).toBe(3);
  });

  it("walks the chain most specific first", async () => {
    const view = await readOrganizationSettings(CASCADE_MANAGER, NOW);
    expect(view.profiles[0]?.chain.map((link) => link.code)).toEqual([
      "US-WA",
      "US",
    ]);
  });

  it("includes a federal rule reached through the chain, with its own source", async () => {
    const view = await readOrganizationSettings(CASCADE_MANAGER, NOW);
    const retention = view.profiles[0]?.rules.find(
      (row) => row.rule.id === ID.JURISDICTION_RULE.federalRetention,
    );

    expect(retention).toBeDefined();
    // Rendered with its source, so a reader can see which level supplied it.
    expect(retention?.jurisdiction.code).toBe("US");
    expect(retention?.version?.citation).not.toBe("");
  });

  it("never resolves a draft rule version — T-42", async () => {
    const view = await readOrganizationSettings(CASCADE_MANAGER, NOW);
    const versionIds = view.profiles
      .flatMap((profile) => profile.rules)
      .map((row) => row.version?.id);

    expect(versionIds).not.toContain(
      ID.RULE_VERSION.waAccumulationPeriodDraft2027,
    );
    expect(versionIds).toContain(ID.RULE_VERSION.waAccumulationPeriod2026);
  });

  it("supplies every threshold from the rule's own payload", async () => {
    const view = await readOrganizationSettings(CASCADE_MANAGER, NOW);
    const accumulation = view.profiles[0]?.rules.find(
      (row) => row.rule.id === ID.JURISDICTION_RULE.waAccumulationPeriod,
    );

    // The screen renders whatever this holds and assumes nothing about the
    // number or the unit (Rule 1.23).
    expect(accumulation?.version?.payload).toHaveProperty("maxDurationDays");
    expect(accumulation?.version?.payload).toHaveProperty("measure");
  });

  it("reads the emergency verification as not in force where it has lapsed", async () => {
    const view = await readOrganizationSettings(CASCADE_MANAGER, NOW);
    expect(view.emergencyContact.isInForce).toBe(false);
    expect(view.emergencyContact.verifiedByName).toBe("Marta Bellini");
  });

  it("reads the Terms of Service as in force for an organization that accepted", async () => {
    const view = await readOrganizationSettings(CASCADE_MANAGER, NOW);
    expect(view.gate.status).toBe("open");
    expect(view.consent).not.toHaveLength(0);
    expect(view.consent[0]?.acceptedByName).toBe("Marta Bellini");
  });

  it("carries E-12 with a named acceptor where no acceptance is in force", async () => {
    const olympic = ctx({
      userId: ID.USER.tomOlympicHandler,
      organizationId: ID.ORG.olympic,
      role: "compliance_handler",
    });
    const view = await readOrganizationSettings(olympic, NOW);

    expect(view.gate.status).toBe("blocked");
    // Rule 7.2 — the block names **who in this organization can accept it**, and
    // a name a screen made up is not a remedy.
    expect(view.gate.acceptors.map((acceptor) => acceptor.fullName)).toContain(
      "Rosa Delgado",
    );
  });

  it("never offers a platform admin the acceptance — Rules 1.19, 7.4", async () => {
    const olympicAdmin = ctx({
      userId: ID.USER.platformAdmin,
      organizationId: ID.ORG.olympic,
      role: "platform_admin",
      isPlatformAdmin: true,
    });
    const view = await readOrganizationSettings(olympicAdmin, NOW);

    expect(view.gate.status).toBe("blocked");
    // P6 accepting a customer's terms is not consent, under any grant.
    expect(view.gate.viewerCanAccept).toBe(false);
    expect(
      view.gate.acceptors.some(
        (acceptor) => acceptor.roleLabel === "Platform Admin",
      ),
    ).toBe(false);
  });

  it("resolves the jurisdiction day in the site's zone — Rule 4.29", async () => {
    // 12:00Z on 21 August is still 21 August in America/Los_Angeles; 04:00Z is
    // the previous day there, and the rule resolution must follow the site.
    const sameDay = await readOrganizationSettings(CASCADE_MANAGER, NOW);
    expect(sameDay.profiles[0]?.asOfDate).toBe("2026-08-21");

    const earlyMorning = await readOrganizationSettings(
      CASCADE_MANAGER,
      "2026-08-21T04:00:00.000Z",
    );
    expect(earlyMorning.profiles[0]?.asOfDate).toBe("2026-08-20");
  });
});
