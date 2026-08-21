import { ROLE_LABELS } from "@/domain/taxonomy/role";
import type { JsonObject } from "@/types/common";

import type { AuditRowView } from "./audit-row";

/**
 * The audit export's bytes — `UX_SPEC.md` §3.20, Rules 12.17–12.19.
 *
 * **The same view model the screen renders**, so a column that is on screen and a
 * column that is in the file cannot disagree. That matters most for the actor
 * type: Rule 12.7 requires a platform action to be distinguishable *in every
 * export*, not only in the table, and the only way to be sure of that is for both
 * to read one object.
 *
 * **No probability, percentage, likelihood or score appears in any column**
 * (Rule 1.25). Nothing here computes anything: every cell is a value the log
 * already held.
 *
 * Pure — string in, string out. The scoping, the tenancy and the audit write live
 * in the route handler, where the request is.
 */

/**
 * RFC 4180 quoting.
 *
 * **Values are never rewritten.** A spreadsheet may read a leading `=` as a
 * formula, and the usual mitigation is to prefix the cell — which changes what
 * the log said. An audit export that alters a stored value to suit a reader's
 * spreadsheet is a falsified record, so the bytes stay as stored and the quoting
 * is the only transformation.
 */
function csvCell(value: string): string {
  if (!/[",\r\n]/u.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}

function csvLine(cells: readonly string[]): string {
  return cells.map(csvCell).join(",");
}

/** The column order, and the only place these headings exist. */
export const AUDIT_CSV_HEADERS = [
  "Sequence",
  "Timestamp",
  "Time zone",
  "Actor",
  "Actor type",
  "Role",
  "Event type",
  "Entity table",
  "Entity id",
  "Summary",
  "Changed fields",
  "Before",
  "After",
  "Governing rule version",
  "Rule versions applied",
  "Correlation id",
] as const;

function stateCell(state: JsonObject | null): string {
  return state === null ? "" : JSON.stringify(state);
}

export function auditCsvRow(row: AuditRowView): readonly string[] {
  return [
    String(row.sequenceNo),
    row.timestamp.value,
    row.timestamp.zone,
    row.actorName,
    // T-60's label, from T-60's own lookup — Rules 1.18, 12.7.
    row.actorTypeLabel,
    row.actorRole === null ? "" : ROLE_LABELS[row.actorRole],
    // TAXONOMY.md §5.8 — an unrecognised value exports as stored, never blank
    // and never coerced, so a row cannot vanish from a total.
    row.eventTypeLabel ?? row.eventTypeStored,
    row.entityTable,
    row.entityId,
    row.summary,
    row.changedFields.join(" "),
    stateCell(row.beforeState),
    stateCell(row.afterState),
    row.governingRuleVersionId ?? "",
    // Rules 12.15, 12.16 — the applied version is what answers "why did you
    // classify it that way" years later, so it leaves with the export.
    row.ruleVersions
      .map(
        (version) =>
          `${version.ruleKey} ${version.versionLabel} (${version.citation}) => ${version.outcome}`,
      )
      .join(" | "),
    row.correlationId ?? "",
  ];
}

/**
 * The whole file.
 *
 * CRLF line endings and a UTF-8 byte-order mark, because the reader of this file
 * is an auditor opening it in a spreadsheet, and a name with an accent in it
 * rendering as mojibake is a defect in a record about who did what.
 */
export function auditCsv(rows: readonly AuditRowView[]): string {
  const lines = [
    csvLine(AUDIT_CSV_HEADERS),
    ...rows.map((row) => csvLine(auditCsvRow(row))),
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
