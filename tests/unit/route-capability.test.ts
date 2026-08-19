import { describe, expect, it } from "vitest";
import {
  APP_ROUTES,
  APP_ROUTE_NAMES,
  PUBLIC_ROUTES,
  ROUTE_ACCESS,
  auditorHoldsNoWrite,
  canReadRoute,
  canWriteRoute,
  capabilityFor,
  isPublicRoute,
  readableRoutesFor,
  rolesDeniedFrom,
} from "@/domain/access";
import { ROLE_CODES } from "@/domain/taxonomy/role";

/**
 * The role→route capability map — `SITE_ARCHITECTURE.md` §5.2.
 *
 * **Nothing consumes the map yet.** These tests are what stops it drifting from
 * §5.2 between now and the unit that builds the guard, which is the whole reason
 * it is one map rather than a shape each screen re-derives.
 */

describe("the route inventory", () => {
  it("is exactly the twenty B1a routes (§7.1)", () => {
    // A twenty-first is a decision-log entry, not a builder's call.
    expect(APP_ROUTES).toHaveLength(20);
    expect(new Set(APP_ROUTES).size).toBe(20);
  });

  it("names every route", () => {
    for (const route of APP_ROUTES) {
      expect(APP_ROUTE_NAMES[route]).toBeTruthy();
    }
  });

  it("has an access rule for every route, keyed to itself", () => {
    for (const route of APP_ROUTES) {
      expect(ROUTE_ACCESS[route].route).toBe(route);
    }
  });

  it("makes exactly three routes public, and nothing else (§5.6)", () => {
    // No public battery record, no public document link, no shareable read-only
    // URL in B1a. /documents/[id] is authenticated even though it is the most
    // obviously shareable page in the product.
    expect(PUBLIC_ROUTES).toEqual(["/sign-in", "/sign-up", "/invite/[token]"]);
    for (const route of APP_ROUTES) {
      expect(ROUTE_ACCESS[route].isPublic).toBe(isPublicRoute(route));
    }
    expect(isPublicRoute("/documents/[id]")).toBe(false);
  });

  it("gives every role a capability on every route", () => {
    for (const route of APP_ROUTES) {
      for (const role of ROLE_CODES) {
        expect(["none", "read", "write"]).toContain(capabilityFor(role, route));
      }
    }
  });
});

describe("the capability map", () => {
  it("expresses P2's view-only access to /review — the row a boolean cannot hold", () => {
    // §5.3 rule 3 rejects a boolean map outright for exactly this: P2 reaches
    // /review and cannot act on it. Confirming and voiding are P1/P6 only
    // (Rule 2.22, CL-1).
    expect(capabilityFor("facility_manager", "/review")).toBe("read");
    expect(canReadRoute("facility_manager", "/review")).toBe(true);
    expect(canWriteRoute("facility_manager", "/review")).toBe(false);
    expect(canWriteRoute("compliance_handler", "/review")).toBe(true);
    expect(canWriteRoute("platform_admin", "/review")).toBe(true);
  });

  it("keeps P5 read-only everywhere, always (Rule 1.14)", () => {
    // The database is the real enforcement — P5 appears in no writer set, so no
    // policy admits the write. This is the standing check that the map has not
    // drifted away from it.
    expect(auditorHoldsNoWrite()).toBe(true);
    for (const route of APP_ROUTES) {
      expect(capabilityFor("auditor", route)).not.toBe("write");
    }
  });

  it("keeps P1 out of the audit log (Rule 12.8)", () => {
    // P1, P3 and P4 see the history of records they can already open, built
    // from storage_event, classification_decision, damage_assessment, alert and
    // document_render — not from the raw log.
    expect(capabilityFor("compliance_handler", "/audit")).toBe("none");
    expect(capabilityFor("producer_compliance_officer", "/audit")).toBe("none");
    expect(capabilityFor("mobility_supplier_technician", "/audit")).toBe(
      "none",
    );
    expect(capabilityFor("facility_manager", "/audit")).toBe("read");
    expect(capabilityFor("auditor", "/audit")).toBe("read");
    expect(capabilityFor("platform_admin", "/audit")).toBe("read");
  });

  it("keeps the /containers → /containers/[id] asymmetry (§5.4)", () => {
    // The one place in B1a where a list is broader than its detail, and the
    // most likely thing for a builder to get wrong. For P3, P4 and P5 the rows
    // are not links.
    for (const role of ROLE_CODES) {
      expect(canReadRoute(role, "/containers")).toBe(true);
    }
    expect(
      canReadRoute("producer_compliance_officer", "/containers/[id]"),
    ).toBe(false);
    expect(
      canReadRoute("mobility_supplier_technician", "/containers/[id]"),
    ).toBe(false);
    expect(canReadRoute("auditor", "/containers/[id]")).toBe(false);
    expect(canWriteRoute("compliance_handler", "/containers/[id]")).toBe(true);
    expect(canWriteRoute("facility_manager", "/containers/[id]")).toBe(true);
  });

  it("restricts /settings/catalog to P6 (§5.2)", () => {
    for (const role of ROLE_CODES) {
      const expected = role === "platform_admin" ? "write" : "none";
      expect(capabilityFor(role, "/settings/catalog")).toBe(expected);
    }
  });

  it("keeps P1 off the organization and members settings", () => {
    // P1 cannot reach /settings/organization, which is why a block that depends
    // on the 24-hour emergency number names P2 and P6 rather than offering P1 a
    // dead link (E-11).
    expect(capabilityFor("compliance_handler", "/settings/organization")).toBe(
      "none",
    );
    expect(capabilityFor("compliance_handler", "/settings/users")).toBe("none");
    expect(capabilityFor("facility_manager", "/settings/organization")).toBe(
      "write",
    );
    expect(capabilityFor("facility_manager", "/settings/users")).toBe("write");
  });

  it("gives only P1 and P6 the intake and shipment-building routes", () => {
    for (const route of ["/batteries/new", "/shipments/new"] as const) {
      expect(capabilityFor("compliance_handler", route)).toBe("write");
      expect(capabilityFor("platform_admin", route)).toBe("write");
      expect(capabilityFor("facility_manager", route)).toBe("none");
      expect(capabilityFor("auditor", route)).toBe("none");
    }
  });

  it("lets every member read the dashboard, the lists and the document viewer", () => {
    for (const route of [
      "/",
      "/batteries",
      "/shipments",
      "/documents/[id]",
      "/catalog",
      "/catalog/[id]",
    ] as const) {
      for (const role of ROLE_CODES) {
        expect(canReadRoute(role, route)).toBe(true);
      }
    }
  });
});

describe("navigation and denial", () => {
  it("renders navigation from the same map the guard reads (§5.3 rule 7)", () => {
    const forHandler = readableRoutesFor("compliance_handler");
    expect(forHandler).toContain("/batteries/new");
    expect(forHandler).not.toContain("/audit");
    expect(forHandler).not.toContain("/settings/catalog");
    // The public (auth) routes are not nav items for a signed-in user.
    expect(forHandler).not.toContain("/sign-in");
  });

  it("keeps navigation in the route list's order, not alphabetical", () => {
    const forAdmin = readableRoutesFor("platform_admin");
    const positions = forAdmin.map((route) => APP_ROUTES.indexOf(route));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("names the roles a route denies, so the denial can state a reason (Rule 1.26)", () => {
    // A member who reaches a route their role cannot access is redirected with
    // a toast naming the restriction — not a blank 403, not a silent no-op.
    expect(rolesDeniedFrom("/settings/catalog")).toEqual([
      "compliance_handler",
      "facility_manager",
      "producer_compliance_officer",
      "mobility_supplier_technician",
      "auditor",
    ]);
    expect(rolesDeniedFrom("/documents/[id]")).toEqual([]);
  });
});
