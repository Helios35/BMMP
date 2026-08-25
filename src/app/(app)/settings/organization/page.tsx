import type { Metadata } from "next";

import { PageColumns, PageHeader, PageShell } from "@/components/page";
import { APP_ROUTE_NAMES } from "@/domain/access/routes";
import { requireRoute } from "@/lib/auth/guard";
import {
  ClockMethodCard,
  CLOCK_METHOD_SECTION_ID,
} from "@/features/settings/components/clock-method-card";
import {
  EmergencyContactCard,
  EmergencyContactUnverifiedAlert,
  EMERGENCY_CONTACT_SECTION_ID,
} from "@/features/settings/components/emergency-contact-card";
import {
  OrganizationProfileCard,
  ORGANIZATION_PROFILE_SECTION_ID,
} from "@/features/settings/components/organization-profile-card";
import { SettingsSectionNav } from "@/features/settings/components/settings-section-nav";
import {
  SiteJurisdictionSection,
  SITES_SECTION_ID,
} from "@/features/settings/components/site-jurisdiction-card";
import {
  TermsOfServiceCard,
  TERMS_SECTION_ID,
} from "@/features/settings/components/terms-of-service-card";
import { ORGANIZATION_PAGE_DESCRIPTION } from "@/features/settings/copy";
import { readOrganizationSettings } from "@/features/settings/read-organization-settings";

/**
 * `/settings/organization` — `UX_SPEC.md` §3.17.
 *
 * **Read-only in this unit.** §3.17's primary action is **Save changes** and it
 * is not built: the write paths depend on columns whose shape the prototype is
 * still arguing with (D-19), and a Save with no Server Action behind it is a
 * lie. Every control is therefore **absent**, not disabled — `UX_SPEC.md` §2.9's
 * decision table only admits *disabled* where a permission is missing, and every
 * role that can reach this route holds `write`.
 *
 * **`write` for P2 and P6, `none` for everyone else.** The guard has already
 * redirected P1, P3, P4 and P5, so this page never renders a "not for you" state
 * and never offers P1 a link (E-11) — every block on it names P2 and P6 instead.
 *
 * **`ReadOnlyBanner` does not render here.** It is P5's, and P5 cannot reach
 * this route at all.
 *
 * Any read failure reaches `(app)/error.tsx`. Nothing is swallowed: a page that
 * silently renders half an organization's compliance configuration is worse than
 * one that says it could not load it.
 */

export const metadata: Metadata = {
  title: APP_ROUTE_NAMES["/settings/organization"],
};

const SECTIONS = [
  { id: ORGANIZATION_PROFILE_SECTION_ID, label: "Organization profile" },
  { id: EMERGENCY_CONTACT_SECTION_ID, label: "24-hour emergency contact" },
  { id: CLOCK_METHOD_SECTION_ID, label: "Clock demonstration method" },
  { id: SITES_SECTION_ID, label: "Sites and jurisdiction profile" },
  { id: TERMS_SECTION_ID, label: "Terms of Service" },
] as const;

export default async function OrganizationSettingsPage() {
  // The first statement of every `(app)` segment. It redirects and does not
  // return on a denial, so there is no else-branch to write.
  const { ctx } = await requireRoute("/settings/organization");

  const view = await readOrganizationSettings(ctx);

  return (
    <PageShell>
      <PageHeader
        title={APP_ROUTE_NAMES["/settings/organization"]}
        // The organization's name is a **value**, so it sits in the subtitle at
        // full contrast rather than inside a muted helper sentence (§1.2 Rule
        // 3). The words are unchanged; only which line each sits on has moved.
        // It also makes the description a constant, which is what lets the
        // loading skeleton occupy exactly its space (§6.3).
        subtitle={view.organization.name}
        description={ORGANIZATION_PAGE_DESCRIPTION}
        // E-11, pinned below the title as §3.17 requires. A lapsed verification
        // and an absent one reach this alert from opposite directions and it
        // renders identically for both (D-32).
        notice={
          <EmergencyContactUnverifiedAlert contact={view.emergencyContact} />
        }
      />

      <PageColumns
        aside={
          <SettingsSectionNav
            sections={SECTIONS}
            label="Organization settings sections"
          />
        }
      >
        <OrganizationProfileCard organization={view.organization} />
        <EmergencyContactCard
          contact={view.emergencyContact}
          timeZone={view.organization.timeZone}
        />
        <ClockMethodCard sites={view.profiles.map((profile) => profile.site)} />
        <SiteJurisdictionSection profiles={view.profiles} />
        <TermsOfServiceCard
          consent={view.consent}
          gate={view.gate}
          timeZone={view.organization.timeZone}
        />
      </PageColumns>
    </PageShell>
  );
}
