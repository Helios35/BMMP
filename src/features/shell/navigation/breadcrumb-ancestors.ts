import { canReadRoute } from "@/domain/access/route-capability";
import { APP_ROUTE_NAMES, type AppRoute } from "@/domain/access/routes";
import type { RoleCode } from "@/domain/taxonomy/role";

/**
 * The breadcrumb trail — `SITE_ARCHITECTURE.md` §2.4 and §1.2.
 *
 * **Derived from the matched route pattern, never from splitting a URL string.**
 * A second pathname-to-route matcher is the duplication §7.2 forbids; the one
 * matcher is `matchRoute`, and this module starts from its answer.
 *
 * **A trail is at most two crumbs**, because §1.2 fixes the depth: nothing sits
 * more than three segments deep and there are **no detail-within-detail routes**.
 * A battery opened from a container navigates to `/batteries/[id]` with a crumb
 * back to `/batteries`, not back to the container. There is deliberately no
 * "back to where you came from" crumb — that would be a `?from=` parameter, and
 * no document specifies one.
 *
 * **This module is server-side only.** It reads `canReadRoute` for a value, so a
 * client component must not import it (§5.3(3)); the resolved crumbs travel as
 * plain data instead.
 */

export interface BreadcrumbCrumb {
  readonly label: string;
  /** Absent on the leaf, which is the current page and is never a link. */
  readonly href?: string;
}

/**
 * Child route to its list route.
 *
 * Every entry here is a detail or multi-step route. **List routes carry no
 * breadcrumbs at all** (§2.4), so they are absent rather than mapped to
 * themselves.
 */
export const BREADCRUMB_ANCESTOR: Readonly<
  Partial<Record<AppRoute, AppRoute>>
> = {
  "/batteries/new": "/batteries",
  "/batteries/[id]": "/batteries",
  "/containers/[id]": "/containers",
  "/shipments/new": "/shipments",
  "/shipments/[id]": "/shipments",
  "/catalog/[id]": "/catalog",
};

/**
 * The trail for one route, for one role.
 *
 * `leafLabel` is the page's own name — a record code, a catalog entry's model —
 * supplied by the page, because only the page has read the record.
 *
 * **The ancestor crumb renders only where the role can read the ancestor.**
 * Where it cannot, the trail is the leaf alone: never a link a role will be
 * redirected away from (§5.3(7), E-11).
 */
export function breadcrumbTrail(
  route: AppRoute,
  role: RoleCode,
  leafLabel: string,
): readonly BreadcrumbCrumb[] {
  const ancestor = BREADCRUMB_ANCESTOR[route];
  const leaf: BreadcrumbCrumb = { label: leafLabel };

  if (ancestor === undefined || !canReadRoute(role, ancestor)) return [leaf];
  return [{ label: APP_ROUTE_NAMES[ancestor], href: ancestor }, leaf];
}
