import {
  canWriteRoute,
  readableRoutesFor,
} from "@/domain/access/route-capability";
import { APP_ROUTE_NAMES, type AppRoute } from "@/domain/access/routes";
import type { RoleCode } from "@/domain/taxonomy/role";

/**
 * The one-line, plain-language description of what a role can do — `UX_SPEC.md`
 * §3.18.
 *
 * **Computed from `ROUTE_ACCESS`, never typed.** §3.18 requires the description
 * to be *"drawn from the same role map the guard reads"* precisely so it cannot
 * drift from the enforcement: a sentence someone wrote by hand goes stale the
 * first time a capability changes, and a member is then told they can do
 * something the guard refuses.
 *
 * There is no second route list here — `readableRoutesFor` and `canWriteRoute`
 * are the map's own readers (`SITE_ARCHITECTURE.md` §7.2).
 */

export interface RoleCapabilitySummary {
  readonly role: RoleCode;
  readonly readableRoutes: readonly AppRoute[];
  readonly writableRoutes: readonly AppRoute[];
  /** e.g. `Can open 12 pages; can act on 6 of them.` */
  readonly sentence: string;
  /** The page names, for a tooltip or a details line. Display order is `APP_ROUTES`. */
  readonly readableRouteNames: readonly string[];
}

function pageCount(count: number): string {
  return count === 1 ? "1 page" : `${count} pages`;
}

export function roleCapabilitySummary(role: RoleCode): RoleCapabilitySummary {
  const readableRoutes = readableRoutesFor(role);
  const writableRoutes = readableRoutes.filter((route) =>
    canWriteRoute(role, route),
  );

  const opens = `Can open ${pageCount(readableRoutes.length)}`;
  const acts =
    writableRoutes.length === 0
      ? "can act on none of them"
      : `can act on ${writableRoutes.length} of them`;

  return {
    role,
    readableRoutes,
    writableRoutes,
    sentence: `${opens}; ${acts}.`,
    readableRouteNames: readableRoutes.map((route) => APP_ROUTE_NAMES[route]),
  };
}
