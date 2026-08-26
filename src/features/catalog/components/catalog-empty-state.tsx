import type { ReactElement } from "react";
import { BookOpen } from "lucide-react";

import { EmptyState } from "@/components/page/empty-state";

/**
 * `/catalog` with no entries at all — **E-15**, `UX_SPEC.md` §5.
 *
 * The zero-records state, which is not the filters-exclude-everything state:
 * `RecordTable` owns that one and gives it different copy and a different
 * action, because showing onboarding copy to someone who just mistyped a filter
 * is a defect (§2.7).
 *
 * **Copy is exact and the action differs by role.** Only a role that can reach
 * `/settings/catalog` is offered a way to add an entry; everyone else is told
 * who can, and gets no button — a dead link into a page the guard will refuse is
 * worse than no link (`SITE_ARCHITECTURE.md` §5.3(7)).
 *
 * The decision is not made here. The route asks
 * `canReadRoute(role, "/settings/catalog")` against the one capability map and
 * passes the answer (`UX_SPEC.md` §7.4).
 */

export const CATALOG_EMPTY_TITLE = "The catalog is empty.";

export const CATALOG_EMPTY_WITHOUT_ACTION =
  "Ask an Admin to add entries, or propose one while logging a battery.";

export interface CatalogEmptyStateProps {
  /** True where this role holds access to `/settings/catalog` — P6 only today. */
  readonly canAddEntry: boolean;
}

export function CatalogEmptyState({
  canAddEntry,
}: CatalogEmptyStateProps): ReactElement {
  return (
    <EmptyState
      icon={BookOpen}
      title={CATALOG_EMPTY_TITLE}
      // `/settings/catalog` is unit 03's page. The link is correct against the
      // capability map today and the page arrives with its unit; a substitute
      // affordance here would have to be unpicked later.
      action={
        canAddEntry
          ? {
              label: "Add an entry",
              href: "/settings/catalog",
              testId: "/settings/catalog",
            }
          : null
      }
      whoCanAct={canAddEntry ? undefined : CATALOG_EMPTY_WITHOUT_ACTION}
      dataAttributes={{ "data-empty-state-of": "catalog" }}
    />
  );
}
