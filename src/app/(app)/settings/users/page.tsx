import type { Metadata } from "next";

import { Card, CardContent } from "@/components/ui/card";
import { APP_ROUTE_NAMES } from "@/domain/access/routes";
import { requireRoute } from "@/lib/auth/guard";
import { data } from "@/data";
import {
  AccessGrantsCard,
  ACCESS_GRANTS_SECTION_ID,
} from "@/features/settings/components/access-grants-card";
import {
  BindingAuthorityCard,
  BINDING_AUTHORITY_SECTION_ID,
} from "@/features/settings/components/binding-authority-card";
import { MemberTable } from "@/features/settings/components/member-table";
import { SettingsSection } from "@/features/settings/components/settings-primitives";
import { SettingsSectionNav } from "@/features/settings/components/settings-section-nav";
import { DEACTIVATE_CONFIRMATION_BODY } from "@/features/settings/member-rules";
import { readMembers } from "@/features/settings/read-members";

/**
 * `/settings/users` — `UX_SPEC.md` §3.18.
 *
 * **Read-only in this unit.** §3.18's primary action is **Invite member** and it
 * is not built, along with change role, resend invitation, Deactivate and Grant
 * auditor access. Every one of them is **absent, not disabled**: P5 cannot reach
 * this route and every role that can holds `write`, so a disabled control here
 * would be disabled for a reason that is not a permission — which §2.9's
 * decision table does not admit. Nothing is greyed out and nothing is dead.
 *
 * The constraints those controls must carry are captured now as copy, as a
 * schema and as unit tests (`member-rules.ts`, `schemas.ts`), so the unit that
 * builds the writes implements a fixed target rather than re-deciding Rules
 * 1.11, 1.12, 1.13 and 1.15.
 *
 * **`write` for P2 and P6, `none` for everyone else.** P5 never reaches this
 * route, so E-8a does not apply and `ReadOnlyBanner` does not render.
 *
 * **The member table is scoped by the adapter, not by this page.** A membership
 * in another organization is invisible here — that is Rule 1.2 holding
 * structurally rather than a filter someone remembered to write.
 */

export const metadata: Metadata = {
  title: APP_ROUTE_NAMES["/settings/users"],
};

const MEMBERS_SECTION_ID = "members";

const SECTIONS = [
  { id: MEMBERS_SECTION_ID, label: "Members" },
  { id: BINDING_AUTHORITY_SECTION_ID, label: "Binding authority" },
  { id: ACCESS_GRANTS_SECTION_ID, label: "Access grants" },
] as const;

export default async function MembersAndRolesPage() {
  const { ctx } = await requireRoute("/settings/users");

  const [organization, members] = await Promise.all([
    data.organizations.get(ctx, ctx.organizationId),
    readMembers(ctx),
  ]);

  if (organization === null) {
    // The id came from the resolved session, not from a URL, so a missing row is
    // a data defect and must be loud. **Not `notFound()`** — that would tell a
    // member their own organization does not exist.
    throw new Error(
      `The active organization has no row (correlationId=${ctx.correlationId}).`,
    );
  }

  // Rule 4.29 — every absolute date on this page is read in the organization's
  // own zone rather than the server's.
  const timeZone = organization.timeZone;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <header className="flex flex-col gap-2">
        <h1 id="page-title" tabIndex={-1} className="text-h1 lg:text-display">
          {APP_ROUTE_NAMES["/settings/users"]}
        </h1>
        <p className="max-w-[72ch] text-body text-muted-foreground">
          Who is in this organization and what each of them can do. Everything
          on this page is read-only in this release.
        </p>
      </header>

      <div className="flex flex-col gap-6 lg:flex-row lg:gap-10">
        <SettingsSectionNav
          sections={SECTIONS}
          label="Members and roles sections"
        />

        <div className="flex min-w-0 flex-1 flex-col gap-10">
          <SettingsSection
            id={MEMBERS_SECTION_ID}
            title="Members"
            description="Each role's description is computed from the same access map the guard enforces, so it cannot drift from what a person can actually open."
          >
            <Card>
              <CardContent className="flex flex-col gap-4">
                <MemberTable rows={members.rows} timeZone={timeZone} />
                {/* Rule 1.13 — members are deactivated, never deleted. Stated
                    here because a reader looking for a way to remove someone
                    should learn now that removal is not what happens. */}
                <p className="max-w-[72ch] text-body text-muted-foreground">
                  Members are deactivated, never deleted.{" "}
                  {DEACTIVATE_CONFIRMATION_BODY}
                </p>
              </CardContent>
            </Card>
          </SettingsSection>

          <BindingAuthorityCard holders={members.bindingAuthorityHolders} />

          <AccessGrantsCard rows={members.grantedRows} timeZone={timeZone} />
        </div>
      </div>
    </div>
  );
}
