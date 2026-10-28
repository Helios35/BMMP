import { describe, expect, it } from "vitest";

import {
  mayTakeRecallAction,
  RECALL_ACTIONS,
  rolesForRecallAction,
} from "@/domain/access/recall-actions";
import { ROLE_CODES } from "@/domain/taxonomy/role";

/**
 * Who may act on a record's recalls — Rules 6.23, 6.24, 10.10, 10.14–10.16;
 * D-73 #4. Adding is open to the person who receives the notice; removing is
 * held to a stricter bar; P5 does nothing.
 */
describe("mayTakeRecallAction", () => {
  it("lets P1 and P6 do every recall act", () => {
    for (const action of RECALL_ACTIONS) {
      expect(mayTakeRecallAction("compliance_handler", action)).toBe(true);
      expect(mayTakeRecallAction("platform_admin", action)).toBe(true);
    }
  });

  it("lets P2 check, confirm and record — and neither dismiss nor withdraw", () => {
    expect(mayTakeRecallAction("facility_manager", "check_now")).toBe(true);
    expect(mayTakeRecallAction("facility_manager", "confirm")).toBe(true);
    expect(mayTakeRecallAction("facility_manager", "record")).toBe(true);
    expect(mayTakeRecallAction("facility_manager", "dismiss")).toBe(false);
    expect(mayTakeRecallAction("facility_manager", "withdraw")).toBe(false);
  });

  it("gives P5, P3 and P4 nothing", () => {
    for (const role of [
      "auditor",
      "producer_compliance_officer",
      "mobility_supplier_technician",
    ] as const) {
      for (const action of RECALL_ACTIONS) {
        expect(mayTakeRecallAction(role, action)).toBe(false);
      }
    }
  });

  it("names the roles that can, from the same map", () => {
    expect(rolesForRecallAction("dismiss")).toEqual([
      "compliance_handler",
      "platform_admin",
    ]);
    expect(
      rolesForRecallAction("confirm").every((role) =>
        ROLE_CODES.includes(role),
      ),
    ).toBe(true);
  });
});
