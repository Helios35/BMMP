import { describe, expect, it } from "vitest";

import {
  addCivilYears,
  admitArrival,
  admitDeparture,
  shipmentRetention,
  type DepartureFacts,
} from "@/domain/transport/departure";

import { resolvedRule, RETENTION } from "./rule-fixtures";

/** Rules 5.16–5.18, 5.26, 6.16 — departure and arrival, each refusal stated. */

function facts(overrides: Partial<DepartureFacts> = {}): DepartureFacts {
  return {
    status: "documents_issued",
    hasCurrentIssuedPaper: true,
    carrierName: "Coleridge Hauling",
    transportMode: "ground",
    air: { available: true },
    ddrRecordNumbers: [],
    ddrPacketIssued: false,
    retention: {
      ok: true,
      expiresOn: "2029-10-09",
      ruleVersionId: "v",
      citation: "c",
    },
    ...overrides,
  };
}

function reasonOf(input: DepartureFacts) {
  const admission = admitDeparture(input);
  return admission.ok ? "ok" : admission.reason;
}

describe("admitDeparture", () => {
  it("admits an issued, current shipment with its carrier and retention on file", () => {
    expect(reasonOf(facts())).toBe("ok");
  });

  it("refuses a shipment with no issued paper, or a paper not current for its contents", () => {
    expect(reasonOf(facts({ status: "ready" }))).toBe("not_documented");
    expect(reasonOf(facts({ status: "dispatched" }))).toBe("not_documented");
    expect(reasonOf(facts({ hasCurrentIssuedPaper: false }))).toBe(
      "no_current_paper",
    );
  });

  it("refuses without a carrier (Rule 5.16)", () => {
    expect(reasonOf(facts({ carrierName: " " }))).toBe("carrier_missing");
  });

  it("re-checks air at departure (Rule 6.7)", () => {
    expect(
      reasonOf(
        facts({
          transportMode: "air",
          air: {
            available: false,
            blockingRecords: [
              {
                recordId: "r",
                recordNumber: "BR-0003",
                indicators: [{ kind: "finding", finding: "swelling" }],
                citation: null,
              },
            ],
            citations: [],
          },
        }),
      ),
    ).toBe("air_blocked");
  });

  it("refuses a damaged/defective shipment with no packet, naming the records (Rule 6.16)", () => {
    const admission = admitDeparture(facts({ ddrRecordNumbers: ["BR-0003"] }));
    expect(admission).toMatchObject({
      ok: false,
      reason: "ddr_packet_missing",
    });
    if (!admission.ok) expect(admission.message).toContain("BR-0003");
  });

  it("refuses when no retention period is on file — never a literal (Rule 5.18)", () => {
    expect(reasonOf(facts({ retention: { ok: false } }))).toBe(
      "retention_unresolved",
    );
  });
});

describe("admitArrival", () => {
  it("records arrival only after departure", () => {
    expect(admitArrival("dispatched")).toEqual({ ok: true });
    expect(admitArrival("documents_issued").ok).toBe(false);
    expect(admitArrival("closed").ok).toBe(false);
  });
});

describe("shipmentRetention", () => {
  it("counts the rule version's years from the ship date in the site's zone", () => {
    // 01:30 UTC on the 10th is still the 9th in Washington.
    expect(
      shipmentRetention(
        "2026-10-10T01:30:00.000Z",
        "America/Los_Angeles",
        RETENTION,
      ),
    ).toMatchObject({ ok: true, expiresOn: "2029-10-09" });
  });

  it("is unresolved with no rule, or a payload it cannot read", () => {
    expect(shipmentRetention("2026-10-09T17:00:00.000Z", "UTC", null)).toEqual({
      ok: false,
    });
    expect(
      shipmentRetention(
        "2026-10-09T17:00:00.000Z",
        "UTC",
        resolvedRule({
          ruleKey: "retention.shipment_record",
          payloadSchemaKey: "retention.shipment_record.v1",
          payload: { retentionYears: "3" },
          domain: "retention",
        }),
      ),
    ).toEqual({ ok: false });
  });

  it("rolls 29 February forward, never back — a retention date fails safe", () => {
    expect(addCivilYears("2028-02-29", 1)).toBe("2029-03-01");
    expect(addCivilYears("2026-07-30", 3)).toBe("2029-07-30");
  });
});
