import { describe, expect, it } from "vitest";

import {
  holdsRecalledFlag,
  prohibitsAir,
  recallStanding,
  validateRecallMatchConfiguration,
  withDamageFlags,
  withRecalledFlag,
  type StandingRun,
} from "@/domain/recalls";

/** Rules 10.16–10.18; T-30, T-35. */

const AT = "2026-10-27T09:00:00.000Z";
const EARLIER = "2026-10-20T09:00:00.000Z";

function run(overrides: Partial<StandingRun>): StandingRun {
  return {
    source: "consumer_product_agency",
    identity: "battery",
    outcome: "no_match",
    ranAt: AT,
    ...overrides,
  };
}

describe("Rule 10.18 — a record's standing, in order", () => {
  it("reads confirmed above everything", () => {
    expect(
      recallStanding({
        matches: [{ status: "possible_match" }, { status: "confirmed_match" }],
        runs: [run({ outcome: "failed" })],
        identities: ["battery"],
      }).status,
    ).toBe("confirmed_match");
  });

  it("reads possible above a failed or clean run", () => {
    expect(
      recallStanding({
        matches: [{ status: "possible_match" }],
        runs: [run({ outcome: "failed" })],
        identities: ["battery"],
      }).status,
    ).toBe("possible_match");
  });

  it("reads no match only when the last run on every applicable identity found none", () => {
    const standing = recallStanding({
      matches: [],
      runs: [
        run({}),
        run({
          source: "vehicle_safety_agency",
          identity: "source_vehicle",
        }),
      ],
      identities: ["battery", "source_vehicle"],
    });
    expect(standing.status).toBe("no_match");
    expect(standing.sources).toEqual([
      "consumer_product_agency",
      "vehicle_safety_agency",
    ]);
  });

  it("never reads a failure as no match (Rule 10.17)", () => {
    const standing = recallStanding({
      matches: [],
      runs: [
        run({}),
        run({
          source: "vehicle_safety_agency",
          identity: "source_vehicle",
          outcome: "failed",
          ranAt: AT,
        }),
      ],
      identities: ["battery", "source_vehicle"],
    });
    expect(standing.status).toBe("not_checked");
    expect(standing.reason).toBe("source_unavailable");
    expect(standing.lastCheckedAt).toBe(AT);
  });

  it("reads the newest run: a failure retried successfully is no longer a failure", () => {
    expect(
      recallStanding({
        matches: [],
        runs: [run({ outcome: "failed", ranAt: EARLIER }), run({})],
        identities: ["battery"],
      }).status,
    ).toBe("no_match");
  });

  it("is not checked when an applicable identity has never been asked", () => {
    expect(
      recallStanding({
        matches: [],
        runs: [run({})],
        identities: ["battery", "source_vehicle"],
      }).reason,
    ).toBe("never_checked");
  });

  it("says nothing to match against as a recorded fact, not a failure", () => {
    expect(
      recallStanding({
        matches: [],
        runs: [
          run({ source: null, identity: null, outcome: "nothing_to_match" }),
        ],
        identities: [],
      }),
    ).toMatchObject({ status: "not_checked", reason: "nothing_to_match" });
  });

  it("counts a dismissed candidate as found and ruled out", () => {
    expect(
      recallStanding({
        matches: [{ status: "dismissed" }],
        runs: [run({ outcome: "candidates_found" })],
        identities: ["battery"],
      }).status,
    ).toBe("no_match");
  });
});

describe("T-30 — the recalled flag belongs to the recall path", () => {
  it("is held while any confirmed recall remains (Rule 10.16)", () => {
    expect(
      holdsRecalledFlag([
        { status: "dismissed" },
        { status: "confirmed_match" },
      ]),
    ).toBe(true);
    expect(holdsRecalledFlag([{ status: "dismissed" }])).toBe(false);
  });

  it("is set and cleared without touching damage", () => {
    expect(withRecalledFlag(["damaged"], true)).toEqual([
      "damaged",
      "recalled",
    ]);
    expect(withRecalledFlag(["damaged", "recalled"], false)).toEqual([
      "damaged",
    ]);
  });

  it("survives a damage re-assessment: recalled is not a finding", () => {
    expect(withDamageFlags(["recalled"], [])).toEqual(["recalled"]);
    expect(withDamageFlags(["damaged", "recalled"], [])).toEqual(["recalled"]);
    expect(withDamageFlags([], ["damaged"])).toEqual(["damaged"]);
  });

  it("keeps air closed while any flag stands (Rule 6.24)", () => {
    expect(prohibitsAir(["recalled"])).toBe(true);
    expect(prohibitsAir([])).toBe(false);
  });
});

describe("the recall-match configuration (Rule 1.23)", () => {
  it("refuses an empty component list rather than defaulting one", () => {
    expect(
      validateRecallMatchConfiguration({
        configurationVersion: "v",
        makerWordsIgnored: [],
        tractionBatteryComponentTerms: [],
      }).ok,
    ).toBe(false);
  });

  it("accepts a complete row", () => {
    expect(
      validateRecallMatchConfiguration({
        configurationVersion: "v",
        makerWordsIgnored: ["Inc"],
        tractionBatteryComponentTerms: ["traction battery"],
      }).ok,
    ).toBe(true);
  });
});
