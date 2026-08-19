/**
 * The twenty B1a routes, as their route patterns.
 *
 * `SITE_ARCHITECTURE.md` §1.1 and §7.1: *"20 routes. That is the complete B1a
 * surface."* A twenty-first is a decision-log entry, not a builder's call. The
 * page list itself is fixed in `_ANCHORS.md` §5 and does not move.
 *
 * These are Next.js route patterns, so `[id]` and `[token]` stay literal — the
 * map is keyed on the route, not on a resolved URL.
 */
export const APP_ROUTES = [
  // (auth) — public, no app shell, no nav
  "/sign-in",
  "/sign-up",
  "/invite/[token]",

  // (app) — authenticated, app shell
  "/",
  "/batteries",
  "/batteries/new",
  "/batteries/[id]",
  "/review",
  "/containers",
  "/containers/[id]",
  "/shipments",
  "/shipments/new",
  "/shipments/[id]",
  "/documents/[id]",
  "/catalog",
  "/catalog/[id]",
  "/settings/organization",
  "/settings/users",
  "/settings/catalog",
  "/audit",
] as const;

export type AppRoute = (typeof APP_ROUTES)[number];

/**
 * The three public routes. **Nothing else** (`SITE_ARCHITECTURE.md` §5.6).
 *
 * No public battery record, no public document link, no shareable read-only URL
 * in B1a. `/documents/[id]` is authenticated even though it is the most
 * obviously shareable page in the product — an unauthenticated document URL is a
 * data leak with a customer serial number in it.
 */
export const PUBLIC_ROUTES = [
  "/sign-in",
  "/sign-up",
  "/invite/[token]",
] as const satisfies readonly AppRoute[];

export type PublicRoute = (typeof PUBLIC_ROUTES)[number];

export function isPublicRoute(route: AppRoute): route is PublicRoute {
  return (PUBLIC_ROUTES as readonly AppRoute[]).includes(route);
}

/** Human name for each route, from the page inventory (`SITE_ARCHITECTURE.md` §4). */
export const APP_ROUTE_NAMES: Readonly<Record<AppRoute, string>> = {
  "/sign-in": "Sign in",
  "/sign-up": "Sign up",
  "/invite/[token]": "Accept invitation",
  "/": "Dashboard",
  "/batteries": "Batteries",
  "/batteries/new": "Log a battery",
  "/batteries/[id]": "Battery record",
  "/review": "Review queue",
  "/containers": "Containers",
  "/containers/[id]": "Container",
  "/shipments": "Shipments",
  "/shipments/new": "Build a shipment",
  "/shipments/[id]": "Shipment",
  "/documents/[id]": "Document",
  "/catalog": "Catalog",
  "/catalog/[id]": "Catalog entry",
  "/settings/organization": "Organization",
  "/settings/users": "Members and roles",
  "/settings/catalog": "Catalog administration",
  "/audit": "Audit log",
};
