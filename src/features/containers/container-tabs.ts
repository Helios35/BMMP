import type {
  ListQuery,
  ListQuerySpec,
} from "@/components/record-table/list-url";
import type { RouteTab } from "@/components/page/route-tabs";

import { TAB_CONTENTS, TAB_HISTORY, TAB_LABEL } from "./container-copy";

/**
 * `/containers/[id]`'s three sections — `UX_SPEC.md` §3.10: Contents, Label,
 * History. The tab is in the URL, so an alert or an audit row can land on the
 * section it is about.
 */

export const CONTAINER_TABS = [
  { id: "contents", label: TAB_CONTENTS },
  { id: "label", label: TAB_LABEL },
  { id: "history", label: TAB_HISTORY },
] as const satisfies readonly RouteTab[];

export type ContainerTabId = (typeof CONTAINER_TABS)[number]["id"];

const CONTAINER_TAB_IDS: readonly ContainerTabId[] = CONTAINER_TABS.map(
  (tab) => tab.id,
);

export const CONTAINER_TAB_SPEC: ListQuerySpec = {
  sortableColumnIds: [],
  defaultSort: "",
  defaultDir: "desc",
  filterIds: [],
  tabIds: CONTAINER_TAB_IDS,
  defaultTab: "contents",
};

export function activeContainerTab(query: ListQuery): ContainerTabId {
  const tab = query.tab;
  return tab !== null && (CONTAINER_TAB_IDS as readonly string[]).includes(tab)
    ? (tab as ContainerTabId)
    : "contents";
}

/** `?dialog=storage-event` — §3.8b's **Record a storage event**, arriving from `/review`. */
export const STORAGE_EVENT_DIALOG = "storage-event";
