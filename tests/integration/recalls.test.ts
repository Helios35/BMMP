import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mockAdapter, mockStore, resetMockStore } from "@/data/mock";
import * as ID from "@/data/mock/fixtures/ids";
import { recordDamageAssessmentFor } from "@/features/battery-record/server/condition";
import { generateContainerLabel } from "@/features/containers/server/label";
import { runRecallCheck } from "@/features/recalls/server/check";
import {
  confirmRecallMatchFor,
  dismissRecallMatchFor,
  recordRecallFor,
} from "@/features/recalls/server/decide";
import { readRecallSection } from "@/features/recalls/server/read-recalls";
import { runRecallSync } from "@/features/recalls/server/sync";
import {
  changeShipmentContents,
  departShipment,
  generateShippingPaper,
} from "@/features/shipments/server/writes";
import { ConflictError, PermissionError, ValidationError } from "@/lib/errors";

import {
  ctx,
  HANDLER,
  MANAGER,
  NO_ATTRIBUTION,
  pdfText,
  storedBytes,
  verifyCascadeNumber,
} from "./document-support";

/**
 * Recall matching end to end, against the b2-09 fixtures — Rules 6.14, 6.23,
 * 6.24, 10.10–10.18; D-72 #9, D-73.
 *
 * The fixture recall source answers; the domain decides candidates; the
 * mock writes what the decisions set running, as one operation each.
 */

/** Today — so `transport.ddr_packaging` v2 (effective 2026-10-28) governs. */
const NOW = "2026-10-28T18:00:00.000Z";
const LATER = "2026-10-28T19:30:00.000Z";

const AUDITOR = ctx({ userId: ID.USER.samAuditor, role: "auditor" });
const PLATFORM_ADMIN = ctx({
  userId: ID.USER.platformAdmin,
  role: "platform_admin",
  isPlatformAdmin: true,
});

const UTC = "UTC";

beforeEach(() => {
  resetMockStore();
});

function recordRow(id: string) {
  const record = mockStore()
    .batteryRecords.all()
    .find((row) => row.id === id);
  if (record === undefined) throw new Error(`no record ${id}`);
  return record;
}

function matchesOf(recordId: string) {
  return mockStore()
    .recallMatches.all()
    .filter((row) => row.batteryRecordId === recordId);
}

function audits(eventType: string, entityId?: string) {
  return mockStore()
    .auditEvents.all()
    .filter(
      (row) =>
        row.eventType === eventType &&
        (entityId === undefined || row.entityId === entityId),
    );
}

function openAlert(dedupeKey: string) {
  return mockStore()
    .alerts.all()
    .find((row) => row.dedupeKey === dedupeKey && row.resolvedAt === null);
}

describe("a check (Rules 10.10–10.13, 10.17, 10.18)", () => {
  it("finds a possible match in words, raises the alert once, and makes no second row on a second check", async () => {
    await runRecallCheck(
      HANDLER,
      ID.BATTERY.mobilityScooter,
      "check_now",
      NOW,
      NO_ATTRIBUTION,
    );
    const [match] = matchesOf(ID.BATTERY.mobilityScooter);
    expect(match?.status).toBe("possible_match");
    expect(match?.recallNumber).toBe("26-041");
    expect(match?.matchConfidence).toBeNull();
    expect(match?.matchedOn).toEqual({
      identity: "battery",
      fields: ["manufacturer", "model"],
    });
    expect(openAlert(`recall_match:${match?.id}`)?.audienceRoles).toEqual([
      "compliance_handler",
      "facility_manager",
    ]);

    const again = await runRecallCheck(
      HANDLER,
      ID.BATTERY.mobilityScooter,
      "check_now",
      LATER,
      NO_ATTRIBUTION,
    );
    expect(again.found).toEqual([]);
    expect(matchesOf(ID.BATTERY.mobilityScooter)).toHaveLength(1);
    // Every run is kept — two checks, two consumer runs and two device runs.
    expect(
      mockStore()
        .recallCheckRuns.all()
        .filter((run) => run.batteryRecordId === ID.BATTERY.mobilityScooter),
    ).toHaveLength(4);
    expect(audits("recall_match.found")).toHaveLength(1);
    // A check is a system step, never a person's act (Rule 12.5).
    expect(
      audits("recall_check.completed").every(
        (row) => row.actorType === "system",
      ),
    ).toBe(true);
  });

  it("records a source that does not answer as a failed run — never no match (Rule 10.17)", async () => {
    await runRecallCheck(
      HANDLER,
      ID.BATTERY.recallCheckFails,
      "check_now",
      NOW,
      NO_ATTRIBUTION,
    );
    const view = await readRecallSection(
      HANDLER,
      recordRow(ID.BATTERY.recallCheckFails),
      UTC,
    );
    expect(view.standing).toMatchObject({
      status: "not_checked",
      reason: "source_unavailable",
    });
    expect(view.standingText).toBe("Not checked — source unavailable");
    const failed = audits("recall_check.failed").at(-1);
    expect(failed?.afterState?.checkErrorCode).toBe("source_unavailable");
  });

  it("records nothing to match against as a run, not a failure", async () => {
    const recorded = await runRecallCheck(
      HANDLER,
      ID.BATTERY.nothingToMatch,
      "check_now",
      NOW,
      NO_ATTRIBUTION,
    );
    expect(recorded.runs.map((run) => run.outcome)).toEqual([
      "nothing_to_match",
    ]);
    const view = await readRecallSection(
      HANDLER,
      recordRow(ID.BATTERY.nothingToMatch),
      UTC,
    );
    expect(view.standingText).toBe("Nothing to match against.");
  });
});

describe("the Recalls section, by role (UX §3.7)", () => {
  it("offers P2 check, confirm and record — not dismiss", async () => {
    const view = await readRecallSection(
      MANAGER,
      recordRow(ID.BATTERY.recallBrandModel),
      UTC,
    );
    expect(view.standing.status).toBe("possible_match");
    expect(view.canCheckNow && view.canRecord).toBe(true);
    expect(view.rows[0]).toMatchObject({
      matchedOn: "Manufacturer and model match recall 26-041.",
      canConfirm: true,
      canDismiss: false,
    });
  });

  it("offers P5 nothing", async () => {
    const view = await readRecallSection(
      AUDITOR,
      recordRow(ID.BATTERY.recallBrandModel),
      UTC,
    );
    expect(view.canCheckNow || view.canRecord).toBe(false);
    expect(view.rows.some((row) => row.canConfirm || row.canDismiss)).toBe(
      false,
    );
  });

  it("reads the recalled pack as confirmed, recorded by hand", async () => {
    const view = await readRecallSection(
      HANDLER,
      recordRow(ID.BATTERY.recalledQuarantined),
      UTC,
    );
    expect(view.standing.status).toBe("confirmed_match");
    expect(view.rows[0]).toMatchObject({
      isByHand: true,
      canWithdraw: true,
    });
  });
});

describe("deciding (Rules 10.14–10.16, 6.23, 6.24)", () => {
  it("lets P2 confirm: recalled set, air barred, re-classified and quarantined in one operation", async () => {
    const decided = await confirmRecallMatchFor(
      MANAGER,
      {
        recordId: ID.BATTERY.recallBrandModel,
        matchId: ID.RECALL_MATCH.brandModel,
      },
      NOW,
      NO_ATTRIBUTION,
    );
    const record = recordRow(ID.BATTERY.recallBrandModel);
    expect(record.ddrFlags).toEqual(["recalled"]);
    expect(record.isAirTransportProhibited).toBe(true);
    // Placed, on the DDR path: quarantine status, the routing a required action.
    expect(record.status).toBe("quarantined");
    expect(decided.classificationDecisionId).not.toBeNull();
    expect(
      mockStore()
        .classificationDecisions.all()
        .find((row) => row.id === ID.CLASSIFICATION.recallBrandModel)?.status,
    ).toBe("superseded");
    expect(openAlert(`recall_match:${ID.RECALL_MATCH.brandModel}`)).toBe(
      undefined,
    );
    expect(audits("recall_match.confirmed")[0]?.actorUserId).toBe(
      ID.USER.martaManager,
    );
  });

  it("refuses P2 a dismissal and P5 everything", async () => {
    await expect(
      dismissRecallMatchFor(
        MANAGER,
        {
          recordId: ID.BATTERY.recallVehicle,
          matchId: ID.RECALL_MATCH.vehicle,
          reason: "Not this vehicle",
        },
        NOW,
        NO_ATTRIBUTION,
      ),
    ).rejects.toBeInstanceOf(PermissionError);
    await expect(
      confirmRecallMatchFor(
        AUDITOR,
        {
          recordId: ID.BATTERY.recallVehicle,
          matchId: ID.RECALL_MATCH.vehicle,
        },
        NOW,
        NO_ATTRIBUTION,
      ),
    ).rejects.toBeInstanceOf(PermissionError);
    expect(recordRow(ID.BATTERY.recallVehicle).ddrFlags).toEqual([]);
  });

  it("lets P6 dismiss with a reason — the row stays, marked, and no flag moves", async () => {
    await expect(
      dismissRecallMatchFor(
        PLATFORM_ADMIN,
        {
          recordId: ID.BATTERY.recallVehicle,
          matchId: ID.RECALL_MATCH.vehicle,
          reason: "   ",
        },
        NOW,
        NO_ATTRIBUTION,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    await dismissRecallMatchFor(
      PLATFORM_ADMIN,
      {
        recordId: ID.BATTERY.recallVehicle,
        matchId: ID.RECALL_MATCH.vehicle,
        reason: "The VIN places this pack in a 2021 build.",
      },
      NOW,
      NO_ATTRIBUTION,
    );
    const [row] = matchesOf(ID.BATTERY.recallVehicle);
    expect(row).toMatchObject({
      status: "dismissed",
      dismissedReason: "The VIN places this pack in a 2021 build.",
      dismissedBy: ID.USER.platformAdmin,
    });
    expect(recordRow(ID.BATTERY.recallVehicle).ddrFlags).toEqual([]);
  });

  it("lets P1 record a recall by hand, confirmed at once, and refuses it twice", async () => {
    const input = {
      recordId: ID.BATTERY.recallVehicle,
      source: "manufacturer_notice" as const,
      reference: "NV-SN-2026-031",
      title: "Northvale NV-TP400 module notice",
    };
    await recordRecallFor(HANDLER, input, NOW, NO_ATTRIBUTION);
    expect(recordRow(ID.BATTERY.recallVehicle).ddrFlags).toEqual(["recalled"]);
    expect(audits("recall_match.recorded")).toHaveLength(1);
    await expect(
      recordRecallFor(HANDLER, input, LATER, NO_ATTRIBUTION),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("withdraws: recalled clears only with no confirmed recall left, and the record is never moved (Rule 10.16)", async () => {
    const before = recordRow(ID.BATTERY.recalledQuarantined);
    await dismissRecallMatchFor(
      HANDLER,
      {
        recordId: ID.BATTERY.recalledQuarantined,
        matchId: ID.RECALL_MATCH.recordedByHand,
        reason: "Halden withdrew the notice for this serial range.",
      },
      NOW,
      NO_ATTRIBUTION,
    );
    const after = recordRow(ID.BATTERY.recalledQuarantined);
    expect(after.ddrFlags).toEqual([]);
    expect(after.isAirTransportProhibited).toBe(false);
    expect(after.containerId).toBe(before.containerId);
    // Both halves stay visible.
    expect(matchesOf(ID.BATTERY.recalledQuarantined)[0]).toMatchObject({
      status: "dismissed",
      confirmedBy: ID.USER.danaHandler,
      dismissedBy: ID.USER.danaHandler,
    });
  });

  it("keeps air closed when damage remains after a withdrawal (Rule 6.24)", async () => {
    const decided = await recordRecallFor(
      HANDLER,
      {
        recordId: ID.BATTERY.ddrLithiumOnMixed,
        source: "manual_entry",
        reference: "Shop bulletin 77",
        title: null,
      },
      NOW,
      NO_ATTRIBUTION,
    );
    await dismissRecallMatchFor(
      HANDLER,
      {
        recordId: ID.BATTERY.ddrLithiumOnMixed,
        matchId: decided.match.id,
        reason: "Entered against the wrong record.",
      },
      LATER,
      NO_ATTRIBUTION,
    );
    const record = recordRow(ID.BATTERY.ddrLithiumOnMixed);
    expect(record.ddrFlags).toEqual(["damaged"]);
    expect(record.isAirTransportProhibited).toBe(true);
  });
});

describe("Rule 6.14 — an open air shipment, for recall and damage both", () => {
  function airShipment() {
    const shipment = mockStore()
      .shipments.all()
      .find((row) => row.id === ID.SHIPMENT.airIssued);
    const paper = mockStore()
      .documentRenders.all()
      .find((row) => row.id === ID.DOCUMENT_RENDER.airShippingPaper);
    return { shipment, paper };
  }

  it("voids the issued paper, returns the shipment to draft, alerts P1 and P2, and refuses departure — on a confirmed recall", async () => {
    const decided = await confirmRecallMatchFor(
      HANDLER,
      {
        recordId: ID.BATTERY.airShipmentRecall,
        matchId: ID.RECALL_MATCH.airShipment,
      },
      NOW,
      NO_ATTRIBUTION,
    );
    expect(decided.airShipments).toEqual([
      {
        shipmentId: ID.SHIPMENT.airIssued,
        shipmentNumber: "SH-0004",
        paperVoided: true,
      },
    ]);
    const { shipment, paper } = airShipment();
    expect(shipment?.status).toBe("draft");
    expect(paper?.status).toBe("voided");
    expect(
      audits("document_render.voided", ID.DOCUMENT_RENDER.airShippingPaper)[0]
        ?.reason,
    ).toMatch(/^Rule 6\.14/);
    const alert = mockStore()
      .alerts.all()
      .find(
        (row) =>
          row.shipmentId === ID.SHIPMENT.airIssued && row.resolvedAt === null,
      );
    expect(alert?.alertType).toBe("ddr_quarantine");
    expect(alert?.audienceRoles).toEqual([
      "compliance_handler",
      "facility_manager",
    ]);
    // The record stays on the shipment until it is moved to quarantine.
    expect(recordRow(ID.BATTERY.airShipmentRecall).containerId).toBe(
      ID.CONTAINER.airShipmentSound,
    );
    await expect(
      departShipment(HANDLER, ID.SHIPMENT.airIssued, LATER, NO_ATTRIBUTION),
    ).rejects.toThrow();
  });

  it("does the same when damage is confirmed on the record", async () => {
    await recordDamageAssessmentFor(
      HANDLER,
      {
        recordId: ID.BATTERY.airShipmentRecall,
        findingTypes: ["swelling"],
        isDefective: false,
        reason: "Case bulging on the outbound dock.",
        clearingPhotoIntakePhotoId: null,
      },
      NOW,
    );
    const { shipment, paper } = airShipment();
    expect(shipment?.status).toBe("draft");
    expect(paper?.status).toBe("voided");
  });
});

describe("the nightly job (Rule 10.10; D-73 #6)", () => {
  it("checks every record in the named statuses as the job, and finds nothing new the second time", async () => {
    const job = { job: "recall-sync" as const, correlationId: "job-1" };
    const first = await runRecallSync(job, NOW);
    expect(first.checked).toBeGreaterThan(0);
    // Three more Ridgeline RM-24V50 packs carry no row yet: Cascade's BR-0002
    // and BR-0007, and Rainier's scooter — the job belongs to no tenant, and
    // each row lands in the organization that owns the record.
    expect(first.matched).toBe(3);
    const rainier = matchesOf(ID.BATTERY.rainierScooter);
    expect(rainier.map((row) => row.organizationId)).toEqual([ID.ORG.rainier]);
    const second = await runRecallSync(job, LATER);
    expect(second.matched).toBe(0);
    expect(
      audits("recall_check.completed").every(
        (row) => row.actorType === "scheduled_job" && row.actorUserId === null,
      ),
    ).toBe(true);
  });

  describe("POST /api/jobs/recall-sync", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    async function call(authorization?: string): Promise<Response> {
      const { POST } = await import("@/app/api/jobs/recall-sync/route");
      return POST(
        new Request("http://localhost/api/jobs/recall-sync", {
          method: "POST",
          headers: authorization === undefined ? {} : { authorization },
        }),
      );
    }

    it("refuses everyone while CRON_SECRET is unset, and a wrong or missing bearer", async () => {
      vi.stubEnv("CRON_SECRET", "");
      expect((await call("Bearer anything")).status).toBe(503);
      vi.stubEnv("CRON_SECRET", "recall-secret");
      expect((await call()).status).toBe(401);
      expect((await call("Bearer wrong")).status).toBe(401);
    });

    it("runs with the bearer and answers checked and matched", async () => {
      vi.stubEnv("CRON_SECRET", "recall-secret");
      const response = await call("Bearer recall-secret");
      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual(["checked", "matched"]);
    });
  });
});

describe("transport.ddr_packaging v2 (D-72 #9)", () => {
  it("prints the packing level with its citation on a packet issued today", async () => {
    verifyCascadeNumber();
    await changeShipmentContents(
      HANDLER,
      {
        shipmentId: ID.SHIPMENT.mixedDdr,
        containerIds: [ID.CONTAINER.mixedDdrQuarantine],
        lotIds: [],
        reason: null,
      },
      NOW,
      NO_ATTRIBUTION,
    );
    await generateContainerLabel(
      HANDLER,
      ID.CONTAINER.mixedDdrQuarantine,
      NOW,
      NO_ATTRIBUTION,
    );
    const issued = await generateShippingPaper(
      HANDLER,
      ID.SHIPMENT.mixedDdr,
      NOW,
      NO_ATTRIBUTION,
    );
    const render = issued.ddrPacketRender;
    if (render === null) throw new Error("no packet issued");
    const text = await pdfText(storedBytes(render.storageObjectPath));
    expect(text).toContain("Packing Group I performance level");
    expect(text).toContain("49 CFR 173.185(f)(3)");
    expect(text).not.toContain("The packing level is not on file.");
    expect(
      render.ruleVersionsApplied.map((row) => row.ruleVersionId),
    ).toContain(ID.RULE_VERSION.federalDdrPackaging2026v2);
    expect(mockAdapter.describe().name).toBe("mock");
  });
});
