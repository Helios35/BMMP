import type { AppRoute } from "@/domain/access/routes";
import type { RoleCode } from "@/domain/taxonomy/role";

/**
 * `SITE_ARCHITECTURE.md` §5.2, transcribed cell by cell — **from the
 * document, not from the code**, so a drift in either direction fails the
 * tests that read it: `tests/unit/route-access-matrix.test.ts` (the map) and
 * `tests/e2e/route-access.spec.ts` (the running guard).
 *
 * `R` reads, `W` reaches and performs the route's mutating actions, `—`
 * cannot reach. Public routes are their own rule (§5.6).
 */

export type Cell = "R" | "W" | "—";

/** Columns: P1 · P2 · P3 · P4 · P5 · P6 — §5.2's order. */
export const MATRIX: Readonly<
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

export const CAPABILITY: Readonly<Record<Cell, string>> = {
  R: "read",
  W: "write",
  "—": "none",
};

/** §5.2's columns are personas; the map is keyed by T-37 role. */
export const COLUMN_ROLE: readonly RoleCode[] = [
  "compliance_handler",
  "facility_manager",
  "producer_compliance_officer",
  "mobility_supplier_technician",
  "auditor",
  "platform_admin",
];
