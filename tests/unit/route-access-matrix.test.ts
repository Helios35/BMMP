import { describe, expect, it } from "vitest";

import { APP_ROUTES, capabilityFor, isPublicRoute } from "@/domain/access";
import type { AppRoute } from "@/domain/access/routes";
import { ROLE_CODES, type RoleCode } from "@/domain/taxonomy/role";

import { CAPABILITY, COLUMN_ROLE, MATRIX } from "../support/site-route-matrix";

/**
 * `SITE_ARCHITECTURE.md` §5.2, transcribed cell by cell — the security sweep's
 * "route access per role, proven by test" (brief 07 outcome 11).
 *
 * **The table (`tests/support/site-route-matrix.ts`) is copied from the
 * document, not from the code**, so a drift in either direction fails here. `R` reads, `W` reaches and performs the
 * route's mutating actions, `—` cannot reach. Public routes are their own
 * rule (§5.6) and are asserted in `route-capability.test.ts`.
 *
 * `tests/e2e/route-access.spec.ts` proves the same matrix against the running
 * guard, persona by persona.
 */

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
