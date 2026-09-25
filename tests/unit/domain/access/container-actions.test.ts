import { describe, expect, it } from "vitest";

import {
  CONTAINER_ACTIONS,
  mayTakeContainerAction,
  rolesForContainerAction,
} from "@/domain/access/container-actions";
import { ROLE_CODES } from "@/domain/taxonomy/role";

/**
 * `SITE_ARCHITECTURE.md` §5.5, row for row — where P1 and P2 differ on
 * `/containers/[id]`. Both hold write on the route; they do not hold the same
 * write.
 */

describe("the container write set (§5.5)", () => {
  it("lets P2 and P6 — and never P1 — record a remediation (Rule 4.17)", () => {
    expect(rolesForContainerAction("record_remediation")).toEqual([
      "facility_manager",
      "platform_admin",
    ]);
  });

  it("lets P1 and P6 — and never P2 — add or remove records", () => {
    expect(rolesForContainerAction("add_or_remove_records")).toEqual([
      "compliance_handler",
      "platform_admin",
    ]);
  });

  it("gives Ship this container to P1 and P6, and Mark ready to ship to all three", () => {
    expect(rolesForContainerAction("ship_this_container")).toEqual([
      "compliance_handler",
      "platform_admin",
    ]);
    expect(rolesForContainerAction("mark_ready_to_ship")).toEqual([
      "compliance_handler",
      "facility_manager",
      "platform_admin",
    ]);
  });

  it("gives capacity, location and retirement to P2 and P6", () => {
    for (const action of ["edit_capacity_or_location", "retire"] as const) {
      expect(rolesForContainerAction(action)).toEqual([
        "facility_manager",
        "platform_admin",
      ]);
    }
  });

  it("gives P3, P4 and P5 nothing at all — they cannot open the page", () => {
    for (const role of [
      "producer_compliance_officer",
      "mobility_supplier_technician",
      "auditor",
    ] as const) {
      for (const action of CONTAINER_ACTIONS) {
        expect(mayTakeContainerAction(role, action), `${role} ${action}`).toBe(
          false,
        );
      }
    }
  });

  it("has no action that changes an accumulation start date (Rules 4.4, 4.9–4.12)", () => {
    for (const action of CONTAINER_ACTIONS) {
      expect(action).not.toMatch(/date|start|clock|pause|extend|reset/);
    }
    expect(ROLE_CODES.length).toBeGreaterThan(0);
  });
});
