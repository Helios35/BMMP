import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ReadOnlyBanner } from "@/components";
import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import { showsReadOnlyBanner } from "@/domain/access/control-treatment";
import { canReadRoute } from "@/domain/access/route-capability";
import { APP_ROUTE_NAMES } from "@/domain/access/routes";
import { recordNotFound } from "@/lib/auth/record-denial";
import { requireRoute } from "@/lib/auth/guard";
import type { CatalogEntry } from "@/types/catalog";
import { Breadcrumbs } from "@/features/shell/chrome/breadcrumbs";
import { breadcrumbTrail } from "@/features/shell/navigation/breadcrumb-ancestors";
import { catalogEntryTitle } from "@/features/catalog/catalog-entry-display";
import { CatalogEntrySections } from "@/features/catalog/components/catalog-entry-sections";
import { EditEntryControl } from "@/features/catalog/components/edit-entry-control";
import { MatchedRecords } from "@/features/catalog/components/matched-records";

/**
 * `/catalog/[id]` — `UX_SPEC.md` §3.16, `SITE_ARCHITECTURE.md` §2.5.
 *
 * One page, **no tabs**. All six roles hold `read`.
 *
 * ## The identifier that is not this tenant's
 *
 * `catalogEntries.get` returns `null` for an entry belonging to another
 * organisation, exactly as it does for one that does not exist — it does not
 * throw and it does not distinguish the two (Rule 1.2). So this page records the
 * miss and calls `notFound()`, and **it never compares the row's
 * `organizationId` to the caller's.** The seam already did; a second comparison
 * here would eventually drift from it, and the guarantee stops being structural
 * the moment any code in `src/app` holds enough information to tell "absent"
 * from "another tenant's". The rendered answer is byte-identical either way, and
 * it is never a 403.
 *
 * ## What does not render here
 *
 * No format band, no grade, no hazard ranking, no recall match — each is
 * `[B1b]` or `[B2]`, and the format band's own absence is explained where the
 * reservation sits, in `CatalogEntrySections`. Nothing on this page states what
 * Rule 1.25 forbids, in copy, a tooltip or an `aria-label`. And no write path:
 * the one mutating control leads to unit 03's page.
 */

const MATCHED_RECORD_LIMIT = 50;

export const metadata: Metadata = {
  title: APP_ROUTE_NAMES["/catalog/[id]"],
};

export default async function CatalogEntryPage({
  params,
}: PageProps<"/catalog/[id]">) {
  const { ctx } = await requireRoute("/catalog/[id]");
  const { id } = await params;

  const entry = await data.catalogEntries.get(ctx, id);
  if (entry === null) {
    // Denials are evidence, and a miss is one (Rules 1.16, 12.6). The recorded
    // reason is neutral by construction — see `recordNotFound`.
    await recordNotFound(ctx, "catalog_entry", id);
    notFound();
  }

  const matched = await data.batteryRecords.list(ctx, {
    catalogEntryId: entry.id,
    limit: MATCHED_RECORD_LIMIT,
  });

  const title = catalogEntryTitle(entry);
  const crumbs = breadcrumbTrail("/catalog/[id]", ctx.role, title);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-3">
        <Breadcrumbs crumbs={crumbs} />

        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          {/* The shell's route announcer moves focus here on every navigation. */}
          <h1 id="page-title" tabIndex={-1} className="text-h1 lg:text-display">
            {title}
          </h1>
          <EditEntryControl role={ctx.role} entryId={entry.id} />
        </div>

        {/* E-8a. The route carries a mutating control for someone, so the
            auditor gets the banner as well as the disabled control. The decision
            is `@/domain/access`'s; this page renders the answer. */}
        {showsReadOnlyBanner({
          role: ctx.role,
          routeHasMutatingControls: true,
        }) ? (
          <ReadOnlyBanner />
        ) : null}
      </div>

      <CatalogEntrySections
        entry={entry}
        verifiedByName={await verifiedByName(ctx, entry)}
      />

      <MatchedRecords
        records={matched.items}
        canOpenRecord={canReadRoute(ctx.role, "/batteries/[id]")}
      />
    </div>
  );
}

/**
 * The verifier's display name, or `null`.
 *
 * A global entry is verified by a platform admin, who holds no membership in the
 * caller's organisation — `user` is a platform table and readable by every
 * authenticated caller (`TECHNICAL_SPEC.md` §9.5), so the name resolves without
 * a cross-tenant read. Where it does not resolve, the field says *"Not
 * verified"* rather than naming a bare identifier at a reader.
 */
async function verifiedByName(
  ctx: RequestContext,
  entry: CatalogEntry,
): Promise<string | null> {
  if (entry.verifiedBy === null) return null;
  const verifier = await data.users.get(ctx, entry.verifiedBy);
  if (verifier === null) return null;
  return verifier.fullName ?? verifier.email;
}
