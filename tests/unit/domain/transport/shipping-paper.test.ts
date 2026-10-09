import { describe, expect, it } from "vitest";

import { buildBasicDescription } from "@/domain/transport/basic-description";
import {
  buildShippingPaperPayload,
  preDocumentStatus,
  SHIPPING_PAPER_PRECONDITIONS,
  type ShippingPaperBuildInput,
  type ShippingPaperPrecondition,
  type ShippingPaperRecordInput,
} from "@/domain/transport/shipping-paper";
import { readBasicDescriptionRule } from "@/domain/transport/rule-data";

import {
  BASIC_DESCRIPTION,
  resolvedRule,
  SHIPPER_CERTIFICATION,
} from "./rule-fixtures";

/**
 * `buildShippingPaperPayload` — Rules 5.3–5.9, 5.28; D-32, D-36.
 *
 * **Every Rule 5.3 precondition is named when unmet**, one at a time against a
 * build that is otherwise complete — the reviewer's "break one precondition at
 * a time" — and a complete build is the only one with a payload.
 */

const AT = "2026-10-09T17:00:00.000Z";

const ADDRESS = {
  line1: "1420 Industrial Way SW",
  line2: null,
  city: "Tumwater",
  region: "WA",
  postalCode: "98512",
  country: "US",
};

function record(
  overrides: Partial<ShippingPaperRecordInput> = {},
): ShippingPaperRecordInput {
  return {
    recordId: "r-1",
    recordNumber: "BR-0101",
    containerId: "c-1",
    containerCode: "C-0009",
    status: "stored",
    chemistryConfirmed: true,
    batteryMassKg: "480.000",
    ddrFlags: [],
    isAirTransportProhibited: false,
    currentFindings: ["none_observed"],
    conditionCitation: null,
    shippingIdentity: {
      catalogEntryTitle: "Northvale NV-TP400",
      unIdentifier: "un3480",
      properShippingName: "Lithium ion batteries",
      hazardClass: "9",
      packingGroup: "not_applicable",
    },
    classification: {
      status: "active",
      wasteClassification: "light_category",
      reasoning: "Light category — test reasoning.",
    },
    ...overrides,
  };
}

function complete(
  overrides: Partial<ShippingPaperBuildInput> = {},
): ShippingPaperBuildInput {
  return {
    shipment: {
      shipmentNumber: "SH-0009",
      transportMode: "ground",
      originAddress: ADDRESS,
      destinationFacilityName: "Basin Materials Recovery",
      destinationAddress: { ...ADDRESS, city: "Moses Lake" },
      destinationIdentifier: null,
      carrierName: "Coleridge Hauling",
      transporterIdentifier: null,
    },
    containers: [
      {
        id: "c-1",
        containerCode: "C-0009",
        labelFlags: { noCurrentLabel: false, mislabelled: null },
      },
    ],
    records: [record()],
    emergencyContact: {
      phone: "+1-800-555-0100",
      contractRef: "ERI-TEST-1",
      verifiedAt: "2026-09-01T00:00:00.000Z",
      verifiedBy: "user-1",
      reverificationIntervalMonths: 12,
    },
    rules: {
      basicDescription: BASIC_DESCRIPTION,
      shipperCertification: SHIPPER_CERTIFICATION,
      packagingException: null,
    },
    at: AT,
    ...overrides,
  };
}

function unmetOf(input: ShippingPaperBuildInput) {
  return buildShippingPaperPayload(input).checklist.unmet;
}

function findingsOf(
  input: ShippingPaperBuildInput,
  id: ShippingPaperPrecondition,
): readonly string[] {
  const item = buildShippingPaperPayload(input).checklist.items.find(
    (entry) => entry.id === id,
  );
  if (item === undefined) throw new Error(`no ${id} item`);
  return item.findings;
}

describe("a complete build", () => {
  it("lists every precondition, all met, and returns the payload as a RuleOutcome", () => {
    const build = buildShippingPaperPayload(complete());
    expect(build.checklist.items.map((item) => item.id)).toEqual([
      ...SHIPPING_PAPER_PRECONDITIONS,
    ]);
    expect(build.checklist.isComplete).toBe(true);
    expect(preDocumentStatus(build.checklist)).toBe("ready");
    expect(build.kind).toBe("complete");
    if (build.kind !== "complete") return;

    const payload = build.outcome.result;
    expect(payload.lines).toHaveLength(1);
    expect(payload.lines[0]).toMatchObject({
      unIdentifier: "un3480",
      basicDescription: "UN3480, Lithium ion batteries, 9",
      totalMassKg: "480.000",
      totalQuantityDescription: "480.000 kg",
      numberAndTypeOfPackages: "1 container (C-0009)",
    });
    expect(payload.emergencyResponse.phone).toBe("+1-800-555-0100");
    expect(payload.shipperCertification).toBe(
      SHIPPER_CERTIFICATION.version.payload.statement,
    );
    // Rule 5.20 — never assumed.
    expect(payload.packagingException).toMatchObject({
      exceptions: ["none"],
      basis: "no_rule_on_file",
    });
    expect(build.outcome.ruleVersionsApplied.map((v) => v.ruleKey)).toEqual([
      "transport.basic_description",
      "transport.shipper_certification",
    ]);
  });

  it("is the same output the checklist reads: the draft's lines are the payload's lines", () => {
    const build = buildShippingPaperPayload(complete());
    if (build.kind !== "complete") throw new Error("expected complete");
    expect(build.draft.lines).toEqual(build.outcome.result.lines);
  });

  it("groups records by identity into lines, and sums each line's mass exactly", () => {
    const build = buildShippingPaperPayload(
      complete({
        containers: [
          {
            id: "c-1",
            containerCode: "C-0009",
            labelFlags: { noCurrentLabel: false, mislabelled: null },
          },
          {
            id: "c-2",
            containerCode: "C-0010",
            labelFlags: { noCurrentLabel: false, mislabelled: null },
          },
        ],
        records: [
          record(),
          record({
            recordId: "r-2",
            recordNumber: "BR-0102",
            containerId: "c-2",
            containerCode: "C-0010",
            batteryMassKg: "0.1",
          }),
          record({
            recordId: "r-3",
            recordNumber: "BR-0103",
            batteryMassKg: "0.310",
            shippingIdentity: {
              catalogEntryTitle: "Halden HM-L58",
              unIdentifier: "un3481",
              properShippingName:
                "Lithium ion batteries contained in equipment",
              hazardClass: "9",
              packingGroup: "ii",
            },
          }),
        ],
      }),
    );
    if (build.kind !== "complete") throw new Error("expected complete");
    const [first, second] = build.outcome.result.lines;
    expect(first?.records.map((r) => r.recordNumber)).toEqual([
      "BR-0101",
      "BR-0102",
    ]);
    expect(first?.totalMassKg).toBe("480.100");
    expect(first?.numberAndTypeOfPackages).toBe(
      "2 containers (C-0009, C-0010)",
    );
    expect(second?.basicDescription).toBe(
      "UN3481, Lithium ion batteries contained in equipment, 9, Packing Group II",
    );
  });
});

describe("every Rule 5.3 precondition is named when it is the one unmet", () => {
  it("an unconfirmed identification names the record", () => {
    const input = complete({
      records: [
        record({ status: "pending_review", chemistryConfirmed: false }),
      ],
    });
    expect(unmetOf(input)).toEqual(["identification"]);
    expect(findingsOf(input, "identification")[0]).toContain("BR-0101");
  });

  it("a record with no active classification names the record and its decision's state", () => {
    const blocked = complete({
      records: [
        record({
          classification: {
            status: "blocked",
            wasteClassification: "undetermined",
            reasoning: "Chemistry has not been human-confirmed.",
          },
        }),
      ],
    });
    expect(unmetOf(blocked)).toEqual(["classification"]);
    expect(findingsOf(blocked, "classification")[0]).toContain("Blocked");

    expect(
      unmetOf(complete({ records: [record({ classification: null })] })),
    ).toEqual(["classification"]);
    // EC-42 — documentation waits for a settling classification.
    expect(
      unmetOf(complete({ records: [record({ status: "reclassifying" })] })),
    ).toEqual(["classification"]);
  });

  it("a damaged record against air is a mode conflict naming the record and indicator", () => {
    const input = complete({
      shipment: { ...complete().shipment, transportMode: "air" },
      records: [
        record({
          ddrFlags: ["damaged"],
          isAirTransportProhibited: true,
          currentFindings: ["swelling"],
        }),
      ],
    });
    expect(unmetOf(input)).toEqual(["transport_mode"]);
    expect(findingsOf(input, "transport_mode")[0]).toMatch(/BR-0101.*Swelling/);
    // By ground the same record documents (with its DDR path stated).
    const ground = buildShippingPaperPayload(
      complete({ records: input.records }),
    );
    expect(ground.checklist.isComplete).toBe(true);
    expect(ground.draft.ddrRecordNumbers).toEqual(["BR-0101"]);
  });

  it.each([
    ["missing", { phone: null }],
    ["never verified", { verifiedAt: null }],
    ["lapsed", { verifiedAt: "2025-03-14T17:40:00.000Z" }],
    ["interval unknown", { reverificationIntervalMonths: null }],
  ])(
    "a %s 24-hour number blocks with one sentence, and names who can fix it (Rules 5.6, 5.7; D-32)",
    (_label, change) => {
      const input = complete({
        emergencyContact: { ...complete().emergencyContact, ...change },
      });
      const build = buildShippingPaperPayload(input);
      expect(build.checklist.unmet).toEqual(["emergency_contact"]);
      const item = build.checklist.items.find(
        (entry) => entry.id === "emergency_contact",
      );
      expect(item?.whoCanFix).toEqual(["facility_manager", "platform_admin"]);
      expect(item?.findings).toEqual([
        "This organization has no verified 24-hour emergency contact number on file. A number that is missing, unverified or past its re-verification date never goes on a shipping paper, and is never replaced with a placeholder.",
      ]);
      // Never on the draft either — and never a placeholder.
      expect(build.draft.emergencyResponse.phone).toBeNull();
    },
  );

  it("missing destination or carrier details are each named", () => {
    const input = complete({
      shipment: {
        ...complete().shipment,
        destinationFacilityName: " ",
        carrierName: null,
      },
    });
    expect(unmetOf(input)).toEqual(["destination_and_carrier"]);
    expect(findingsOf(input, "destination_and_carrier")).toEqual([
      "The destination facility is not recorded.",
      "The carrier is not recorded.",
    ]);
  });

  it("missing shipping identifiers name the record and each missing identifier (Rule 5.9; EC-46)", () => {
    const input = complete({
      records: [
        record({
          shippingIdentity: {
            catalogEntryTitle: "Ridgeline RM-24V50",
            unIdentifier: null,
            properShippingName: null,
            hazardClass: "8",
            packingGroup: "not_applicable",
          },
        }),
      ],
    });
    expect(unmetOf(input)).toEqual(["shipping_identifiers"]);
    expect(findingsOf(input, "shipping_identifiers")[0]).toContain(
      "BR-0101's catalog entry (Ridgeline RM-24V50) has no identification number, proper shipping name.",
    );

    const unmatched = complete({
      records: [record({ shippingIdentity: null })],
    });
    expect(findingsOf(unmatched, "shipping_identifiers")[0]).toContain(
      "never guessed",
    );
    // `not_assigned` is no identifier (T-17).
    const unassigned = complete({
      records: [
        record({
          shippingIdentity: {
            ...record().shippingIdentity!,
            unIdentifier: "not_assigned",
          },
        }),
      ],
    });
    expect(unmetOf(unassigned)).toEqual(["shipping_identifiers"]);
  });

  it("an unlabeled or mislabeled container is named", () => {
    const input = complete({
      containers: [
        {
          id: "c-1",
          containerCode: "C-0009",
          labelFlags: { noCurrentLabel: true, mislabelled: null },
        },
      ],
    });
    expect(unmetOf(input)).toEqual(["container_labels"]);
    expect(findingsOf(input, "container_labels")[0]).toContain("C-0009");
  });

  it("missing rule data is named by key, and no certification text is ever supplied by code", () => {
    const input = complete({
      rules: {
        basicDescription: BASIC_DESCRIPTION,
        shipperCertification: null,
        packagingException: null,
      },
    });
    const build = buildShippingPaperPayload(input);
    expect(build.checklist.unmet).toEqual(["rule_data"]);
    expect(build.draft.shipperCertification).toBeNull();
    expect(findingsOf(input, "rule_data")[0]).toContain(
      "transport.shipper_certification",
    );

    const unreadable = complete({
      rules: {
        basicDescription: resolvedRule({
          ruleKey: "transport.basic_description",
          payloadSchemaKey: "transport.basic_description.v2",
          payload: {},
        }),
        shipperCertification: SHIPPER_CERTIFICATION,
        packagingException: null,
      },
    });
    expect(findingsOf(unreadable, "rule_data")[0]).toContain(
      "not in a form this version can read",
    );
  });

  it("an unknown mass is named, and no total is stated for it", () => {
    const input = complete({ records: [record({ batteryMassKg: null })] });
    const build = buildShippingPaperPayload(input);
    expect(build.checklist.unmet).toEqual(["quantity"]);
    expect(build.draft.lines[0]?.totalQuantityDescription).toBeNull();
  });

  it("an empty shipment is named", () => {
    expect(unmetOf(complete({ records: [], containers: [] }))).toEqual([
      "contents",
    ]);
  });

  it("an incomplete build has no payload — only the draft, which is never a document (Rule 5.28)", () => {
    const build = buildShippingPaperPayload(
      complete({ records: [record({ classification: null })] }),
    );
    expect(build.kind).toBe("incomplete");
    expect("outcome" in build).toBe(false);
    expect(preDocumentStatus(build.checklist)).toBe("draft");
  });
});

describe("D-36 — a fully-regulated line", () => {
  it("is documented in full and the manifest obligation is stated", () => {
    const build = buildShippingPaperPayload(
      complete({
        records: [
          record({
            classification: {
              status: "active",
              wasteClassification: "fully_regulated",
              reasoning: "Fully regulated — test reasoning.",
            },
          }),
        ],
      }),
    );
    if (build.kind !== "complete") throw new Error("expected complete");
    expect(build.outcome.result.manifestObligation).toEqual({
      required: true,
      recordNumbers: ["BR-0101"],
    });
    expect(build.outcome.reasoning).toContain("remains outstanding");
  });
});

describe("the basic description", () => {
  it("follows the rule version's sequence, not a fixed one", () => {
    const reversed = readBasicDescriptionRule(
      resolvedRule({
        ruleKey: "transport.basic_description",
        payloadSchemaKey: "transport.basic_description.v1",
        payload: {
          descriptionSequence: ["proper_shipping_name", "un_identifier"],
          requiresTwentyFourHourNumber: true,
        },
      }),
    );
    expect(reversed).not.toBeNull();
    expect(
      buildBasicDescription(
        {
          unIdentifier: "un3480",
          properShippingName: "Lithium ion batteries",
          hazardClass: "9",
          packingGroup: "not_applicable",
        },
        reversed?.sequence ?? [],
      ),
    ).toBe("Lithium ion batteries, UN3480");
  });

  it("refuses a payload naming a field it does not know, or repeating one", () => {
    for (const descriptionSequence of [
      ["un_identifier", "tunnel_code"],
      ["un_identifier", "un_identifier"],
      [],
    ]) {
      expect(
        readBasicDescriptionRule(
          resolvedRule({
            ruleKey: "transport.basic_description",
            payloadSchemaKey: "transport.basic_description.v1",
            payload: {
              descriptionSequence,
              requiresTwentyFourHourNumber: true,
            },
          }),
        ),
      ).toBeNull();
    }
  });
});
