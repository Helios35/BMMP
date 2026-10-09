import { describe, expect, it } from "vitest";

import {
  buildShippingPaperDocumentPayload,
  buildShippingPaperDraftPayload,
} from "@/domain/documents/build-shipping-paper-payload";
import {
  documentIdentity,
  DRAFT_WATERMARK,
  printedInstant,
} from "@/domain/documents/document-identity";
import { ruleOutcome, type RuleOutcome } from "@/domain/rules/outcome";
import {
  buildShippingPaperPayload,
  type ShippingPaperBuildInput,
  type ShippingPaperPayload,
} from "@/domain/transport/shipping-paper";
import { readStoredPaperHeader } from "@/domain/transport/stored-paper";

import {
  BASIC_DESCRIPTION,
  SHIPPER_CERTIFICATION,
} from "../transport/rule-fixtures";

/**
 * The shipping paper's render payload — `TECHNICAL_SPEC.md` §8.1: **the
 * domain builder fails before a renderer is invoked** when a required field
 * is missing, the 24-hour number above all (Rule 5.7); and a draft is never
 * an issued paper (Rule 5.28).
 */

const AT = "2026-10-09T17:00:00.000Z";
const ZONE = "America/Los_Angeles";
const ADDRESS = {
  line1: "1420 Industrial Way SW",
  line2: null,
  city: "Tumwater",
  region: "WA",
  postalCode: "98512",
  country: "US",
};

function buildInput(): ShippingPaperBuildInput {
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
    records: [
      {
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
      },
    ],
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
  };
}

function completeOutcome(): RuleOutcome<ShippingPaperPayload> {
  const build = buildShippingPaperPayload(buildInput());
  if (build.kind !== "complete") throw new Error("expected a complete build");
  return build.outcome;
}

function identity(status: "issued" | "draft") {
  return documentIdentity({
    documentRenderId: "render-1",
    documentType: "shipping_paper",
    status,
    templateKey: "shipping_paper",
    templateVersion: "1",
    renderedAt: AT,
    timeZone: ZONE,
    producer: "test producer",
    draftNotice: "A draft is never a document.",
  });
}

/** The outcome with one field of the payload replaced — a defect upstream. */
function withPayload(
  patch: Partial<ShippingPaperPayload>,
): RuleOutcome<ShippingPaperPayload> {
  const outcome = completeOutcome();
  return ruleOutcome({
    result: { ...outcome.result, ...patch },
    reasoning: outcome.reasoning,
    ruleVersionsApplied: outcome.ruleVersionsApplied,
    inputsSnapshot: outcome.inputsSnapshot,
  });
}

describe("the issued paper's payload", () => {
  it("keeps the transport payload at the top level, with the shipper and the render's identity beside it", () => {
    const outcome = completeOutcome();
    const build = buildShippingPaperDocumentPayload({
      paper: outcome,
      shipperName: "Cascade Auto Recyclers LLC",
      document: identity("issued"),
    });
    expect(build.ok).toBe(true);
    if (!build.ok) return;
    const payload = build.outcome.result;
    expect(payload).toMatchObject(outcome.result);
    expect(payload.shipper).toEqual({ name: "Cascade Auto Recyclers LLC" });
    expect(payload.transportModeLabel).toBe("Ground");
    expect(payload.document).toMatchObject({
      documentRenderId: "render-1",
      status: "issued",
      watermark: null,
      draftNotice: null,
      renderedAtText: printedInstant(AT, ZONE),
    });
    // Every reader of a stored paper reads an issued render as before.
    expect(readStoredPaperHeader(payload)).not.toBeNull();
    expect(build.outcome.ruleVersionsApplied).toEqual(
      outcome.ruleVersionsApplied,
    );
  });

  it("refuses a payload with no 24-hour number, by name — never a placeholder (Rule 5.7)", () => {
    const outcome = completeOutcome();
    const build = buildShippingPaperDocumentPayload({
      paper: withPayload({
        emergencyResponse: { ...outcome.result.emergencyResponse, phone: " " },
      }),
      shipperName: "Cascade Auto Recyclers LLC",
      document: identity("issued"),
    });
    expect(build).toEqual({
      ok: false,
      missing: ["emergency_response_phone"],
    });
  });

  it("refuses a payload with no certification, no emergency reference or no line", () => {
    const outcome = completeOutcome();
    const build = buildShippingPaperDocumentPayload({
      paper: withPayload({
        shipperCertification: "",
        emergencyResponse: {
          ...outcome.result.emergencyResponse,
          contractRef: "",
        },
        lines: [],
      }),
      shipperName: "Cascade Auto Recyclers LLC",
      document: identity("issued"),
    });
    expect(build.ok).toBe(false);
    if (build.ok) return;
    expect(build.missing).toEqual([
      "emergency_response_contract_ref",
      "shipper_certification_text",
      "lines",
    ]);
  });

  it("refuses a draft identity — a draft is never an issued paper (Rule 5.28)", () => {
    const build = buildShippingPaperDocumentPayload({
      paper: completeOutcome(),
      shipperName: "Cascade Auto Recyclers LLC",
      document: identity("draft"),
    });
    expect(build).toEqual({
      ok: false,
      missing: ["document.issued_shipping_paper"],
    });
  });
});

describe("a draft's payload", () => {
  it("carries every gap as a gap and the watermark, never a number it does not have", () => {
    const input = buildInput();
    const build = buildShippingPaperPayload({
      ...input,
      emergencyContact: { ...input.emergencyContact, verifiedAt: null },
    });
    expect(build.kind).toBe("incomplete");
    const draft = buildShippingPaperDraftPayload({
      draft: build.draft,
      origin: ADDRESS,
      destinationAddress: null,
      destinationIdentifier: null,
      carrierIdentifier: null,
      shipperName: "Cascade Auto Recyclers LLC",
      gap: "Not on file — the paper cannot be generated",
      document: identity("draft"),
    });
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    expect(draft.payload.emergencyResponse.phone).toBeNull();
    expect(draft.payload.destination.address).toBeNull();
    expect(draft.payload.document.watermark).toBe(DRAFT_WATERMARK);
    expect(draft.payload.document.draftNotice).toBe(
      "A draft is never a document.",
    );
  });

  it("refuses an issued identity", () => {
    const build = buildShippingPaperPayload(buildInput());
    const draft = buildShippingPaperDraftPayload({
      draft: build.draft,
      origin: ADDRESS,
      destinationAddress: ADDRESS,
      destinationIdentifier: null,
      carrierIdentifier: null,
      shipperName: "Cascade Auto Recyclers LLC",
      gap: "Not on file",
      document: identity("issued"),
    });
    expect(draft).toEqual({
      ok: false,
      missing: ["document.draft_shipping_paper"],
    });
  });
});

describe("printed instants", () => {
  it("print in the site's zone, 24-hour, with the zone named", () => {
    expect(printedInstant(AT, ZONE)).toBe(
      "2026-10-09 10:00 (America/Los_Angeles)",
    );
  });
});
