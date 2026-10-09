import { describe, expect, it } from "vitest";

import {
  assessAirTransport,
  isModeAvailable,
  type AirTransportSubject,
} from "@/domain/transport/air-transport";
import { TRANSPORT_MODES } from "@/domain/taxonomy/transport-mode";

/**
 * Rules 6.4, 6.5, 6.7–6.9 — the air block is a decision of the domain, and it
 * is a block: a flagged record makes air unavailable, with the record and its
 * specific indicator named. There is no input that admits it.
 */

function subject(overrides: Partial<AirTransportSubject>): AirTransportSubject {
  return {
    recordId: "record-1",
    recordNumber: "BR-0001",
    ddrFlags: [],
    isAirTransportProhibited: false,
    currentFindings: ["none_observed"],
    citation: null,
    ...overrides,
  };
}

describe("assessAirTransport", () => {
  it("leaves air available when nothing in scope is damaged, defective or recalled", () => {
    expect(assessAirTransport([subject({})])).toEqual({ available: true });
    expect(assessAirTransport([])).toEqual({ available: true });
  });

  it("names the record and the confirmed damaged-or-defective finding (Rule 6.9)", () => {
    const result = assessAirTransport([
      subject({}),
      subject({
        recordId: "swollen",
        recordNumber: "BR-0003",
        ddrFlags: ["damaged"],
        isAirTransportProhibited: true,
        currentFindings: ["swelling", "surface_marking"],
        citation: "Condition rule — test citation",
      }),
    ]);
    expect(result.available).toBe(false);
    if (result.available) return;
    expect(result.blockingRecords).toEqual([
      {
        recordId: "swollen",
        recordNumber: "BR-0003",
        // The cosmetic finding is not an indicator; only the T-29 damaged set is.
        indicators: [{ kind: "finding", finding: "swelling" }],
        citation: "Condition rule — test citation",
      },
    ]);
    expect(result.citations).toEqual(["Condition rule — test citation"]);
  });

  it("names a recall as a recall, not as damage (Rule 6.5; §2.6)", () => {
    const result = assessAirTransport([
      subject({ ddrFlags: ["recalled"], isAirTransportProhibited: true }),
    ]);
    if (result.available) throw new Error("expected a block");
    expect(result.blockingRecords[0]?.indicators).toEqual([
      { kind: "flag", flag: "recalled" },
    ]);
  });

  it("fails closed: the stored prohibition alone blocks, and a missing citation never unlocks", () => {
    const result = assessAirTransport([
      subject({ ddrFlags: [], isAirTransportProhibited: true, citation: null }),
    ]);
    expect(result.available).toBe(false);
    if (result.available) return;
    expect(result.citations).toEqual([]);
    expect(result.blockingRecords[0]?.indicators.length).toBeGreaterThan(0);
  });

  it("a flag with no finding on hand still blocks, named by the flag", () => {
    const result = assessAirTransport([
      subject({ ddrFlags: ["damaged", "defective"], currentFindings: [] }),
    ]);
    if (result.available) throw new Error("expected a block");
    expect(result.blockingRecords[0]?.indicators).toEqual([
      { kind: "flag", flag: "damaged" },
      { kind: "flag", flag: "defective" },
    ]);
  });

  it("only air is reached by the block; every other mode stays available (T-18)", () => {
    const blocked = assessAirTransport([subject({ ddrFlags: ["damaged"] })]);
    for (const mode of TRANSPORT_MODES) {
      expect(isModeAvailable(mode, blocked)).toBe(mode !== "air");
    }
    const clear = assessAirTransport([subject({})]);
    for (const mode of TRANSPORT_MODES) {
      expect(isModeAvailable(mode, clear)).toBe(true);
    }
  });
});
