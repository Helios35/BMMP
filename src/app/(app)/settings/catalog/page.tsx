import type { Metadata } from "next";
import Link from "next/link";
import { Inbox } from "lucide-react";

import {
  EmptyState,
  PageColumns,
  PageHeader,
  PageShell,
  SectionCard,
} from "@/components/page";
import { StatusBadge } from "@/components/status/status-badge";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { data } from "@/data";
import { canReadRoute } from "@/domain/access/route-capability";
import { APP_ROUTE_NAMES } from "@/domain/access/routes";
import {
  CATALOG_ADMIN_DESCRIPTION,
  ENTRIES_DESCRIPTION,
  ENTRIES_SECTION,
  NO_PROPOSALS,
  NO_PROPOSALS_BODY,
  ORGANIZATION_ENTRY,
  PLATFORM_ENTRY,
  PROPOSALS_DESCRIPTION,
  PROPOSALS_SECTION,
} from "@/features/catalog-admin/catalog-admin-copy";
import { ProposalCard } from "@/features/catalog-admin/components/proposal-card";
import { CatalogSourceType } from "@/features/catalog/components/catalog-source-type";
import {
  readCatalogEntries,
  readCatalogProposals,
} from "@/features/catalog-admin/server/proposals";
import { SettingsSection } from "@/features/settings/components/settings-primitives";
import { SettingsSectionNav } from "@/features/settings/components/settings-section-nav";
import { requireRoute } from "@/lib/auth/guard";

/**
 * `/settings/catalog` — catalog administration (`UX_SPEC.md` §3.19;
 * `SITE_ARCHITECTURE.md` Flow F; `TECHNICAL_SPEC.md` §7.3).
 *
 * **P6 only.** Every other role holds nothing here and is redirected by the
 * guard with the restriction named, and the attempt is audited (§5.3(4)).
 *
 * Two lists (§3.19): **Proposals**, each beside the intake photo and label
 * crop it came from, with **Approve entry** and **Reject**, each needing a
 * stated reason; and **All entries**, the decided catalog. Approval publishes
 * the entry and raises matching unmatched records on `/review` — it never
 * changes a record (Flow F step 4). Editing an entry's fields is not built in
 * this unit; see the build-notes.
 */

export const metadata: Metadata = {
  title: APP_ROUTE_NAMES["/settings/catalog"],
};

const PROPOSALS_ID = "proposals";
const ENTRIES_ID = "entries";

const SECTIONS = [
  { id: PROPOSALS_ID, label: PROPOSALS_SECTION },
  { id: ENTRIES_ID, label: ENTRIES_SECTION },
] as const;

export default async function CatalogAdministrationPage() {
  const { ctx } = await requireRoute("/settings/catalog");

  const organization = await data.organizations.get(ctx, ctx.organizationId);
  if (organization === null) {
    // From the resolved session, not a URL: a missing row is a data defect and
    // must be loud, never `notFound()`.
    throw new Error(
      `The active organization has no row (correlationId=${ctx.correlationId}).`,
    );
  }

  const [proposals, entries] = await Promise.all([
    readCatalogProposals(ctx, organization.timeZone),
    readCatalogEntries(ctx),
  ]);
  const canOpenEntry = canReadRoute(ctx.role, "/catalog/[id]");

  return (
    <PageShell>
      <PageHeader
        title={APP_ROUTE_NAMES["/settings/catalog"]}
        description={CATALOG_ADMIN_DESCRIPTION}
      />

      <PageColumns
        aside={
          <SettingsSectionNav
            sections={SECTIONS}
            label="Catalog administration sections"
          />
        }
      >
        <SettingsSection
          id={PROPOSALS_ID}
          title={PROPOSALS_SECTION}
          description={PROPOSALS_DESCRIPTION}
          dataAttributes={{ "data-proposals": String(proposals.length) }}
        >
          {proposals.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title={NO_PROPOSALS}
              description={NO_PROPOSALS_BODY}
              dataAttributes={{ "data-proposals-empty": "true" }}
            />
          ) : (
            proposals.map((proposal) => (
              <ProposalCard key={proposal.id} proposal={proposal} />
            ))
          )}
        </SettingsSection>

        <SettingsSection
          id={ENTRIES_ID}
          title={ENTRIES_SECTION}
          description={ENTRIES_DESCRIPTION}
        >
          <SectionCard flush>
            <Table>
              <TableCaption className="sr-only">{ENTRIES_SECTION}</TableCaption>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-11 px-3 text-label">Entry</TableHead>
                  <TableHead className="h-11 px-3 text-label">
                    Catalog status
                  </TableHead>
                  {/* Source and owner are context; below md the entry and
                      its status are what fit, and nothing scrolls sideways. */}
                  <TableHead className="hidden h-11 px-3 text-label md:table-cell">
                    Source type
                  </TableHead>
                  <TableHead className="hidden h-11 px-3 text-label md:table-cell">
                    Owner
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow
                    key={entry.id}
                    data-catalog-admin-entry={entry.id}
                    className="h-14 lg:h-12"
                  >
                    <TableCell className="px-3 py-2 text-body-strong whitespace-normal">
                      {canOpenEntry && entry.statusValue === "published" ? (
                        <Link
                          href={`/catalog/${entry.id}`}
                          className="inline-flex min-h-11 items-center rounded-md underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          {entry.title}
                        </Link>
                      ) : (
                        entry.title
                      )}
                    </TableCell>
                    <TableCell className="px-3 py-2">
                      <StatusBadge
                        system="catalog_entry_status"
                        value={entry.statusValue}
                      />
                    </TableCell>
                    <TableCell className="hidden px-3 py-2 text-body md:table-cell">
                      <CatalogSourceType sourceType={entry.sourceType} />
                    </TableCell>
                    <TableCell className="hidden px-3 py-2 text-body md:table-cell">
                      {entry.isPlatformEntry
                        ? PLATFORM_ENTRY
                        : ORGANIZATION_ENTRY}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </SectionCard>
        </SettingsSection>
      </PageColumns>
    </PageShell>
  );
}
