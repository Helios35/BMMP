import { canReadRoute } from "@/domain/access/route-capability";
import type { AppRoute } from "@/domain/access/routes";
import type { RoleCode } from "@/domain/taxonomy/role";
import type { Uuid } from "@/types/common";

/**
 * Where an audit row's Entity column points — `UX_SPEC.md` §3.20.
 *
 * **The deep link is the whole reason the list state lives in the URL**
 * (`SITE_ARCHITECTURE.md` §7.4): an audit row has to open the exact view it
 * describes, or "why did this record change in March" is answered by hunting.
 *
 * **This is not a second route-access structure.** It maps an audited table to
 * the route that shows that table's record, and then asks the one `ROUTE_ACCESS`
 * whether this role may open it (§5.3(7), §7.2). A role that cannot reach the
 * target gets no link — never a dead link and never a redirect.
 *
 * A table absent from this map renders as text. That is the honest state for a
 * `storage_clock`, a `membership` or a `jurisdiction_rule` row: the identifier in
 * `entity_id` is the clock's or the membership's, not the container's or the
 * user's, so a constructed href would point at a record that is not the one the
 * event is about. **A wrong link is worse than no link**, for the same reason a
 * wrong document is worse than no document.
 */
const ENTITY_ROUTE: Readonly<Record<string, AppRoute>> = {
  battery_record: "/batteries/[id]",
  catalog_entry: "/catalog/[id]",
  container: "/containers/[id]",
  shipment: "/shipments/[id]",
  document_render: "/documents/[id]",
};

/**
 * The href for one audited record, or `null` where there is not one.
 *
 * `/containers/[id]`, `/shipments/[id]` and `/documents/[id]` belong to units 04
 * and 05. The links are rendered anyway, exactly as specified: they are correct
 * against the capability map and the page arrives with its unit.
 */
export function auditEntityHref(
  entityTable: string,
  entityId: Uuid,
  role: RoleCode,
): string | null {
  const route = ENTITY_ROUTE[entityTable];
  if (route === undefined) return null;
  if (!canReadRoute(role, route)) return null;
  return route.replace("[id]", encodeURIComponent(entityId));
}
