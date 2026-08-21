import Link from "next/link";
import type { ReactElement } from "react";

import {
  encodeListQuery,
  type ListQuery,
  type ListQuerySpec,
} from "@/components/record-table/list-url";
import { cn } from "@/lib/utils";

/**
 * The four sections of a battery record — `UX_SPEC.md` §3.7,
 * `SITE_ARCHITECTURE.md` §2.5.
 *
 * **The tab lives in the URL** (§7.4), so an alert, a document or an audit row
 * can deep-link into the exact section it describes, and a reader can send that
 * link to a colleague. That is why these are links rather than a client tab
 * widget holding its own state: a widget would put the current section somewhere
 * a URL cannot reach.
 *
 * They are marked up as navigation rather than as an ARIA tablist. `role="tab"`
 * promises arrow-key movement between panels that are already in the document;
 * these are page loads, and claiming the pattern would describe behaviour that
 * does not happen.
 */

export const RECORD_TABS = [
  { id: "overview", label: "Overview" },
  { id: "photos", label: "Photos & extraction" },
  { id: "documents", label: "Documents" },
  { id: "history", label: "History" },
] as const;

export type RecordTabId = (typeof RECORD_TABS)[number]["id"];

export const RECORD_TAB_IDS: readonly RecordTabId[] = RECORD_TABS.map(
  (tab) => tab.id,
);

export const DEFAULT_RECORD_TAB: RecordTabId = "overview";

/**
 * The codec spec for a detail route: a tab, and nothing else.
 *
 * No sortable column and no filter, so an unknown `?sort=` or `?dir=` is dropped
 * from the canonical URL rather than carried into a link.
 */
export const RECORD_TAB_SPEC: ListQuerySpec = {
  sortableColumnIds: [],
  defaultSort: "",
  defaultDir: "desc",
  filterIds: [],
  tabIds: RECORD_TAB_IDS,
  defaultTab: DEFAULT_RECORD_TAB,
};

export function activeRecordTab(query: ListQuery): RecordTabId {
  const tab = query.tab;
  return tab !== null && isRecordTabId(tab) ? tab : DEFAULT_RECORD_TAB;
}

function isRecordTabId(value: string): value is RecordTabId {
  return (RECORD_TAB_IDS as readonly string[]).includes(value);
}

export function RecordTabs({
  basePath,
  query,
  active,
}: {
  readonly basePath: string;
  readonly query: ListQuery;
  readonly active: RecordTabId;
}): ReactElement {
  return (
    // The row scrolls rather than wrapping on a phone, and it scrolls inside its
    // own container so the page body never scrolls horizontally (§4.3).
    <nav aria-label="Battery record sections" className="overflow-x-auto">
      <ul className="flex min-w-max items-end gap-1 border-b border-border">
        {RECORD_TABS.map((tab) => {
          const isCurrent = tab.id === active;
          return (
            <li key={tab.id}>
              <Link
                href={encodeListQuery(
                  basePath,
                  query,
                  { tab: tab.id },
                  RECORD_TAB_SPEC,
                )}
                aria-current={isCurrent ? "page" : undefined}
                data-record-tab={tab.id}
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
