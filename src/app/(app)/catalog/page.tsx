import type { Metadata } from "next";

import { RecordTable } from "@/components";
import { canReadRoute } from "@/domain/access/route-capability";
import { APP_ROUTE_NAMES } from "@/domain/access/routes";
import { requireRoute } from "@/lib/auth/guard";
import { catalogColumns } from "@/features/catalog/components/catalog-columns";
import { CatalogEmptyState } from "@/features/catalog/components/catalog-empty-state";
import { CATALOG_BASE_PATH } from "@/features/catalog/list-query";
import { readCatalogList } from "@/features/catalog/read-catalog-list";

/**
 * `/catalog` — `UX_SPEC.md` §3.15, `SITE_ARCHITECTURE.md` §2.5.
 *
 * Browse and search the known battery products a label read resolves to. All six
 * roles hold `read`; **there is no export control on this route** (§3.15 names
 * none) and **no primary action button** — the search box is the primary action.
 *
 * A Server Component reading through `src/data`, with **filter, sort and page
 * state in the URL** (§7.4): the table's every control is a link, so a filtered
 * catalog view is something a handler pastes to a colleague.
 *
 * `RecordTable` is used here exactly as `/containers` will use it in unit 04 —
 * nothing on this page is a catalog-specific prop.
 */

export const metadata: Metadata = {
  title: APP_ROUTE_NAMES["/catalog"],
};

export default async function CatalogPage({
  searchParams,
}: PageProps<"/catalog">) {
  // First statement. It redirects and does not return on a denial, so there is
  // no else-branch to write (`SITE_ARCHITECTURE.md` §5.3).
  const { ctx } = await requireRoute("/catalog");

  const view = await readCatalogList(ctx, await searchParams);
  const columns = catalogColumns({
    matchedCountFor: (entry) => view.matchedCounts.get(entry.id) ?? 0,
  });

  // Every one of the six holds `read` on the detail, and the answer still comes
  // from the one capability map rather than from that fact (§5.3(7)).
  const canOpenEntry = canReadRoute(ctx.role, "/catalog/[id]");

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      {/* The shell's route announcer moves focus here on every navigation. */}
      <h1 id="page-title" tabIndex={-1} className="text-h1 lg:text-display">
        {APP_ROUTE_NAMES["/catalog"]}
      </h1>

      <RecordTable
        caption="Catalog entries"
        columns={columns}
        rows={view.entries}
        rowKey={(entry) => entry.id}
        rowLink={(entry) =>
          canOpenEntry
            ? { kind: "link", href: `${CATALOG_BASE_PATH}/${entry.id}` }
            : {
                kind: "not-linked",
                reason: "Your role can't open a catalog entry.",
              }
        }
        total={view.total}
        query={view.query}
        querySpec={view.querySpec}
        basePath={CATALOG_BASE_PATH}
        searchPlaceholder="Search by manufacturer, model or part number"
        filters={view.filters}
        emptyState={
          <CatalogEmptyState
            // E-15. Only a role that can reach `/settings/catalog` is offered a
            // way to add an entry — unit 03's page, correct against the map now.
            canAddEntry={canReadRoute(ctx.role, "/settings/catalog")}
          />
        }
        filteredEmpty={{
          // E-15's two narrowed empties, and the copy is exact for both.
          // `noun` — not `title` — because `title` overrides the search
          // headline too, and *"No matches for '<query>'"* has to survive.
          noun: "results",
          searchSuggestion: "Try a part number or a manufacturer.",
        }}
        error={view.error}
      />
    </div>
  );
}
