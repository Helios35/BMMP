import { describe, expect, it } from "vitest";

import {
  admitContainerToShipment,
  type ShipmentAdmissionTarget,
  type ShipmentContainerFacts,
} from "@/domain/transport/container-admission";

/**
 * Step 1's refusals — Rules 4.19, 4.22, 5.2, 5.24, 5.25, 6.1, 6.13; T-23.
 * Blocked at assembly, each with its reason, never detected afterwards.
 */

const SITE = {
  siteTimeZone: "America/Los_Angeles",
  siteAddress: null,
} as const;

function container(
  overrides: Partial<ShipmentContainerFacts> = {},
): ShipmentContainerFacts {
  return {
    id: "c-1",
    organizationId: "org-1",
    containerCode: "C-0009",
    status: "open",
    containerType: "light_category_sound",
    ...SITE,
    labelFlags: { noCurrentLabel: false, mislabelled: null },
    contents: [
      {
        recordId: "r-1",
        recordNumber: "BR-0101",
        ddrFlags: [],
        isAirTransportProhibited: false,
        hasDamageAssessment: true,
      },
    ],
    onOtherOpenShipment: null,
    ...overrides,
  };
}

const TARGET: ShipmentAdmissionTarget = {
  organizationId: "org-1",
  transportMode: null,
  origin: null,
};

function reasonOf(
  facts: ShipmentContainerFacts,
  target: ShipmentAdmissionTarget = TARGET,
) {
  const admission = admitContainerToShipment(facts, target);
  return admission.ok ? "ok" : admission.reason;
}

describe("admitContainerToShipment", () => {
  it("admits a labelled, assessed container with contents", () => {
    expect(reasonOf(container())).toBe("ok");
    expect(reasonOf(container({ status: "closed" }))).toBe("ok");
    expect(reasonOf(container({ status: "overdue" }))).toBe("ok");
  });

  it("refuses another organization's container (Rule 5.24)", () => {
    expect(reasonOf(container({ organizationId: "org-2" }))).toBe(
      "other_organization",
    );
  });

  it("refuses an unlabeled or mislabeled container, with the rule (D-57; Rules 4.19, 4.22)", () => {
    const unlabelled = admitContainerToShipment(
      container({ labelFlags: { noCurrentLabel: true, mislabelled: null } }),
      TARGET,
    );
    expect(unlabelled).toMatchObject({ ok: false, reason: "no_current_label" });
    if (!unlabelled.ok) expect(unlabelled.message).toContain("Rule 4.22");

    const mislabelled = admitContainerToShipment(
      container({
        labelFlags: {
          noCurrentLabel: false,
          mislabelled: {
            printed: "2026-07-28T13:05:00.000Z",
            current: "2026-06-01T00:00:00.000Z",
          },
        },
      }),
      TARGET,
    );
    expect(mislabelled).toMatchObject({ ok: false, reason: "mislabelled" });
    if (!mislabelled.ok) expect(mislabelled.message).toContain("Rule 4.19");
  });

  it("refuses a record already on another open shipment, naming it (Rule 5.25)", () => {
    const admission = admitContainerToShipment(
      container({ onOtherOpenShipment: { shipmentNumber: "SH-0007" } }),
      TARGET,
    );
    expect(admission).toMatchObject({ ok: false, reason: "on_other_shipment" });
    if (!admission.ok) expect(admission.message).toContain("SH-0007");
  });

  it("refuses an empty container, a shipped or retired one, and one awaiting determination (T-23)", () => {
    expect(reasonOf(container({ contents: [] }))).toBe("empty");
    expect(reasonOf(container({ status: "shipped" }))).toBe(
      "not_shippable_status",
    );
    expect(reasonOf(container({ status: "retired" }))).toBe(
      "not_shippable_status",
    );
    expect(reasonOf(container({ containerType: "light_category_hold" }))).toBe(
      "determination_pending",
    );
  });

  it("refuses a record with no damage assessment (Rule 6.1)", () => {
    const admission = admitContainerToShipment(
      container({
        contents: [
          {
            recordId: "r-2",
            recordNumber: "BR-0102",
            ddrFlags: [],
            isAirTransportProhibited: false,
            hasDamageAssessment: false,
          },
        ],
      }),
      TARGET,
    );
    expect(admission).toMatchObject({
      ok: false,
      reason: "no_damage_assessment",
    });
    if (!admission.ok) expect(admission.message).toContain("BR-0102");
  });

  it("refuses a second site (Rule 5.2)", () => {
    expect(
      reasonOf(container(), {
        ...TARGET,
        origin: { siteTimeZone: "America/New_York", siteAddress: null },
      }),
    ).toBe("different_site");
  });

  it("refuses a damaged record onto an air shipment at assembly (Rule 6.13), and admits it by ground", () => {
    const damaged = container({
      containerType: "light_category_ddr",
      contents: [
        {
          recordId: "r-3",
          recordNumber: "BR-0103",
          ddrFlags: ["damaged"],
          isAirTransportProhibited: true,
          hasDamageAssessment: true,
        },
      ],
    });
    const air = admitContainerToShipment(damaged, {
      ...TARGET,
      transportMode: "air",
    });
    expect(air).toMatchObject({ ok: false, reason: "damaged_onto_air" });
    if (!air.ok) expect(air.message).toContain("BR-0103");
    expect(reasonOf(damaged, { ...TARGET, transportMode: "ground" })).toBe(
      "ok",
    );
  });
});
