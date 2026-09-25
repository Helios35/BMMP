import type { ReactElement } from "react";

import { RouteTabs } from "@/components/page/route-tabs";
import type {
  ListQuery,
  ListQuerySpec,
} from "@/components/record-table/list-url";

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
    <RouteTabs
      tabs={RECORD_TABS}
      basePath={basePath}
      query={query}
      spec={RECORD_TAB_SPEC}
      active={active}
      label="Battery record sections"
      dataAttribute="data-record-tab"
    />
  );
}
