import { describe, expect, it } from "vitest";

import { summarizeShipmentContents } from "@/domain/transport/contents-summary";
import { readStoredPaperHeader } from "@/domain/transport/stored-paper";

/**
 * Step 1's summary adds only what the rows carry and names every damaged
 * record; an issued paper's header is read back from its own stored input,
 * never from today's shipment (Rules 5.12, 5.14).
 */

describe("summarizeShipmentContents", () => {
  it("adds mass and energy exactly, flags a partial total, and names damaged records", () => {
    const summary = summarizeShipmentContents([
      {
        recordNumber: "BR-0002",
        chemistry: "lead_acid_sealed",
        massKg: "24.500",
        energyWh: "1200.000",
        damaged: false,
      },
      {
        recordNumber: "BR-0001",
        chemistry: "li_nmc",
        massKg: "480.000",
        energyWh: null,
        damaged: false,
      },
      {
        recordNumber: "BR-0003",
        chemistry: null,
        massKg: "0.310",
        energyWh: "59.280",
        damaged: true,
      },
    ]);
    expect(summary.recordCount).toBe(3);
    expect(summary.massKg).toBe("504.810");
    expect(summary.massComplete).toBe(true);
    expect(summary.energyWh).toBe("1259.280");
    expect(summary.energyComplete).toBe(false);
    expect(summary.damagedRecordNumbers).toEqual(["BR-0003"]);
    // T-01 order, and an unconfirmed chemistry says so.
    expect(summary.chemistries).toEqual([
      "Lithium-ion — NMC",
      "Lead-acid — sealed",
      "Chemistry not confirmed",
    ]);
  });

  it("is empty for nothing chosen", () => {
    expect(summarizeShipmentContents([])).toMatchObject({
      recordCount: 0,
      massKg: "0",
      massComplete: true,
      damagedRecordNumbers: [],
    });
  });
});

describe("readStoredPaperHeader", () => {
  const address = {
    line1: "77 Terminal Road",
    line2: null,
    city: "Moses Lake",
    region: "WA",
    postalCode: "98837",
    country: "US",
  };

  it("reads the header a paper was issued with", () => {
    expect(
      readStoredPaperHeader({
        shipmentNumber: "SH-0009",
        transportMode: "ground",
        origin: address,
        destination: {
          facilityName: "Basin",
          address,
          identifier: null,
        },
        carrier: { name: "Coleridge Hauling", identifier: null },
        manifestObligation: { required: false, recordNumbers: [] },
        ddrRecordNumbers: [],
      }),
    ).toMatchObject({
      shipmentNumber: "SH-0009",
      transportMode: "ground",
      destination: { facilityName: "Basin" },
      carrier: { name: "Coleridge Hauling" },
    });
  });

  it("reads null for a snapshot it does not recognise — a render from before this unit", () => {
    expect(
      readStoredPaperHeader({ shipmentNumber: "SH-0001", lineCount: 1 }),
    ).toBeNull();
    expect(
      readStoredPaperHeader({
        shipmentNumber: "SH-0009",
        transportMode: "teleport",
        origin: address,
        destination: { facilityName: "Basin", address, identifier: null },
        carrier: { name: "C", identifier: null },
        manifestObligation: { required: false, recordNumbers: [] },
        ddrRecordNumbers: [],
      }),
    ).toBeNull();
  });
});
