// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import * as fixtures from "@/data/mock/fixtures";
import * as ID from "@/data/mock/fixtures/ids";
import { emergencyVerification } from "@/features/settings/emergency-verification";
import {
  EMERGENCY_UNVERIFIED_BODY,
  EMERGENCY_UNVERIFIED_HEADLINE,
} from "@/features/settings/copy";
import {
  EmergencyContactCard,
  EmergencyContactUnverifiedAlert,
} from "@/features/settings/components/emergency-contact-card";
import { MemberTable } from "@/features/settings/components/member-table";
import { SiteJurisdictionSection } from "@/features/settings/components/site-jurisdiction-card";
import type { EmergencyContactView } from "@/features/settings/read-organization-settings";
import type { MemberRow } from "@/features/settings/read-members";
import type { Jurisdiction } from "@/types/rules-as-data";
import type { Membership, User } from "@/types/tenancy";

/**
 * The two settings surfaces, rendered.
 *
 * Three things are being proven, and each is a rejection if it fails:
 *
 * 1. **A lapsed verification and an absent one render identically** (D-32).
 * 2. **No jurisdiction threshold, deadline, citation or unit is a literal** —
 *    the rule payload renders key-to-value with nothing humanised and no unit
 *    inferred (Rule 1.23).
 * 3. **Membership status is plain text, not a `StatusBadge`** — no `TAXONOMY.md`
 *    system governs it, and a badge over an ungoverned string is how an invented
 *    vocabulary acquires a colour.
 */

const TIME_ZONE = "America/Los_Angeles";
const NOW = "2026-08-21T12:00:00.000Z";

function contactFor(organizationId: string): EmergencyContactView {
  const org = fixtures.organizations.find((row) => row.id === organizationId);
  if (org === undefined) throw new Error("No organization fixture");
  return {
    ...emergencyVerification(
      {
        phone: org.emergencyResponsePhone,
        verifiedAt: org.emergencyVerifiedAt,
        verifiedBy: org.emergencyVerifiedBy,
        reverificationIntervalMonths: org.emergencyReverificationIntervalMonths,
      },
      NOW,
    ),
    phone: org.emergencyResponsePhone,
    contractRef: org.emergencyResponseContractRef,
    verifiedByName: org.emergencyVerifiedBy === null ? null : "Marta Bellini",
  };
}

describe("E-11 — the 24-hour emergency contact", () => {
  it("renders one alert, with the same copy, for a lapsed and for an absent verification", () => {
    const lapsed = render(
      <EmergencyContactUnverifiedAlert contact={contactFor(ID.ORG.cascade)} />,
    );
    const lapsedHtml = lapsed.container.innerHTML;
    lapsed.unmount();

    const absent = render(
      <EmergencyContactUnverifiedAlert contact={contactFor(ID.ORG.rainier)} />,
    );
    const absentHtml = absent.container.innerHTML;

    // D-32 — one state, not two. A distinct "expired" treatment is a defect.
    expect(lapsedHtml).toBe(absentHtml);
    expect(screen.getByText(EMERGENCY_UNVERIFIED_HEADLINE)).toBeInTheDocument();
    expect(screen.getByText(EMERGENCY_UNVERIFIED_BODY)).toBeInTheDocument();
  });

  it("renders nothing at all when the verification stands", () => {
    const { container } = render(
      <EmergencyContactUnverifiedAlert
        contact={{
          ...contactFor(ID.ORG.cascade),
          isInForce: true,
          notInForceReason: null,
        }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the recorded date and actor, and no interval as a literal", () => {
    const { container } = render(
      <EmergencyContactCard
        contact={contactFor(ID.ORG.cascade)}
        timeZone={TIME_ZONE}
      />,
    );

    expect(screen.getByText("Marta Bellini")).toBeInTheDocument();
    // The lapse date is computed from the organization's own configuration; the
    // interval itself never appears (Rule 1.23).
    expect(container.textContent).not.toMatch(
      /\b\d+\s*(months?|years?|days?)\b/i,
    );
  });

  it("shows no lapse date where the interval is unknown, rather than one of its own", () => {
    render(
      <EmergencyContactCard
        contact={contactFor(ID.ORG.olympic)}
        timeZone={TIME_ZONE}
      />,
    );
    expect(
      screen.getByText(/No re-verification interval is configured/i),
    ).toBeInTheDocument();
  });
});

/* ------------------------------------------------- jurisdiction profile */

function jurisdiction(id: string): Jurisdiction {
  const found = fixtures.jurisdictions.find((row) => row.id === id);
  if (found === undefined) throw new Error(`No jurisdiction fixture ${id}`);
  return found;
}

const WASHINGTON = jurisdiction(ID.JURISDICTION.washington);
const FEDERAL = jurisdiction(ID.JURISDICTION.federal);

function ruleRow(
  ruleId: string,
  versionId: string,
  jurisdiction: Jurisdiction,
) {
  const rule = fixtures.jurisdictionRules.find((row) => row.id === ruleId);
  const version = fixtures.ruleVersions.find((row) => row.id === versionId);
  if (rule === undefined || version === undefined) {
    throw new Error("No rule fixture");
  }
  return { rule, jurisdiction, version };
}

function organization(id: string) {
  const found = fixtures.organizations.find((row) => row.id === id);
  if (found === undefined) throw new Error(`No organization fixture ${id}`);
  return found;
}

const CASCADE = organization(ID.ORG.cascade);

describe("§3.17 — the jurisdiction profile, per site", () => {
  const profile = {
    site: {
      key: "site-1",
      address: CASCADE.primaryAddress,
      timeZone: TIME_ZONE,
      jurisdictionId: ID.JURISDICTION.washington,
      containerCount: 3,
      isOrganizationAddress: true,
    },
    chain: [WASHINGTON, FEDERAL],
    rules: [
      ruleRow(
        ID.JURISDICTION_RULE.waAccumulationPeriod,
        ID.RULE_VERSION.waAccumulationPeriod2026,
        WASHINGTON,
      ),
      ruleRow(
        ID.JURISDICTION_RULE.federalRetention,
        ID.RULE_VERSION.federalRetention2026,
        FEDERAL,
      ),
    ],
    asOfDate: "2026-08-21",
  } as const;

  it("renders a list even with one site, never a single organisation-wide value", () => {
    const { container } = render(
      <SiteJurisdictionSection profiles={[profile]} />,
    );
    expect(
      container.querySelector('[data-site-count="1"]'),
    ).toBeInTheDocument();
    expect(container.querySelectorAll("[data-site-key]")).toHaveLength(1);
  });

  it("renders the payload key-to-value, as stored, with nothing humanised", () => {
    render(<SiteJurisdictionSection profiles={[profile]} />);

    // The key is the column name, not a sentence someone wrote.
    expect(screen.getByText("maxDurationDays")).toBeInTheDocument();
    expect(screen.getByText("retentionYears")).toBeInTheDocument();
    expect(screen.getByText("365")).toBeInTheDocument();
    // The nested value is serialised rather than flattened: the shape belongs to
    // the rule, not to this screen.
    expect(
      screen.getByText('{"early":90,"mid":60,"final":30}'),
    ).toBeInTheDocument();
    expect(screen.getAllByText("3").length).toBeGreaterThan(0);
  });

  it("infers no unit — 'Retention: 3 years' is the defect this prevents", () => {
    const { container } = render(
      <SiteJurisdictionSection profiles={[profile]} />,
    );
    const text = container.textContent ?? "";

    expect(text).not.toMatch(/\b\d+\s*(years?|days?|months?)\b/i);
    expect(text).not.toMatch(/retention:\s*\d/i);
  });

  it("shows each rule's effective date and its source", () => {
    render(<SiteJurisdictionSection profiles={[profile]} />);
    expect(screen.getAllByText("2026-01-01").length).toBeGreaterThan(0);
    // Once in the chain, once as the rule's own source — a reader can see which
    // level supplied each rule.
    expect(screen.getAllByText("US-WA").length).toBeGreaterThan(1);
    expect(screen.getAllByText("US").length).toBeGreaterThan(1);
  });

  it("names the missing input and who supplies it when a site has no profile", () => {
    render(
      <SiteJurisdictionSection
        profiles={[
          {
            ...profile,
            site: { ...profile.site, jurisdictionId: null },
            chain: [],
            rules: [],
          },
        ]}
      />,
    );
    expect(
      screen.getByText(/This site has no jurisdiction profile/i),
    ).toBeInTheDocument();
    // Classification is blocked, not defaulted (Rule 3.10).
    expect(screen.getByText(/No default is assumed/i)).toBeInTheDocument();
  });
});

/* --------------------------------------------------------- member table */

function memberRow(
  membershipId: string,
  overrides: {
    readonly user?: Partial<User> | null;
    readonly membership?: Partial<Membership>;
    readonly isViewer?: boolean;
  } = {},
): MemberRow {
  const membership = fixtures.memberships.find(
    (row) => row.id === membershipId,
  );
  if (membership === undefined) throw new Error("No membership fixture");
  const merged = { ...membership, ...overrides.membership };

  const user =
    overrides.user === null
      ? null
      : ({
          id: merged.userId ?? "u",
          email: "dana.okafor@cascade-recyclers.example",
          fullName: "Dana Okafor",
          phone: null,
          avatarUrl: null,
          isPlatformAdmin: false,
          locale: "en-US",
          status: "active",
          lastSeenAt: null,
          createdAt: NOW,
          updatedAt: NOW,
          ...overrides.user,
        } satisfies User);

  return {
    membership: merged,
    user,
    displayName: user?.fullName ?? merged.invitedEmail ?? "Unnamed",
    email: user?.email ?? merged.invitedEmail ?? null,
    status:
      merged.revokedAt !== null
        ? "Deactivated"
        : merged.acceptedAt === null
          ? "Invited"
          : "Active",
    isViewer: overrides.isViewer ?? false,
    grant: null,
  };
}

describe("§3.18 — the member table", () => {
  it("renders membership status as plain text and never as a StatusBadge", () => {
    const { container } = render(
      <MemberTable
        rows={[memberRow(ID.MEMBERSHIP.danaCascade)]}
        timeZone={TIME_ZONE}
      />,
    );

    const statusNodes = Array.from(
      container.querySelectorAll("[data-membership-status-text]"),
    );
    expect(statusNodes.length).toBeGreaterThan(0);
    for (const node of statusNodes) {
      expect(node.closest("[data-status-state]")).toBeNull();
    }
  });

  it("renders the role through the one status map, with its computed description", () => {
    const { container } = render(
      <MemberTable
        rows={[memberRow(ID.MEMBERSHIP.danaCascade)]}
        timeZone={TIME_ZONE}
      />,
    );

    expect(screen.getAllByText("Compliance Handler").length).toBeGreaterThan(0);
    expect(
      container.querySelectorAll('[data-status-state="default"]').length,
    ).toBeGreaterThan(0);
    expect(container.textContent).toMatch(/Can open \d+ pages/);
  });

  it("renders no mutating control at all — absent, not disabled", () => {
    const { container } = render(
      <MemberTable
        rows={[
          memberRow(ID.MEMBERSHIP.danaCascade),
          memberRow(ID.MEMBERSHIP.pendingInvite, { user: null }),
        ]}
        timeZone={TIME_ZONE}
      />,
    );

    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelectorAll("[aria-disabled]")).toHaveLength(0);
    expect(container.textContent).not.toMatch(
      /invite member|deactivate|delete/i,
    );
  });

  it("states Rule 1.11 on the viewer's own row", () => {
    render(
      <MemberTable
        rows={[memberRow(ID.MEMBERSHIP.danaCascade, { isViewer: true })]}
        timeZone={TIME_ZONE}
      />,
    );
    expect(
      screen.getAllByText(/No one changes their own role/i).length,
    ).toBeGreaterThan(0);
  });

  it("carries a pending invitation on its invited address, with no user row", () => {
    render(
      <MemberTable
        rows={[memberRow(ID.MEMBERSHIP.pendingInvite, { user: null })]}
        timeZone={TIME_ZONE}
      />,
    );
    expect(
      screen.getAllByText("new.handler@cascade-recyclers.example").length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("Invited").length).toBeGreaterThan(0);
  });
});
