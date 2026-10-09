import type {
  ListQuery,
  ListQuerySpec,
} from "@/components/record-table/list-url";
import type { RouteTab } from "@/components/page/route-tabs";

import { TAB_CONTENTS, TAB_HISTORY, TAB_PAPER } from "./shipment-copy";

/**
 * `/shipments/[id]`'s three sections — `UX_SPEC.md` §3.13: Shipping paper,
 * Contents, History. The tab is in the URL, so an audit row can land on the
 * section it is about.
 */

export const SHIPMENT_TABS = [
  { id: "paper", label: TAB_PAPER },
  { id: "contents", label: TAB_CONTENTS },
  { id: "history", label: TAB_HISTORY },
] as const satisfies readonly RouteTab[];

export type ShipmentTabId = (typeof SHIPMENT_TABS)[number]["id"];

const SHIPMENT_TAB_IDS: readonly ShipmentTabId[] = SHIPMENT_TABS.map(
  (tab) => tab.id,
);

export const SHIPMENT_TAB_SPEC: ListQuerySpec = {
  sortableColumnIds: [],
  defaultSort: "",
  defaultDir: "desc",
  filterIds: [],
  tabIds: SHIPMENT_TAB_IDS,
  defaultTab: "paper",
};

export function activeShipmentTab(query: ListQuery): ShipmentTabId {
  const tab = query.tab;
  return tab !== null && (SHIPMENT_TAB_IDS as readonly string[]).includes(tab)
    ? (tab as ShipmentTabId)
    : "paper";
}
