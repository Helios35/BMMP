import { beforeEach, describe, expect, it } from "vitest";

import { mockAdapter, mockStore, resetMockStore } from "@/data/mock";
import * as ID from "@/data/mock/fixtures/ids";
import { lotStanding } from "@/domain/storage/lot";
import { generateContainerLabel } from "@/features/containers/server/label";
import {
  readDdrPacketBuild,
  readShippingPaperBuild,
} from "@/features/shipments/server/paper-build";
import { readShipment } from "@/features/shipments/server/read-shipment";
import {
  assembleShipment,
  changeShipmentContents,
  departShipment,
  generateShippingPaper,
} from "@/features/shipments/server/writes";
import { PermissionError, ValidationError } from "@/lib/errors";

import {
  AT,
  auditRows,
  ctx,
  HANDLER,
  LATER,
  MANAGER,
  newContainerHolding,
  NO_ATTRIBUTION,
  pdfText,
  storedBytes,
  transport,
  verifyCascadeNumber,
} from "./document-support";

/**
 * `b1a-08`'s lots and damaged/defective packet, against the fixtures it added
 * — T-25; Rules 4.23, 4.24, 5.1, 6.15, 6.16; D-71.
 */

const PLATFORM_ADMIN = ctx({
  userId: ID.USER.platformAdmin,
  role: "platform_admin",
  isPlatformAdmin: true,
});

beforeEach(() => {
  resetMockStore();
});

function lotRow(id: string) {
  const lot = mockStore()
    .lots.all()
    .find((row) => row.id === id);
  if (lot === undefined) throw new Error(`no lot ${id}`);
  return lot;
}

function containerRow(id: string) {
  const container = mockStore()
    .containers.all()
    .find((row) => row.id === id);
  if (container === undefined) throw new Error(`no container ${id}`);
  return container;
}

describe("a lot's life (T-25)", () => {
  it("opens with a container, audited, for P1 — never for P2", async () => {
    const container = await newContainerHolding(
      [ID.BATTERY.vehicleTraction],
      "Test bay — a new lot",
    );
    await expect(
      mockAdapter.lots.open(MANAGER, {
        description: null,
        containerId: container.id,
        at: AT,
        attribution: NO_ATTRIBUTION,
      }),
    ).rejects.toBeInstanceOf(PermissionError);

    const lot = await mockAdapter.lots.open(HANDLER, {
      description: "Test grouping",
      containerId: container.id,
      at: AT,
      attribution: NO_ATTRIBUTION,
    });
    expect(lot.status).toBe("open");
    expect(lot.lotCode).toMatch(/^L-\d{4}$/);
    expect(containerRow(container.id).lotId).toBe(lot.id);
    expect(auditRows("lot.created", lot.id)).toHaveLength(1);
    expect(auditRows("lot.membership_changed", lot.id)).toHaveLength(1);
    // The roll-up a trigger maintains under Postgres (ERD §6.2).
    expect(lot.totalMassKg).not.toBeNull();
  });

  it("closes, refuses a new member while closed, reopens, and dissolves keeping the row", async () => {
    const container = await newContainerHolding(
      [ID.BATTERY.vehicleTraction],
      "Test bay — dissolved",
    );
    const lot = await mockAdapter.lots.open(HANDLER, {
      description: null,
      containerId: container.id,
      at: AT,
      attribution: NO_ATTRIBUTION,
    });
    await mockAdapter.lots.changeStatus(HANDLER, {
      lotId: lot.id,
      status: "closed",
      at: AT,
      attribution: NO_ATTRIBUTION,
    });
    await expect(
      mockAdapter.lots.changeMembership(HANDLER, {
        lotId: lot.id,
        containerId: ID.CONTAINER.quarantineDrum,
        change: "join",
        at: AT,
        attribution: NO_ATTRIBUTION,
      }),
    ).rejects.toThrow(/only while it is open/);
    await mockAdapter.lots.changeStatus(HANDLER, {
      lotId: lot.id,
      status: "open",
      at: AT,
      attribution: NO_ATTRIBUTION,
    });
    const dissolved = await mockAdapter.lots.changeStatus(HANDLER, {
      lotId: lot.id,
      status: "dissolved",
      at: LATER,
      attribution: NO_ATTRIBUTION,
    });
    // Members return to their prior state; the row stays, for audit.
    expect(dissolved.status).toBe("dissolved");
    expect(containerRow(container.id).lotId).toBeNull();
    expect(lotRow(lot.id).status).toBe("dissolved");
    await expect(
      mockAdapter.lots.changeStatus(HANDLER, {
        lotId: lot.id,
        status: "open",
        at: LATER,
        attribution: NO_ATTRIBUTION,
      }),
    ).rejects.toThrow(/final/);
    expect(auditRows("lot.status_changed", lot.id)).toHaveLength(3);
  });

  it("refuses to close an empty lot", async () => {
    const lot = await mockAdapter.lots.open(HANDLER, {
      description: null,
      containerId: null,
      at: AT,
      attribution: NO_ATTRIBUTION,
    });
    await expect(
      mockAdapter.lots.changeStatus(HANDLER, {
        lotId: lot.id,
        status: "closed",
        at: AT,
        attribution: NO_ATTRIBUTION,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("Rule 4.24 — the fixture lot holding an overdue container", () => {
  it("L-0002 reads overdue through C-0004 and reports its earliest start; it has no clock of its own", () => {
    const members = mockStore()
      .containers.all()
      .filter((container) => container.lotId === ID.LOT.overdueHold);
    expect(members.map((member) => member.containerCode)).toEqual(["C-0004"]);
    const standing = lotStanding(
      members.map((member) => ({
        status: member.status,
        accumulationStartedAt: member.accumulationStartedAt,
      })),
    );
    expect(standing.isOverdue).toBe(true);
    expect(standing.earliestAccumulationStart).toBe(
      members[0]?.accumulationStartedAt,
    );
    expect(
      mockStore()
        .storageClocks.all()
        .some((clock) => clock.containerId === null),
    ).toBe(false);
  });
});

describe("a lot built and shipped (Rule 5.1)", () => {
  it("allocates on assembly, refuses its container alone, and ships on departure", async () => {
    verifyCascadeNumber();
    const container = await newContainerHolding(
      [ID.BATTERY.vehicleTraction],
      "Test bay — lot shipped",
    );
    await generateContainerLabel(HANDLER, container.id, AT, NO_ATTRIBUTION);
    const lot = await mockAdapter.lots.open(HANDLER, {
      description: "Shipped whole",
      containerId: container.id,
      at: AT,
      attribution: NO_ATTRIBUTION,
    });

    // An open lot does not ship (T-25: closed → allocated).
    await expect(
      assembleShipment(
        HANDLER,
        { containerIds: [], lotIds: [lot.id], transport: transport() },
        AT,
        NO_ATTRIBUTION,
      ),
    ).rejects.toThrow(/Close it before it ships/);

    await mockAdapter.lots.changeStatus(HANDLER, {
      lotId: lot.id,
      status: "closed",
      at: AT,
      attribution: NO_ATTRIBUTION,
    });
    // A closed lot's container ships only with its lot.
    await expect(
      assembleShipment(
        HANDLER,
        { containerIds: [container.id], transport: transport() },
        AT,
        NO_ATTRIBUTION,
      ),
    ).rejects.toThrow(/ships with its lot/);

    const shipment = await assembleShipment(
      HANDLER,
      { containerIds: [], lotIds: [lot.id], transport: transport() },
      AT,
      NO_ATTRIBUTION,
    );
    expect(lotRow(lot.id).status).toBe("allocated");
    expect(containerRow(container.id).shipmentId).toBe(shipment.id);

    await generateShippingPaper(HANDLER, shipment.id, AT, NO_ATTRIBUTION);
    await departShipment(HANDLER, shipment.id, LATER, NO_ATTRIBUTION);
    expect(lotRow(lot.id).status).toBe("shipped");
  });
});

describe("the fixture mixed shipment SH-0003 and its packet (Rules 5.1, 6.16; D-71)", () => {
  it("is built from a container and a lot, and names the no-rule record before any paper", async () => {
    const shipment = await mockAdapter.shipments.get(
      HANDLER,
      ID.SHIPMENT.mixedDdr,
    );
    if (shipment === null) throw new Error("no SH-0003");
    const detail = await readShipment(HANDLER, shipment);
    expect(
      detail.scope.map((entry) => entry.container.containerCode).sort(),
    ).toEqual(["C-0005", "C-0006"]);
    expect(
      detail.scope.find((entry) => entry.container.containerCode === "C-0006")
        ?.lot?.lotCode,
    ).toBe("L-0003");
    expect(detail.damaged).toEqual(["BR-0006", "BR-0007"]);
    // D-71 — stated as soon as it is knowable, before any paper exists.
    expect(detail.ddrPackagingGaps).toEqual(["BR-0007"]);

    const read = await readShippingPaperBuild(HANDLER, shipment, AT);
    const packet = await readDdrPacketBuild(HANDLER, read);
    if (packet.kind !== "packet") throw new Error(`packet ${packet.kind}`);
    const [lithium, noRule] = packet.outcome.result.records;
    expect(lithium?.recordNumber).toBe("BR-0006");
    expect(lithium?.marking).toEqual({
      text: "Damaged/defective lithium ion battery",
      citation: "49 CFR 173.185(f)(4)",
    });
    expect(noRule?.recordNumber).toBe("BR-0007");
    expect(noRule?.marking).toBeNull();
    expect(packet.outcome.ruleVersionsApplied[0]?.ruleKey).toBe(
      "transport.ddr_packaging",
    );
  });

  it("with the lot taken off, the lithium record issues its packet, prints the marking and 12 mm with their citations, and departs", async () => {
    verifyCascadeNumber();
    await changeShipmentContents(
      HANDLER,
      {
        shipmentId: ID.SHIPMENT.mixedDdr,
        containerIds: [ID.CONTAINER.mixedDdrQuarantine],
        lotIds: [],
        reason: null,
      },
      AT,
      NO_ATTRIBUTION,
    );
    // T-25 — the lot the shipment let go returns to closed.
    expect(lotRow(ID.LOT.mixedShipment).status).toBe("closed");
    expect(
      containerRow(ID.CONTAINER.noRuleDdrQuarantine).shipmentId,
    ).toBeNull();

    await generateContainerLabel(
      HANDLER,
      ID.CONTAINER.mixedDdrQuarantine,
      AT,
      NO_ATTRIBUTION,
    );
    const issued = await generateShippingPaper(
      HANDLER,
      ID.SHIPMENT.mixedDdr,
      AT,
      NO_ATTRIBUTION,
    );
    const render = issued.ddrPacketRender;
    if (render === null) throw new Error("no packet issued");
    const text = await pdfText(storedBytes(render.storageObjectPath));
    for (const printed of [
      "Damaged/defective lithium ion battery",
      "49 CFR 173.185(f)(4)",
      "12 mm (0.47 in)",
      "49 CFR 173.185(f)(1)",
      "The packing level is not on file.",
      "Forbidden",
    ]) {
      expect(text).toContain(printed);
    }
    expect(text).not.toMatch(/probab|likelihood|percent/i);

    const departed = await departShipment(
      HANDLER,
      ID.SHIPMENT.mixedDdr,
      LATER,
      NO_ATTRIBUTION,
    );
    expect(departed.shipment.status).toBe("dispatched");
  });

  it("refuses air for the DDR shipment, for every role including P6 (Rules 6.7, 6.8)", async () => {
    await expect(
      assembleShipment(
        PLATFORM_ADMIN,
        {
          containerIds: [ID.CONTAINER.quarantineDrum],
          transport: transport({ transportMode: "air" }),
        },
        AT,
        NO_ATTRIBUTION,
      ),
    ).rejects.toThrow(/Air transport is not available/);
  });
});
