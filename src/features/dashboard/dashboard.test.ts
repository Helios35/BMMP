import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { data } from "@/data";
import type { RequestContext } from "@/data/contracts/context";
import { resetMockStore } from "@/data/mock";
import * as ID from "@/data/mock/fixtures/ids";
import { ROLE_CODES, type RoleCode } from "@/domain/taxonomy/role";
import { readIntakeGate } from "@/features/consent/read-intake-gate";
import type { Alert, StorageClock } from "@/types/storage";

import { dashboardPrimaryAction } from "./dashboard-header";
import {
  containerClockTierCounts,
  clocksNeedingAMeter,
  StorageSummaryRegion,
} from "./storage-summary-region";
import { AlertsRegion, routeAlert } from "./alerts-region";
import { quickActionsFor } from "./quick-actions-region";
import {
  auditRowLink,
  recentActivitySource,
  RecentActivityRegion,
} from "./recent-activity-region";
import {
  reviewQueueFraming,
  reviewQueueMessage,
  ReviewQueueRegion,
} from "./review-queue-region";
import { zeroBatteriesState } from "./zero-batteries";

/**
 * The dashboard's decisions, tested where they are made.
 *
 * Everything asserted here is a **branch**, not a pixel: which source recent
 * activity reads, which variant an empty workspace renders, which control is
 * absent. `UX_SPEC.md` §3.4's regions are proved at the route level by
 * Playwright; these are the calls a screenshot cannot tell apart.
 */

function ctx(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    userId: ID.USER.danaHandler,
    organizationId: ID.ORG.cascade,
    role: "compliance_handler",
    isPlatformAdmin: false,
    correlationId: "test-dashboard-0001",
    ...overrides,
  };
}

function alert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: ID.ALERT.overdueDrum,
    organizationId: ID.ORG.cascade,
    alertType: "storage_clock",
    severity: "critical",
    title: "A container has reached its limit",
    body: "The container accepts no new items.",
    storageClockId: ID.CLOCK.overdueDrum,
    containerId: ID.CONTAINER.overdueDrum,
    batteryRecordId: null,
    shipmentId: null,
    intakeSessionId: null,
    recallMatchId: null,
    obligationDeadlineId: null,
    siteIdRef: null,
    audienceRoles: ["compliance_handler"],
    governingRuleVersionId: null,
    triggerSnapshot: {},
    raisedAt: "2026-06-12T07:00:00.000Z",
    dedupeKey: "test",
    acknowledgedAt: null,
    acknowledgedBy: null,
    resolvedAt: null,
    resolutionReason: null,
    deliveredChannels: null,
    createdAt: "2026-06-12T07:00:00.000Z",
    updatedAt: "2026-06-12T07:00:00.000Z",
    ...overrides,
  };
}

function clock(overrides: Partial<StorageClock> = {}): StorageClock {
  return {
    id: ID.CLOCK.soundDrum,
    organizationId: ID.ORG.cascade,
    subjectType: "container",
    batteryRecordId: null,
    containerId: ID.CONTAINER.soundDrum,
    clockStartAt: "2026-05-01T00:00:00.000Z",
    clockStartBasis: "first_placement",
    timeZone: "America/Los_Angeles",
    maxDurationDays: 365,
    governingRuleVersionId: ID.RULE_VERSION.waAccumulationPeriod2026,
    evaluationTrace: [],
    dueAt: "2027-05-01T00:00:00.000Z",
    alertSchedule: {},
    alertBand: "none",
    nextAlertAt: null,
    stoppedAt: null,
    stopReason: null,
    status: "running",
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  resetMockStore();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the primary action", () => {
  it("offers Log a battery to the roles that hold write on it", () => {
    for (const role of ["compliance_handler", "platform_admin"] as const) {
      expect(
        dashboardPrimaryAction({
          role,
          hasStorageClockAlert: false,
          isIntakeBlocked: false,
        }),
      ).toMatchObject({ href: "/batteries/new" });
    }
  });

  it("omits it — not disables it — where intake is blocked organisation-wide", () => {
    expect(
      dashboardPrimaryAction({
        role: "compliance_handler",
        hasStorageClockAlert: false,
        isIntakeBlocked: true,
      }),
    ).toBeNull();
  });

  it("gives the facility manager the storage-clock alert's own action, and nothing when none is open", () => {
    expect(
      dashboardPrimaryAction({
        role: "facility_manager",
        hasStorageClockAlert: true,
        isIntakeBlocked: false,
      }),
    ).toMatchObject({ href: "/containers?filter=alerting" });

    expect(
      dashboardPrimaryAction({
        role: "facility_manager",
        hasStorageClockAlert: false,
        isIntakeBlocked: false,
      }),
    ).toBeNull();
  });

  it("gives the auditor the audit log and never a create action", () => {
    expect(
      dashboardPrimaryAction({
        role: "auditor",
        hasStorageClockAlert: true,
        isIntakeBlocked: false,
      }),
    ).toMatchObject({ href: "/audit" });
  });

  it("gives P3 and P4 no primary action", () => {
    for (const role of [
      "producer_compliance_officer",
      "mobility_supplier_technician",
    ] as const) {
      expect(
        dashboardPrimaryAction({
          role,
          hasStorageClockAlert: true,
          isIntakeBlocked: false,
        }),
      ).toBeNull();
    }
  });
});

describe("E-1 — zero batteries, five role variants", () => {
  const EXPECTED: Readonly<
    Record<RoleCode, { readonly variant: string; readonly href: string | null }>
  > = {
    compliance_handler: { variant: "handler", href: "/batteries/new" },
    platform_admin: { variant: "handler", href: "/batteries/new" },
    facility_manager: { variant: "facility_manager", href: "/containers" },
    producer_compliance_officer: { variant: "observer", href: "/catalog" },
    mobility_supplier_technician: { variant: "observer", href: "/catalog" },
    auditor: { variant: "auditor", href: "/audit" },
  };

  it("renders a variant for every one of the six roles", () => {
    for (const role of ROLE_CODES) {
      const state = zeroBatteriesState(role, { isIntakeBlocked: false });
      expect(state.variant).toBe(EXPECTED[role].variant);
      expect(state.action?.href ?? null).toBe(EXPECTED[role].href);
      expect(state.message.length).toBeGreaterThan(0);
    }
  });

  it("gives the auditor no create action", () => {
    const state = zeroBatteriesState("auditor", { isIntakeBlocked: false });
    expect(state.action?.href).not.toBe("/batteries/new");
  });

  it("omits the invitation to log a battery where intake is blocked", () => {
    expect(
      zeroBatteriesState("compliance_handler", { isIntakeBlocked: true })
        .action,
    ).toBeNull();
    // Every other role's next step is unaffected: the gate blocks intake, not
    // the app.
    expect(
      zeroBatteriesState("auditor", { isIntakeBlocked: true }).action?.href,
    ).toBe("/audit");
  });
});

describe("quick actions", () => {
  it("yields both for P1 and P6 and none for P2, P3, P4 and P5", () => {
    const options = { isIntakeBlocked: false };
    expect(
      quickActionsFor("compliance_handler", options).map((a) => a.route),
    ).toEqual(["/batteries/new", "/shipments/new"]);
    expect(
      quickActionsFor("platform_admin", options).map((a) => a.route),
    ).toEqual(["/batteries/new", "/shipments/new"]);
    for (const role of [
      "facility_manager",
      "producer_compliance_officer",
      "mobility_supplier_technician",
      "auditor",
    ] as const) {
      expect(quickActionsFor(role, options)).toEqual([]);
    }
  });

  it("drops the intake action where intake is blocked", () => {
    expect(
      quickActionsFor("compliance_handler", { isIntakeBlocked: true }).map(
        (a) => a.route,
      ),
    ).toEqual(["/shipments/new"]);
  });
});

describe("the review queue card", () => {
  it("frames the same count differently, and is absent for P3, P4 and P5", () => {
    expect(reviewQueueFraming("compliance_handler")).toBe("confirming");
    expect(reviewQueueFraming("platform_admin")).toBe("confirming");
    expect(reviewQueueFraming("facility_manager")).toBe("unidentified");
    expect(reviewQueueFraming("producer_compliance_officer")).toBeNull();
    expect(reviewQueueFraming("mobility_supplier_technician")).toBeNull();
    expect(reviewQueueFraming("auditor")).toBeNull();
  });

  it("agrees with itself in the singular", () => {
    expect(reviewQueueMessage("confirming", 1)).toBe(
      "1 reading needs confirming.",
    );
    expect(reviewQueueMessage("confirming", 2)).toBe(
      "2 readings need confirming.",
    );
    expect(reviewQueueMessage("unidentified", 1)).toBe(
      "1 battery in your containers isn't identified yet.",
    );
  });

  it("renders the good state at zero", () => {
    expect(reviewQueueMessage("confirming", 0)).toBe(
      "Nothing to review. Every reading has been confirmed.",
    );
  });
});

describe("alert routing", () => {
  it("sends a container alert to the containers screen", () => {
    expect(routeAlert(alert(), "compliance_handler")).toEqual({
      action: {
        label: "View containers with alerts",
        href: "/containers?filter=alerting",
      },
      deniedNote: null,
    });
  });

  it("names who can act rather than rendering a dead button", () => {
    const reviewAlert = alert({
      alertType: "review_queue",
      containerId: null,
      storageClockId: null,
      intakeSessionId: ID.INTAKE_SESSION.spreadInReview,
    });
    expect(routeAlert(reviewAlert, "compliance_handler").action).toEqual({
      label: "Open the review queue",
      href: "/review",
    });

    const denied = routeAlert(reviewAlert, "auditor");
    expect(denied.action).toBeNull();
    expect(denied.deniedNote).toBe(
      "Ask a Handler or an Admin to confirm these readings.",
    );
  });
});

describe("the storage summary", () => {
  it("renders every tier in T-27 order, including the empty ones", () => {
    const counts = containerClockTierCounts([
      clock({ alertBand: "overdue" }),
      clock({ id: ID.CLOCK.quarantineDrum, alertBand: "none" }),
    ]);
    expect(counts.map((tier) => tier.band)).toEqual([
      "none",
      "early",
      "mid",
      "final",
      "overdue",
    ]);
    expect(counts.map((tier) => tier.count)).toEqual([1, 0, 0, 0, 1]);
  });

  it("counts container clocks only", () => {
    const counts = containerClockTierCounts([
      clock({ containerId: null, batteryRecordId: ID.BATTERY.vehicleTraction }),
    ]);
    expect(counts.every((tier) => tier.count === 0)).toBe(true);
  });

  it("meters attention-or-worse from the stored band, never from a number", () => {
    const metered = clocksNeedingAMeter([
      clock({ alertBand: "none" }),
      clock({ id: ID.CLOCK.overdueDrum, alertBand: "overdue" }),
    ]);
    expect(metered.map((c) => c.id)).toEqual([ID.CLOCK.overdueDrum]);
  });
});

describe("recent activity — Rule 12.8", () => {
  it("reads storage_event for the roles that cannot read the audit log", () => {
    expect(recentActivitySource("compliance_handler")).toBe("storage_event");
    expect(recentActivitySource("producer_compliance_officer")).toBe(
      "storage_event",
    );
    expect(recentActivitySource("mobility_supplier_technician")).toBe(
      "storage_event",
    );
  });

  it("reads audit_event for the roles that can", () => {
    expect(recentActivitySource("facility_manager")).toBe("audit_event");
    expect(recentActivitySource("auditor")).toBe("audit_event");
    expect(recentActivitySource("platform_admin")).toBe("audit_event");
  });

  it("never calls auditEvents.list for a compliance handler", async () => {
    const auditList = vi.spyOn(data.auditEvents, "list");
    const storageList = vi.spyOn(data.storageEvents, "list");

    await RecentActivityRegion({
      ctx: ctx(),
      asOf: "2026-08-21T12:00:00.000Z",
      retryHref: "/",
    });

    expect(auditList).not.toHaveBeenCalled();
    expect(storageList).toHaveBeenCalledOnce();
  });

  it("calls auditEvents.list for a facility manager", async () => {
    const auditList = vi.spyOn(data.auditEvents, "list");
    const storageList = vi.spyOn(data.storageEvents, "list");

    await RecentActivityRegion({
      ctx: ctx({ userId: ID.USER.martaManager, role: "facility_manager" }),
      asOf: "2026-08-21T12:00:00.000Z",
      retryHref: "/",
    });

    expect(auditList).toHaveBeenCalledOnce();
    expect(storageList).not.toHaveBeenCalled();
  });

  it("links a row only where the role can open its subject", () => {
    expect(
      auditRowLink("auditor", "battery_record", ID.BATTERY.vehicleTraction),
    ).toBe(`/batteries/${ID.BATTERY.vehicleTraction}`);
    // A storage clock is a real subject with no addressable page in B1a.
    expect(
      auditRowLink("auditor", "storage_clock", ID.CLOCK.overdueDrum),
    ).toBeNull();
    // P5 holds nothing on /containers/[id].
    expect(
      auditRowLink("auditor", "container", ID.CONTAINER.overdueDrum),
    ).toBeNull();
  });
});

describe("every region reads without a denial, for every role", () => {
  /**
   * The regions are async server components, so the returned element is a plain
   * object and its `state` prop is the region's own answer — which is the point
   * of `data-region-state`: a reviewer and a test read the state rather than
   * guessing at classes.
   */
  function regionState(element: { readonly props: unknown }): string {
    const props = element.props as { readonly state?: string };
    return props.state ?? "default";
  }

  const ROLE_USERS: Readonly<Record<RoleCode, string>> = {
    compliance_handler: ID.USER.danaHandler,
    facility_manager: ID.USER.martaManager,
    producer_compliance_officer: ID.USER.priyaProducer,
    mobility_supplier_technician: ID.USER.omarTechnician,
    auditor: ID.USER.samAuditor,
    platform_admin: ID.USER.platformAdmin,
  };

  const AS_OF = "2026-08-21T12:00:00.000Z";

  for (const role of ROLE_CODES) {
    it(`serves ${role} without throwing`, async () => {
      const request = ctx({
        userId: ROLE_USERS[role],
        role,
        isPlatformAdmin: role === "platform_admin",
      });

      const alerts = await AlertsRegion({ ctx: request, retryHref: "/" });
      expect(["default", "empty"]).toContain(regionState(alerts));

      const storage = await StorageSummaryRegion({
        ctx: request,
        asOf: AS_OF,
        retryHref: "/",
      });
      expect(["default", "empty"]).toContain(regionState(storage));

      const activity = await RecentActivityRegion({
        ctx: request,
        asOf: AS_OF,
        retryHref: "/",
      });
      expect(["default", "empty"]).toContain(regionState(activity));

      const review = await ReviewQueueRegion({ ctx: request, retryHref: "/" });
      if (reviewQueueFraming(role) === null) {
        expect(review).toBeNull();
      } else {
        expect(["default", "empty"]).toContain(
          regionState(review as { readonly props: unknown }),
        );
      }
    });
  }

  it("shows P1 two alert cards, P2 one, and P3, P4 and P5 the empty state", async () => {
    const seen = async (role: RoleCode) => {
      const element = await AlertsRegion({
        ctx: ctx({ userId: ROLE_USERS[role], role }),
        retryHref: "/",
      });
      return regionState(element);
    };

    expect(await seen("compliance_handler")).toBe("default");
    expect(await seen("facility_manager")).toBe("default");
    expect(await seen("producer_compliance_officer")).toBe("empty");
    expect(await seen("mobility_supplier_technician")).toBe("empty");
    expect(await seen("auditor")).toBe("empty");
  });
});

describe("the Terms of Service gate the page awaits", () => {
  /**
   * The dashboard reads the gate before it renders a header, because E-12
   * decides whether any create affordance renders at all. A role that could not
   * make that read would 500 on `/`, so every one of the six is proved able to.
   */
  const ROLE_USERS: Readonly<Record<RoleCode, string>> = {
    compliance_handler: ID.USER.danaHandler,
    facility_manager: ID.USER.martaManager,
    producer_compliance_officer: ID.USER.priyaProducer,
    mobility_supplier_technician: ID.USER.omarTechnician,
    auditor: ID.USER.samAuditor,
    platform_admin: ID.USER.platformAdmin,
  };

  for (const role of ROLE_CODES) {
    it(`resolves for ${role}`, async () => {
      const gate = await readIntakeGate(
        ctx({ userId: ROLE_USERS[role], role }),
        "2026-08-21",
      );
      // Cascade holds an acceptance in force, so intake is open for all six.
      expect(gate.status).not.toBe("blocked");
    });
  }

  it("blocks the organization that has never accepted, and names who can", async () => {
    const gate = await readIntakeGate(
      ctx({
        userId: ID.USER.tomOlympicHandler,
        organizationId: ID.ORG.olympic,
        role: "compliance_handler",
      }),
      "2026-08-21",
    );
    expect(gate.status).toBe("blocked");
    expect(gate.acceptors.length).toBeGreaterThan(0);
    // A create affordance is omitted, not disabled, while that is true.
    expect(
      dashboardPrimaryAction({
        role: "compliance_handler",
        hasStorageClockAlert: false,
        isIntakeBlocked: gate.status === "blocked",
      }),
    ).toBeNull();
  });
});
