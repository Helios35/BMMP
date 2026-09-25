import Link from "next/link";
import type { ReactElement } from "react";

import {
  encodeListQuery,
  type ListQuery,
  type ListQuerySpec,
} from "@/components/record-table/list-url";
import { cn } from "@/lib/utils";

/**
 * A detail route's sections, as links — `SITE_ARCHITECTURE.md` §2.5, §7.4.
 *
 * **The tab lives in the URL**, so an alert, a document or an audit row can
 * deep-link into the exact section it describes, and a reader can send that
 * link to a colleague. That is why these are links rather than a client tab
 * widget holding its own state: a widget would put the current section
 * somewhere a URL cannot reach.
 *
 * They are marked up as navigation rather than as an ARIA tablist.
 * `role="tab"` promises arrow-key movement between panels that are already in
 * the document; these are page loads, and claiming the pattern would describe
 * behaviour that does not happen.
 *
 * `/batteries/[id]` and `/containers/[id]` render through this one strip.
 */

export interface RouteTab {
  readonly id: string;
  readonly label: string;
}

export function RouteTabs({
  tabs,
  basePath,
  query,
  spec,
  active,
  label,
  dataAttribute,
}: {
  readonly tabs: readonly RouteTab[];
  readonly basePath: string;
  readonly query: ListQuery;
  readonly spec: ListQuerySpec;
  readonly active: string;
  /** The `nav`'s accessible name — *"Battery record sections"*. */
  readonly label: string;
  /** The hook each tab carries, e.g. `data-record-tab`, so a route's specs keep theirs. */
  readonly dataAttribute: string;
}): ReactElement {
  return (
    // The row scrolls rather than wrapping on a phone, and it scrolls inside its
    // own container so the page body never scrolls horizontally (§4.3).
    <nav aria-label={label} className="overflow-x-auto">
      <ul className="flex min-w-max items-end gap-1 border-b border-border">
        {tabs.map((tab) => {
          const isCurrent = tab.id === active;
          return (
            <li key={tab.id}>
              <Link
                href={encodeListQuery(basePath, query, { tab: tab.id }, spec)}
                aria-current={isCurrent ? "page" : undefined}
                {...{ [dataAttribute]: tab.id }}
                data-tab-state={isCurrent ? "current" : "default"}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-t-md px-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
                  // The current tab carries weight and a rule as well as
                  // `aria-current`: colour is never the only signal (§1.2 Rule 4).
                  isCurrent
                    ? "border-b-2 border-foreground text-body-strong"
                    : "text-label hover:bg-muted/50",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
