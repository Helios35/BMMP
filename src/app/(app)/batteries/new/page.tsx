import type { Metadata } from "next";

import { PageHeader, PageShell, SectionCard } from "@/components/page";
import { canReadRoute } from "@/domain/access/route-capability";
import { APP_ROUTE_NAMES } from "@/domain/access/routes";
import {
  IntakeBlockedNotice,
  IntakeGraceNotice,
} from "@/features/consent/components/intake-blocked-notice";
import { readIntakeGate } from "@/features/consent/read-intake-gate";
import { requireRoute } from "@/lib/auth/guard";

/**
 * `/batteries/new` — **the Terms of Service gate, and nothing else.**
 *
 * `UX_SPEC.md` §3.6's three-step intake flow is unit 02's work. This unit
 * creates the route so the gate has somewhere to render and so the role guard
 * applies from the first day: P1 and P6 hold `write` here and no other role
 * holds anything, so everyone else is redirected before a byte of this file
 * runs (`SITE_ARCHITECTURE.md` §5.2, §5.3(4)).
 *
 * **The gate blocks intake, not the app** (Rules 7.1, 7.2; E-12). Every
 * read-only route stays reachable while consent is pending, which is why this
 * check is here and not in middleware or in `(app)/layout.tsx`.
 */

export const metadata: Metadata = {
  title: APP_ROUTE_NAMES["/batteries/new"],
};

export default async function LogBatteryPage() {
  const { ctx } = await requireRoute("/batteries/new");
  const gate = await readIntakeGate(ctx);

  if (gate.status === "blocked") {
    return (
      <PageShell>
        <PageHeader
          title={APP_ROUTE_NAMES["/batteries/new"]}
          // The block is pinned below the title, in the slot §2.9 fixes for
          // every notice that qualifies what the page can do.
          notice={
            <IntakeBlockedNotice
              gate={gate}
              canReachOrganizationSettings={canReadRoute(
                ctx.role,
                "/settings/organization",
              )}
            />
          }
        />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title={APP_ROUTE_NAMES["/batteries/new"]}
        notice={<IntakeGraceNotice gate={gate} />}
      />
      <IntakeNotYetBuilt />
    </PageShell>
  );
}

/**
 * Scaffolding, and marked as such.
 *
 * **Not an empty state and not an error**, and it must not be styled as either:
 * an empty state says a thing exists and holds nothing, and this route's flow
 * has not been built. Unit 02 replaces this with `UX_SPEC.md` §3.6's three-step
 * intake — photograph the label, review the extraction, confirm and place.
 * Nothing here is a stepper, a capture control or a placeholder form.
 */
function IntakeNotYetBuilt() {
  return (
    <SectionCard
      title={APP_ROUTE_NAMES["/batteries/new"]}
      className="max-w-[72ch]"
    >
      <p className="text-body text-muted-foreground">
        Your organization&rsquo;s Terms of Service acceptance is in force, so
        intake is open. The capture flow itself arrives in the next unit.
      </p>
    </SectionCard>
  );
}
