import { describe, expect, it } from "vitest";

import {
  rematchCandidates,
  sameIdentifyingFields,
  type RematchRecord,
} from "@/domain/catalog/rematch";

/**
 * Which records an approved entry raises — Flow F step 4; EC-10, EC-13.
 * The rule decides who is asked and changes nothing; each case is proven in
 * both directions.
 */

const ENTRY = {
  manufacturerName: "Kestrel Power",
  modelName: "KP-48V30-LFP",
  partNumber: null,
};

function record(patch: Partial<RematchRecord> = {}): RematchRecord {
  return {
    id: "br-1",
    status: "classified",
    catalogEntryId: null,
    manufacturerName: "Kestrel Power",
    modelName: "KP-48V30-LFP",
    partNumber: "KP-48V30-LFP",
    ...patch,
  };
}

describe("sameIdentifyingFields", () => {
  it("matches the manufacturer and the model, whatever the separators and case", () => {
    expect(
      sameIdentifyingFields(
        record({ manufacturerName: "KESTREL power", modelName: "kp48v30lfp" }),
        ENTRY,
      ),
    ).toEqual(["manufacturer", "model"]);
  });

  it("matches a record's part number against the entry's model", () => {
    expect(
      sameIdentifyingFields(
        record({ modelName: null, partNumber: "KP 48V30 LFP" }),
        ENTRY,
      ),
    ).toEqual(["manufacturer", "part_number"]);
  });

  it("refuses a different manufacturer with the same model", () => {
    expect(
      sameIdentifyingFields(record({ manufacturerName: "Other Co" }), ENTRY),
    ).toBeNull();
  });

  it("refuses the manufacturer alone — the product must agree too", () => {
    expect(
      sameIdentifyingFields(
        record({ modelName: "KP-24V10", partNumber: null }),
        ENTRY,
      ),
    ).toBeNull();
  });

  it("refuses a record with no manufacturer, and never matches on a near miss", () => {
    expect(
      sameIdentifyingFields(record({ manufacturerName: null }), ENTRY),
    ).toBeNull();
    expect(
      sameIdentifyingFields(
        record({ modelName: "KP-48V30-LF", partNumber: null }),
        ENTRY,
      ),
    ).toBeNull();
  });
});

describe("rematchCandidates — committed, unmatched, the same product", () => {
  it("raises a committed record committed unmatched against the same fields", () => {
    expect(rematchCandidates([record()], ENTRY)).toEqual([
      { recordId: "br-1", matchedOn: ["manufacturer", "model"] },
    ]);
  });

  it("raises records in storage and in quarantine too", () => {
    expect(
      rematchCandidates(
        [
          record({ id: "a", status: "stored" }),
          record({ id: "b", status: "quarantined" }),
          record({ id: "c", status: "confirmed" }),
        ],
        ENTRY,
      ).map((candidate) => candidate.recordId),
    ).toEqual(["a", "b", "c"]);
  });

  it("never raises a record that already carries a catalog entry", () => {
    expect(
      rematchCandidates([record({ catalogEntryId: "entry-0" })], ENTRY),
    ).toEqual([]);
  });

  it("never raises an intake still in progress, a voided record or one past storage", () => {
    for (const status of [
      "draft",
      "pending_review",
      "voided",
      "staged",
      "shipped",
      "closed",
    ] as const) {
      expect(rematchCandidates([record({ status })], ENTRY)).toEqual([]);
    }
  });
});
