import { cookies } from "next/headers";

import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import type { Alert } from "@/types/storage";
import {
  ALERT_SEVERITY_INTENTS,
  type StatusIntent,
} from "@/components/status/status-intent";
import {
  canReadRoute,
  canWriteRoute,
  readableRoutesFor,
} from "@/domain/access/route-capability";
import {
  APP_ROUTES,
  APP_ROUTE_NAMES,
  type AppRoute,
} from "@/domain/access/routes";
import { ALERT_TYPE_LABELS } from "@/domain/taxonomy/alert-type";
import { ROLE_LABELS } from "@/domain/taxonomy/role";
import { requireRoute } from "@/lib/auth/guard";
import { nowIso, requestPathAndQuery } from "@/lib/auth/session";

// Sign-out belongs to the auth feature, which owns every session write. There is
// exactly one `signOut` in the codebase and the shell renders it rather than
// carrying a second (spec 01 §C2).
import { signOut } from "@/features/auth/actions";
import { AppShell } from "@/features/shell/app-shell";
import { searchCommandPalette } from "@/features/shell/actions/search-command-palette";
import { switchOrganization } from "@/features/shell/actions/switch-organization";
import type { AlertBellItem } from "@/features/shell/chrome/alert-bell";
import { sortAlertsForBell } from "@/features/shell/chrome/alert-order";
import { relativeTimeLabel } from "@/features/shell/chrome/relative-time";
import type { PaletteResult } from "@/features/shell/command-palette/palette-types";
import {
  isNavCollapsed,
  NAV_COLLAPSE_COOKIE,
} from "@/features/shell/nav-collapse";
import { NAV_ITEMS } from "@/features/shell/navigation/nav-items";

/**
 * The authenticated shell — `SITE_ARCHITECTURE.md` §2.
 *
 * **It resolves the session once and hands the chrome what it needs, already
 * derived.** Nothing below this file sees a `RequestContext`, a role decision or
 * the capability map: access is resolved server-side, before rendering, against
 * the one `ROUTE_ACCESS` the guard, the navigation, the command palette and
 * every cross-route link read (§5.3(3), §7.2).
 *
 * **`requireRoute` is the first statement**, and it redirects rather than
 * returning on any denial.
 *
 * ## Why the layout guards `/` and not the route being served
 *
 * The layout guards the **group's floor** — an in-force membership, which is
 * what `/` requires and every role holds. The per-route capability decision
 * belongs to the segment, where §5.3(3) puts it, and every `(app)` segment opens
 * with its own `requireRoute`.
 *
 * Guarding the matched pattern here as well would look like defence in depth and
 * is not: Next.js renders a layout and its page in parallel, so a denied route
 * would call `recordRouteDenial` twice and put **two rows in an append-only log
 * for one attempt**. Denials are evidence (Rules 12.6, 1.16), and a doubled
 * count is a wrong record rather than a redundant one.
 *
 * Both calls read the same `ROUTE_ACCESS` through the same function, so there is
 * still exactly one route-access structure and no second list (§7.2).
 *
 * **No page data is read here.** The alert bell is the one chrome region with a
 * read of its own, and it is isolated: a failed alerts fetch renders the bell's
 * error state and never blanks the page (`UX_SPEC.md` §3.4).
 */

const ALERT_BELL_LIMIT = 5;

/**
 * Where an alert points, for this role, or `null`.
 *
 * A row whose target this role cannot reach renders informationally with no link
 * — never a dead link and never a redirect (§5.3(7), Rule 1.26).
 *
 * Only `/batteries/[id]` exists in this unit. `b1a-03` adds the `/review` target
 * for `review_queue`, `b1a-04` the `/containers/[id]` target for
 * `container_capacity` and `storage_clock`, and `b1a-05` the `/shipments/[id]`
 * target. Until each page exists, its alerts render as text: an alert linking to
 * a 404 is worse than an alert that does not link.
 */
function alertHref(alert: Alert, role: Parameters<typeof canReadRoute>[0]) {
  if (alert.batteryRecordId !== null && canReadRoute(role, "/batteries/[id]")) {
    return `/batteries/${alert.batteryRecordId}`;
  }
  return null;
}

async function readAlertsForBell(
  ctx: RequestContext,
  asOf: string,
): Promise<{
  readonly items: readonly AlertBellItem[];
  readonly total: number;
  readonly state: "ready" | "error";
}> {
  try {
    const page = await data.alerts.list(ctx, {
      isOpen: true,
      audienceRole: ctx.role,
      limit: ALERT_BELL_LIMIT,
    });

    const items = sortAlertsForBell(page.items).map((alert) => {
      // T-48 has no module and `alert.severity` is `string`. An unrecognised
      // severity resolves to `neutral` and is never guessed upward into
      // `critical` (`TAXONOMY.md` §5.8).
      const intent: StatusIntent =
        ALERT_SEVERITY_INTENTS[alert.severity] ?? "neutral";

      return {
        id: alert.id,
        intent,
        title: alert.title,
        body: alert.body,
        typeLabel: ALERT_TYPE_LABELS[alert.alertType],
        raisedAt: alert.raisedAt,
        raisedAtLabel: relativeTimeLabel(alert.raisedAt, asOf),
        href: alertHref(alert, ctx.role),
      } satisfies AlertBellItem;
    });

    // `Page.total`, not `items.length` — an alert whose severity this build does
    // not recognise is still counted.
    return { items, total: page.total, state: "ready" };
  } catch (error) {
    // Nothing is swallowed: the failure is logged and the bell says so.
    console.error("[shell] alerts could not be loaded", error);
    return { items: [], total: 0, state: "error" };
  }
}

/**
 * The palette's `pages` group — `NAV_ITEMS ∩ readableRoutesFor(role)`, plus
 * `/batteries/new` where the role may perform it.
 *
 * Labels come from `APP_ROUTE_NAMES` rather than the nav labels: a searcher
 * types "audit log", not "audit" (`SITE_ARCHITECTURE.md` §4).
 */
function palettePages(
  visibleRoutes: readonly AppRoute[],
  role: Parameters<typeof canWriteRoute>[0],
): readonly PaletteResult[] {
  const pages: PaletteResult[] = NAV_ITEMS.filter((item) =>
    visibleRoutes.includes(item.route),
  ).map((item) => ({
    id: item.route,
    group: "pages" as const,
    label: APP_ROUTE_NAMES[item.route],
    href: item.route,
  }));

  // An action route rather than a nav destination (§4.4), and it belongs in the
  // palette for the roles that can perform it.
  if (canWriteRoute(role, "/batteries/new")) {
    pages.push({
      id: "/batteries/new",
      group: "pages",
      label: APP_ROUTE_NAMES["/batteries/new"],
      href: "/batteries/new",
    });
  }

  return pages;
}

export default async function AppLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const { ctx, identity, membership } = await requireRoute("/");

  const asOf = nowIso();
  const cookieStore = await cookies();

  const visibleRoutes = readableRoutesFor(ctx.role);
  const writableRoutes = APP_ROUTES.filter((candidate) =>
    canWriteRoute(ctx.role, candidate),
  );

  const alerts = await readAlertsForBell(ctx, asOf);
  const retryHref = (await requestPathAndQuery()) ?? "/";

  const displayName = identity.fullName ?? identity.email;

  return (
    <AppShell
      role={ctx.role}
      visibleRoutes={visibleRoutes}
      writableRoutes={writableRoutes}
      // No badge feeds a rendered nav item in this unit: `/review` and
      // `/containers` are the only two §2.1 gives counts to and neither page
      // exists yet. `b1a-03` and `b1a-04` add the read beside this one.
      badges={{}}
      defaultCollapsed={isNavCollapsed(
        cookieStore.get(NAV_COLLAPSE_COOKIE)?.value,
      )}
      organizationSwitcher={{
        activeOrganizationId: ctx.organizationId,
        // The in-force list, resolved on this request (Rule 1.28). One read, and
        // it is the same one the guard already made.
        organizations: identity.memberships.map((candidate) => ({
          organizationId: candidate.organizationId,
          name: candidate.organizationName,
          roleLabel: ROLE_LABELS[candidate.role],
        })),
        switchOrganization,
      }}
      alertBell={{
        items: alerts.items,
        total: alerts.total,
        state: alerts.state,
        retryHref,
      }}
      userMenu={{
        displayName,
        email: identity.email,
        roleInOrganization: `${ROLE_LABELS[ctx.role]} at ${membership.organizationName}`,
        signOut,
      }}
      commandPalette={{
        pages: palettePages(visibleRoutes, ctx.role),
        search: searchCommandPalette,
      }}
    >
      {children}
    </AppShell>
  );
}
