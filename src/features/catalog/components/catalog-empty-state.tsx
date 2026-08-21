import Link from "next/link";
import type { ReactElement } from "react";
import { BookOpen } from "lucide-react";

import { Button } from "@/components/ui/button";

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
    <div
      role="status"
      data-empty-state="catalog"
      className="flex flex-col items-start gap-2 rounded-lg border border-border p-6"
    >
      <div className="flex items-center gap-2">
        <BookOpen aria-hidden="true" className="size-5 text-muted-foreground" />
        <p className="text-body-strong">{CATALOG_EMPTY_TITLE}</p>
      </div>

      {canAddEntry ? (
        <div className="pt-2">
          {/* `/settings/catalog` is unit 03's page. The link is correct against
              the capability map today and the page arrives with its unit; a
              substitute affordance here would have to be unpicked later. */}
          <Button asChild size="lg" className="min-h-11 rounded-md">
            <Link href="/settings/catalog">Add an entry</Link>
          </Button>
        </div>
      ) : (
        <p className="max-w-[72ch] text-body">{CATALOG_EMPTY_WITHOUT_ACTION}</p>
      )}
    </div>
  );
}
