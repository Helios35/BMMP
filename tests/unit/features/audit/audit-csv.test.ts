import { describe, expect, it } from "vitest";

import { auditCsv, AUDIT_CSV_HEADERS } from "@/features/audit/audit-csv";
import { toAuditRowView } from "@/features/audit/audit-row";

import { auditEvent, TEST_DIRECTORY, TEST_ZONE } from "./audit-fixtures";

const rowFor = (event: Parameters<typeof auditEvent>[0] = {}) =>
  toAuditRowView(
    auditEvent(event),
    TEST_DIRECTORY,
    "facility_manager",
    TEST_ZONE,
  );

function cellsOf(csv: string, line: number): readonly string[] {
  // Adequate for these fixtures: none of the asserted cells contains a comma
  // inside quotes. The quoting itself is asserted directly below.
  return (csv.split("\r\n")[line] ?? "").split(",");
}

describe("the audit export", () => {
  it("carries the platform mark, so the file cannot hide what the screen showed", () => {
    // Rule 12.7 requires a platform action to be distinguishable in **every**
    // export, not only in the table.
    const csv = auditCsv([
      rowFor({
        actorUserId: "0a000002-0000-4000-8000-000000000004",
        actorType: "platform_admin",
      }),
    ]);
    expect(csv).toContain("Platform admin");
    expect(AUDIT_CSV_HEADERS).toContain("Actor type");
  });

  it("carries the applied rule versions, so a decision stays explainable", () => {
    // Rules 12.15, 12.16.
    const csv = auditCsv([
      rowFor({
        governingRuleVersionId: "0a000007-0000-4000-8000-000000000002",
        ruleVersionsApplied: [
          {
            jurisdictionRuleId: "0a000006-0000-4000-8000-000000000001",
            ruleVersionId: "0a000007-0000-4000-8000-000000000002",
            ruleKey: "storage.accumulation_period",
            versionLabel: "2026.1",
            citation: "WAC 173-303-573",
            inputs: {},
            outcome: "applied",
          },
        ],
      }),
    ]);
    expect(csv).toContain("WAC 173-303-573");
    expect(csv).toContain("storage.accumulation_period 2026.1");
  });

  it("quotes rather than rewrites a value", () => {
    // An export that alters a stored value to suit a spreadsheet is a falsified
    // record. The quoting is the only transformation.
    const csv = auditCsv([
      rowFor({ reason: 'Contained a comma, and a "quoted" phrase' }),
    ]);
    expect(csv).toContain('"Contained a comma, and a ""quoted"" phrase"');
  });

  it("exports an unrecognised event type as stored, never blank", () => {
    // TAXONOMY.md §5.8 — a row that vanishes from a total because its value was
    // unrecognised is the worst possible failure in an audit export.
    // @ts-expect-error — written by a newer deployment.
    const csv = auditCsv([rowFor({ eventType: "shipment.rerouted" })]);
    expect(csv).toContain("shipment.rerouted");
  });

  it("states the zone beside the timestamp", () => {
    // Rule 12.20.
    const csv = auditCsv([rowFor({})]);
    const cells = cellsOf(csv, 1);
    expect(cells[1]).toBe("2026-06-12 07:30:00");
    expect(cells[2]).toBe("PDT");
  });

  it("expresses no probability, percentage or likelihood anywhere", () => {
    // Rule 1.25 — the prohibition covers an export exactly as it covers a screen.
    const csv = auditCsv([rowFor({}), rowFor({ actorType: "platform_admin" })]);
    expect(csv).not.toMatch(
      /probab|percent|likelihood|chance|risk of fire|ignition/iu,
    );
    expect(AUDIT_CSV_HEADERS.join(" ")).not.toMatch(
      /probab|percent|likelihood|score|risk/iu,
    );
  });

  it("opens with the header row even when the scope is empty", () => {
    const csv = auditCsv([]);
    expect(csv.split("\r\n")[0]).toContain("Sequence");
  });
});
