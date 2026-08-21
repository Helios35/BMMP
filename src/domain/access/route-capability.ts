import { ROLE_CODES, type RoleCode } from "@/domain/taxonomy/role";
import { type Capability, canRead, canWrite } from "@/domain/access/capability";
import { APP_ROUTES, type AppRoute } from "@/domain/access/routes";

/**
 * The per-route, per-role capability map — `SITE_ARCHITECTURE.md` §5.2.
 *
 * **One map, one place**, read by the route guard, the navigation renderer, the
 * command palette and every cross-route link (§5.3 rule 3, §5.3 rule 7, §7.2).
 * Duplicating it is how a nav item and a route come to disagree about whether a
 * page exists.
 *
 * **Nothing consumes it yet.** This unit builds the structure; the guard and the
 * navigation are later units' work.
 *
 * Three things this map is not:
 *
 * - **Not the enforcement.** Every mutating server action re-checks the role and
 *   rejects, and row-level security refuses underneath that (§5.3 rules 6 and 9;
 *   `TECHNICAL_SPEC.md` §9.4, §9.5). A capability of `write` here is permission
 *   to render the control, never permission to skip the check.
 * - **Not what may be done on the route.** `BUSINESS_RULES.md` § Roles and
 *   Permissions owns that, and where the two appear to disagree the page list in
 *   `_ANCHORS.md` §5 governs which page opens while the rules govern what may be
 *   done on it. P1 and P2 both hold `write` on `/containers/[id]` and do not
 *   hold the same `write` — §5.5 is the authority on the difference.
 * - **Not a boolean.** `SITE_ARCHITECTURE.md` §5.3 rule 3 rejects a boolean map
 *   outright: it cannot express P2's view-only access to `/review` and would be
 *   rewritten within one phase.
 */

/**
 * P6's row is read as "under an active support grant" throughout.
 *
 * Platform Admin is `user.is_platform_admin`, not a membership role
 * (`TECHNICAL_SPEC.md` §9.2), and **platform scope alone confers no tenant data
 * access** (Rule 1.17). Acting inside a tenant requires a recorded grant naming
 * reason, scope and expiry, and every action under it is marked in the audit log
 * as a platform action (Rules 1.18, 12.7).
 */
export const PLATFORM_ADMIN_REQUIRES_SUPPORT_GRANT = true;

export interface RouteAccessRule {
  readonly route: AppRoute;
  /** `true` for the three `(auth)` routes and nothing else (`SITE_ARCHITECTURE.md` §5.6). */
  readonly isPublic: boolean;
  /** Capability by role, for a member of the organization. */
  readonly capabilities: Readonly<Record<RoleCode, Capability>>;
  /** Why this row is what it is, where §5.2 gives a reason. */
  readonly note?: string;
  /**
   * The rule a denial on this route must name — Rule 1.26, *every permission
   * denial states the reason in plain language and, where a rule governs it,
   * names the rule.* Absent where the restriction is a role posture rather than
   * a numbered rule.
   *
   * Stored as the bare number (`"12.8"`); the "Rule " prefix belongs to the
   * copy, not to the data.
   *
   * **It lives on this row rather than in a lookup keyed by route**, because a
   * second structure keyed by route is the exact duplication §7.2 forbids — and
   * a denial message that disagrees with the map about who may open a page is
   * worse than no message.
   */
  readonly deniedRule?: string;
}

/**
 * The capability row for a public route.
 *
 * Every role holds `none`, and that is not a restriction — access to the three
 * `(auth)` routes is governed by `isPublic`, never by a role, because a caller
 * reaching them has no membership yet. Holding `none` is also what keeps them
 * out of `readableRoutesFor`, so a signed-in user gets no nav item to `/sign-in`
 * and a signed-in user who reaches it is redirected to `/`.
 */
const NO_MEMBER_CAPABILITY: Readonly<Record<RoleCode, Capability>> = {
  compliance_handler: "none",
  facility_manager: "none",
  producer_compliance_officer: "none",
  mobility_supplier_technician: "none",
  auditor: "none",
  platform_admin: "none",
};

/** Every member reads; nobody writes. */
const MEMBER_READ: Readonly<Record<RoleCode, Capability>> = {
  compliance_handler: "read",
  facility_manager: "read",
  producer_compliance_officer: "read",
  mobility_supplier_technician: "read",
  auditor: "read",
  platform_admin: "read",
};

/**
 * The route access matrix, transcribed from `SITE_ARCHITECTURE.md` §5.2.
 *
 * `none` / `read` / `write` correspond to that table's `—` / `R` / `W`.
 */
export const ROUTE_ACCESS: Readonly<Record<AppRoute, RouteAccessRule>> = {
  "/sign-in": {
    route: "/sign-in",
    isPublic: true,
    capabilities: NO_MEMBER_CAPABILITY,
    note: "Unauthenticated only; a signed-in user is redirected to /.",
  },
  "/sign-up": {
    route: "/sign-up",
    isPublic: true,
    capabilities: NO_MEMBER_CAPABILITY,
    note: "Requires a tos_acceptance before entering (app).",
  },
  "/invite/[token]": {
    route: "/invite/[token]",
    isPublic: true,
    capabilities: NO_MEMBER_CAPABILITY,
    note: "Token-scoped; shows no tenant data before authentication.",
  },

  "/": {
    route: "/",
    isPublic: false,
    capabilities: MEMBER_READ,
    note: "Alert content differs by role; P5 sees no create actions.",
  },

  "/batteries": {
    route: "/batteries",
    isPublic: false,
    capabilities: MEMBER_READ,
    note: "Export is P2, P5, P6.",
  },
  "/batteries/new": {
    route: "/batteries/new",
    isPublic: false,
    capabilities: {
      compliance_handler: "write",
      facility_manager: "none",
      producer_compliance_officer: "none",
      mobility_supplier_technician: "none",
      auditor: "none",
      platform_admin: "write",
    },
    note: "P4 gains write at B3; the map expresses that as a value change, not a rewrite.",
  },
  "/batteries/[id]": {
    route: "/batteries/[id]",
    isPublic: false,
    capabilities: {
      compliance_handler: "write",
      facility_manager: "read",
      producer_compliance_officer: "read",
      mobility_supplier_technician: "read",
      auditor: "read",
      platform_admin: "write",
    },
    note: "Only P1/P6 edit assessed condition, re-run matching or attach photos.",
  },

  "/review": {
    route: "/review",
    isPublic: false,
    capabilities: {
      compliance_handler: "write",
      facility_manager: "read",
      producer_compliance_officer: "none",
      mobility_supplier_technician: "none",
      auditor: "none",
      platform_admin: "write",
    },
    note:
      "P2 is view-only (Rule 2.22). Her view is composed for her question — which " +
      "batteries in her containers are still unidentified — not a disabled copy of " +
      "P1's: confirm and void are absent, not greyed out (UX_SPEC.md §3.8, E-8b). " +
      "This row is why the map is a capability and not a boolean.",
  },

  "/containers": {
    route: "/containers",
    isPublic: false,
    capabilities: MEMBER_READ,
    note:
      "Reachable by all six while /containers/[id] is not — the one place in B1a " +
      "where a list is broader than its detail. For P3, P4 and P5 the rows are not " +
      "links (SITE_ARCHITECTURE.md §5.4).",
  },
  "/containers/[id]": {
    route: "/containers/[id]",
    isPublic: false,
    capabilities: {
      compliance_handler: "write",
      facility_manager: "write",
      producer_compliance_officer: "none",
      mobility_supplier_technician: "none",
      auditor: "none",
      platform_admin: "write",
    },
    note:
      "P1 and P2 both hold write and do not hold the same write — " +
      "SITE_ARCHITECTURE.md §5.5 is the authority on the difference. No role can " +
      "change an accumulation start date, and there is no re-date control on any " +
      "screen for any role (Rule 4.4).",
  },

  "/shipments": {
    route: "/shipments",
    isPublic: false,
    capabilities: MEMBER_READ,
  },
  "/shipments/new": {
    route: "/shipments/new",
    isPublic: false,
    capabilities: {
      compliance_handler: "write",
      facility_manager: "none",
      producer_compliance_officer: "none",
      mobility_supplier_technician: "none",
      auditor: "none",
      platform_admin: "write",
    },
    note: "P2 hands off via the container's ready-to-ship status.",
  },
  "/shipments/[id]": {
    route: "/shipments/[id]",
    isPublic: false,
    capabilities: {
      compliance_handler: "write",
      facility_manager: "read",
      producer_compliance_officer: "read",
      mobility_supplier_technician: "read",
      auditor: "read",
      platform_admin: "write",
    },
    note: "Reprint and re-render are P1/P6.",
  },

  "/documents/[id]": {
    route: "/documents/[id]",
    isPublic: false,
    capabilities: MEMBER_READ,
    note: "Print and download available to all six; every render is logged.",
  },

  "/catalog": {
    route: "/catalog",
    isPublic: false,
    capabilities: MEMBER_READ,
  },
  "/catalog/[id]": {
    route: "/catalog/[id]",
    isPublic: false,
    capabilities: MEMBER_READ,
    note: "'Edit this entry' appears for P6 only.",
  },

  "/settings/organization": {
    route: "/settings/organization",
    isPublic: false,
    capabilities: {
      compliance_handler: "none",
      facility_manager: "write",
      producer_compliance_officer: "none",
      mobility_supplier_technician: "none",
      auditor: "none",
      platform_admin: "write",
    },
    note:
      "Holds the 24-hour emergency number and the jurisdiction profile. P1 cannot " +
      "reach it, so a block that depends on either names P2 and P6 rather than " +
      "offering P1 a dead link (E-11).",
  },
  "/settings/users": {
    route: "/settings/users",
    isPublic: false,
    capabilities: {
      compliance_handler: "none",
      facility_manager: "write",
      producer_compliance_officer: "none",
      mobility_supplier_technician: "none",
      auditor: "none",
      platform_admin: "write",
    },
    note: "Only P6 may grant or revoke the P6 role. No user changes their own role (Rule 1.11).",
  },
  "/settings/catalog": {
    route: "/settings/catalog",
    isPublic: false,
    capabilities: {
      compliance_handler: "none",
      facility_manager: "none",
      producer_compliance_officer: "none",
      mobility_supplier_technician: "none",
      auditor: "none",
      platform_admin: "write",
    },
    note: "P6 only.",
  },

  "/audit": {
    route: "/audit",
    isPublic: false,
    capabilities: {
      compliance_handler: "none",
      facility_manager: "read",
      producer_compliance_officer: "none",
      mobility_supplier_technician: "none",
      auditor: "read",
      platform_admin: "read",
    },
    deniedRule: "12.8",
    note:
      "P1 cannot read the audit log (Rule 12.8). P1, P3 and P4 see the history of " +
      "records they can already open, built from storage_event, " +
      "classification_decision, damage_assessment, alert and document_render rather " +
      "than from the raw log. Export is available to all three who can read it.",
  },
};

/** What one role may do on one route. */
export function capabilityFor(role: RoleCode, route: AppRoute): Capability {
  return ROUTE_ACCESS[route].capabilities[role];
}

/** Whether a role may reach and read a route. */
export function canReadRoute(role: RoleCode, route: AppRoute): boolean {
  return canRead(capabilityFor(role, route));
}

/** Whether a role may perform a route's mutating actions. See the caveats above. */
export function canWriteRoute(role: RoleCode, route: AppRoute): boolean {
  return canWrite(capabilityFor(role, route));
}

/**
 * Every route a role may reach, in `APP_ROUTES` order.
 *
 * The navigation renders from this, so a role that cannot reach a route sees no
 * nav item, no row link, no command-palette result and no cross-route entry
 * point to it (`SITE_ARCHITECTURE.md` §5.3 rule 7).
 */
export function readableRoutesFor(role: RoleCode): readonly AppRoute[] {
  return APP_ROUTES.filter((route) => canReadRoute(role, route));
}

/**
 * The roles that hold no capability at all on a route.
 *
 * A member who reaches one is **redirected to `/` with a toast naming the
 * restriction** — not a blank 403, not a silent no-op, not a crash
 * (`SITE_ARCHITECTURE.md` §5.3 rule 4). A record belonging to another
 * organization is different and stricter: it resolves as **not found**, never as
 * forbidden, because existence is not disclosed across tenants (rule 5, Rule 1.2).
 *
 * Every denial writes an `audit_event` — attempts are evidence (Rules 12.6, 1.16).
 */
export function rolesDeniedFrom(route: AppRoute): readonly RoleCode[] {
  return ROLE_CODES.filter((role) => !canReadRoute(role, route));
}

/**
 * P5 holds `write` nowhere, and this asserts it rather than trusting the table.
 *
 * **Rule 1.14** — P5 is read-only, externally, everywhere, always, and no state,
 * setting, grant or role change makes it otherwise. The database is the real
 * enforcement (P5 appears in no writer set, so no policy admits the write); this
 * is a cheap standing check that the map has not drifted away from it.
 */
export function auditorHoldsNoWrite(): boolean {
  return APP_ROUTES.every((route) => !canWriteRoute("auditor", route));
}
