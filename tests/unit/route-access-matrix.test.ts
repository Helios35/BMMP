import { describe, expect, it } from "vitest";

import { APP_ROUTES, capabilityFor, isPublicRoute } from "@/domain/access";
import type { AppRoute } from "@/domain/access/routes";
import { ROLE_CODES, type RoleCode } from "@/domain/taxonomy/role";

/**
 * `SITE_ARCHITECTURE.md` §5.2, transcribed cell by cell — the security sweep's
 * "route access per role, proven by test" (brief 07 outcome 11).
 *
 * **This table is copied from the document, not from the code**, so a drift
 * in either direction fails here. `R` reads, `W` reaches and performs the
 * route's mutating actions, `—` cannot reach. Public routes are their own
 * rule (§5.6) and are asserted in `route-capability.test.ts`.
 *
 * `tests/e2e/route-access.spec.ts` proves the same matrix against the running
 * guard, persona by persona.
 */

type Cell = "R" | "W" | "—";

/** Columns: P1 · P2 · P3 · P4 · P5 · P6 — §5.2's order. */
const MATRIX: Readonly<
  Record<
    Exclude<AppRoute, "/sign-in" | "/sign-up" | "/invite/[token]">,
    readonly [Cell, Cell, Cell, Cell, Cell, Cell]
  >
> = {
  "/": ["R", "R", "R", "R", "R", "R"],
  "/batteries": ["R", "R", "R", "R", "R", "R"],
  "/batteries/new": ["W", "—", "—", "—", "—", "W"],
  "/batteries/[id]": ["W", "R", "R", "R", "R", "W"],
  "/review": ["W", "R", "—", "—", "—", "W"],
  "/containers": ["R", "R", "R", "R", "R", "R"],
  "/containers/[id]": ["W", "W", "—", "—", "—", "W"],
  "/shipments": ["R", "R", "R", "R", "R", "R"],
  "/shipments/new": ["W", "—", "—", "—", "—", "W"],
  "/shipments/[id]": ["W", "R", "R", "R", "R", "W"],
  "/documents/[id]": ["R", "R", "R", "R", "R", "R"],
  "/catalog": ["R", "R", "R", "R", "R", "R"],
  "/catalog/[id]": ["R", "R", "R", "R", "R", "R"],
  "/settings/organization": ["—", "W", "—", "—", "—", "W"],
  "/settings/users": ["—", "W", "—", "—", "—", "W"],
  "/settings/catalog": ["—", "—", "—", "—", "—", "W"],
  "/audit": ["—", "R", "—", "—", "R", "R"],
};

const CAPABILITY: Readonly<Record<Cell, string>> = {
  R: "read",
  W: "write",
  "—": "none",
};

/** §5.2's columns are personas; the map is keyed by T-37 role. */
const COLUMN_ROLE: readonly RoleCode[] = [
  "compliance_handler",
  "facility_manager",
  "producer_compliance_officer",
  "mobility_supplier_technician",
  "auditor",
  "platform_admin",
];

describe("SITE_ARCHITECTURE.md §5.2, cell by cell", () => {
  it("covers every authenticated route and every role", () => {
    expect(Object.keys(MATRIX).sort()).toEqual(
      APP_ROUTES.filter((route) => !isPublicRoute(route)).sort(),
    );
    expect([...COLUMN_ROLE].sort()).toEqual([...ROLE_CODES].sort());
  });

  const cells = Object.entries(MATRIX).flatMap(([route, row]) =>
    row.map(
      (cell, column) =>
        [route as AppRoute, COLUMN_ROLE[column] as RoleCode, cell] as const,
    ),
  );

  it.each(cells)("%s · %s is %s", (route, role, cell) => {
    expect(capabilityFor(role, route)).toBe(CAPABILITY[cell]);
  });
});
