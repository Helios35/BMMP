import { describe, expect, it } from "vitest";

import * as FIXTURES from "@/data/mock/fixtures";
import * as ID from "@/data/mock/fixtures/ids";
import type {
  ResolvedRule,
  RuleVersionCandidate,
} from "@/domain/rules/resolve";
import { buildDdrPacketContent } from "@/domain/transport/ddr-packet";
import {
  BATTERY_CSV_HEADERS,
  batteryCsvRow,
  IDENTIFIED_BY_MODEL,
  IDENTIFIED_BY_PERSON,
} from "@/features/battery-record/battery-csv";

/**
 * Rule 1.29 in the exports — `UX_SPEC.md` §3.5: the `/batteries` CSV says who
 * identified a record and how its damage was assessed; the DDR packet prints
 * the T-59 label on a model-assisted finding. **An unknown stored method is
 * never read as model-assisted** (STATE §7 #1).
 */

const record = FIXTURES.batteryRecords.find(
  (row) => row.id === ID.BATTERY.modelAssisted,
);
if (record === undefined) throw new Error("BR-0016 is a b2-10 fixture");

const EMPTY_CONTEXT = {
  containersById: new Map(),
  clocksByContainerId: new Map(),
} as const;

function cell(row: readonly string[], heading: string): string | undefined {
  return row[BATTERY_CSV_HEADERS.indexOf(heading as never)];
}

describe("the /batteries CSV (Rule 1.29)", () => {
  it("ends with Identified by and Damage assessed by, after every existing column", () => {
    expect(BATTERY_CSV_HEADERS.slice(-3)).toEqual([
      "Recall associations",
      "Identified by",
      "Damage assessed by",
    ]);
  });

  it("says a person entered it when no read supplied a value, and AI suggested when one did", () => {
    const entered = batteryCsvRow(record, EMPTY_CONTEXT);
    expect(cell(entered, "Identified by")).toBe(IDENTIFIED_BY_PERSON);
    const read = batteryCsvRow(record, {
      ...EMPTY_CONTEXT,
      identifiedByModelRecordIds: new Set([record.id]),
    });
    expect(cell(read, "Identified by")).toBe(IDENTIFIED_BY_MODEL);
  });

  it("exports the T-59 label, and an unknown stored method as stored — never as model-assisted", () => {
    const row = (method: string) =>
      cell(
        batteryCsvRow(record, {
          ...EMPTY_CONTEXT,
          assessmentMethodByRecordId: new Map([[record.id, method]]),
        }),
        "Damage assessed by",
      );
    expect(row("model_assisted_visual")).toBe(
      "AI suggested, confirmed by a person",
    );
    expect(row("visual_inspection")).toBe("Visual inspection");
    expect(row("human_visual_inspection")).toBe("human_visual_inspection");
    expect(
      cell(batteryCsvRow(record, EMPTY_CONTEXT), "Damage assessed by"),
    ).toBe("");
  });
});

describe("the DDR packet (Rule 1.29)", () => {
  const row = FIXTURES.ruleVersions.find(
    (version) => version.id === ID.RULE_VERSION.federalDdrPackaging2026v2,
  );
  if (row === undefined) throw new Error("the v2 packaging rule is a fixture");
  const rule: ResolvedRule = {
    ruleKey: "transport.ddr_packaging",
    version: {
      ...(row as unknown as RuleVersionCandidate),
      ruleVersionId: row.id,
      ruleKey: "transport.ddr_packaging",
    },
    jurisdiction: {
      id: ID.JURISDICTION.federal,
      code: "US",
      name: "United States",
      level: "federal",
    },
    level: "federal",
  };

  function entry(assessmentMethod: string | null) {
    const build = buildDdrPacketContent({
      shipmentNumber: "SH-TEST",
      timeZone: "America/Los_Angeles",
      rule,
      records: [
        {
          recordId: "record-1",
          recordNumber: "BR-9001",
          chemistry: "li_nmc",
          chemistryConfirmed: true,
          ddrFlags: ["damaged"],
          isAirTransportProhibited: true,
          findings: ["swelling"],
          assessmentMethod,
          assessedByName: "Dana R.",
          assessedAt: "2026-11-10T10:00:00.000Z",
          containerCode: "C-0002",
          containerType: "quarantine",
        },
      ],
    });
    if (build.kind !== "packet")
      throw new Error(`expected a packet, got ${build.kind}`);
    return build.outcome.result.records[0];
  }

  it("prints the T-59 label beside a model-assisted finding", () => {
    expect(entry("model_assisted_visual")?.methodLabel).toBe(
      "AI suggested, confirmed by a person",
    );
  });

  it("prints nothing extra for a visual inspection, an unknown method, or none", () => {
    expect(entry("visual_inspection")?.methodLabel).toBeNull();
    expect(entry("human_visual_inspection")?.methodLabel).toBeNull();
    expect(entry(null)?.methodLabel).toBeNull();
  });
});
