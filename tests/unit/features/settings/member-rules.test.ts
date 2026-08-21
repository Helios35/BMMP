import { describe, expect, it } from "vitest";

import {
  canWriteRoute,
  readableRoutesFor,
} from "@/domain/access/route-capability";
import { ROLE_CODES, ROLE_LABELS } from "@/domain/taxonomy/role";
import {
  canChangeRoleOf,
  DEACTIVATE_CONFIRMATION_BODY,
  DEACTIVATE_CONTROL_LABEL,
  LAST_BINDING_AUTHORITY_HEADLINE,
  LAST_BINDING_AUTHORITY_REMEDY,
  PLATFORM_ROLE_GRANT_REASON,
  roleOptionsFor,
} from "@/features/settings/member-rules";
import { roleCapabilitySummary } from "@/features/settings/role-capability-summary";

/**
 * The rules `/settings/users`' write paths must carry — `UX_SPEC.md` §3.18,
 * Rules 1.11, 1.12, 1.13, 1.26; D-35.
 *
 * The controls themselves are absent in this unit. **The constraints are
 * asserted now** so the unit that builds them implements a fixed target rather
 * than re-deciding four rules from scratch.
 */

describe("Rule 1.11 — no user changes their own role", () => {
  it("has no control on the actor's own row", () => {
    expect(canChangeRoleOf("user-a", "user-a")).toBe(false);
  });

  it("has one on every other row, including a row with no user yet", () => {
    expect(canChangeRoleOf("user-a", "user-b")).toBe(true);
    expect(canChangeRoleOf("user-a", null)).toBe(true);
  });
});

describe("only P6 grants or revokes P6", () => {
  it("disables the platform role for a facility manager, with the reason stated", () => {
    const options = roleOptionsFor("facility_manager");
    const platformOption = options.find(
      (option) => option.role === "platform_admin",
    );

    expect(platformOption?.isDisabled).toBe(true);
    // Rule 1.26 — a silently disabled control is a defect.
    expect(platformOption?.disabledReason).toBe(PLATFORM_ROLE_GRANT_REASON);
    expect(PLATFORM_ROLE_GRANT_REASON).toContain(ROLE_LABELS.platform_admin);
  });

  it("leaves every other role grantable by a facility manager", () => {
    const options = roleOptionsFor("facility_manager");
    for (const option of options) {
      if (option.role === "platform_admin") continue;
      expect(option.isDisabled).toBe(false);
    }
  });

  it("disables nothing for a platform admin", () => {
    expect(
      roleOptionsFor("platform_admin").every((option) => !option.isDisabled),
    ).toBe(true);
  });

  it("marks the option rather than removing it, in T-37's declared order", () => {
    expect(roleOptionsFor("facility_manager").map((o) => o.role)).toEqual([
      ...ROLE_CODES,
    ]);
  });

  it("labels every option from ROLE_LABELS rather than inline", () => {
    for (const option of roleOptionsFor("platform_admin")) {
      expect(option.label).toBe(ROLE_LABELS[option.role]);
    }
  });
});

describe("the role description is computed, never typed", () => {
  it("agrees with ROUTE_ACCESS for every role", () => {
    for (const role of ROLE_CODES) {
      const summary = roleCapabilitySummary(role);
      expect(summary.readableRoutes).toEqual(readableRoutesFor(role));
      expect(summary.writableRoutes).toEqual(
        readableRoutesFor(role).filter((route) => canWriteRoute(role, route)),
      );
      expect(summary.sentence).toContain(
        `${summary.readableRoutes.length} pages`,
      );
    }
  });

  it("says an auditor can act on none of them — Rule 1.14", () => {
    const summary = roleCapabilitySummary("auditor");
    expect(summary.writableRoutes).toHaveLength(0);
    expect(summary.sentence).toContain("can act on none of them");
  });

  it("offers no route the guard would refuse", () => {
    for (const role of ROLE_CODES) {
      for (const route of roleCapabilitySummary(role).writableRoutes) {
        expect(canWriteRoute(role, route)).toBe(true);
      }
    }
  });
});

describe("Rule 1.13 — deactivated, never deleted", () => {
  it("never says Delete", () => {
    expect(DEACTIVATE_CONTROL_LABEL).toBe("Deactivate");
    expect(
      `${DEACTIVATE_CONTROL_LABEL} ${DEACTIVATE_CONFIRMATION_BODY}`,
    ).not.toMatch(/delete|remove them|erase/i);
  });

  it("states that their history stays attached", () => {
    expect(DEACTIVATE_CONFIRMATION_BODY).toMatch(/permanently/i);
    expect(DEACTIVATE_CONFIRMATION_BODY).toMatch(/audit event/i);
  });
});

describe("Rule 1.12 / D-35 — the last binding-authority holder", () => {
  it("names the remedy rather than only refusing", () => {
    expect(LAST_BINDING_AUTHORITY_HEADLINE).toMatch(/only member/i);
    expect(LAST_BINDING_AUTHORITY_REMEDY).toMatch(/assign/i);
    expect(LAST_BINDING_AUTHORITY_REMEDY).toContain(
      ROLE_LABELS.facility_manager,
    );
    expect(LAST_BINDING_AUTHORITY_REMEDY).toContain(ROLE_LABELS.platform_admin);
  });
});
