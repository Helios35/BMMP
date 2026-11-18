import type { ObligationsReadModel } from "./view";

/**
 * The obligations CSV — Rule 8.16. Every current obligation and deadline:
 * state, law, obligation, status, products and bands, due date and basis,
 * deadline status, who marked it done and when, the note, the citation and
 * the rule version. **An evidence artifact** (Rule 8.4): one row per
 * deadline, one row for an obligation with none, and one row for each state
 * sold in that has no rules on file — so the file says so rather than
 * leaving the state out.
 */

export const OBLIGATION_CSV_HEADERS = [
  "State",
  "Law",
  "Obligation",
  "Status",
  "Products and bands",
  "Due date",
  "Due basis",
  "Deadline status",
  "Marked done by",
  "Marked done at",
  "Date met",
  "Note",
  "Reference",
  "Citation",
  "Rule version",
] as const;

export function obligationCsvRows(
  model: ObligationsReadModel,
  people: ReadonlyMap<string, string>,
): readonly (readonly string[])[] {
  const rows: string[][] = [];
  for (const state of model.states) {
    if (!state.onFile) {
      rows.push([
        state.state.name,
        "",
        state.noRulesWords ?? "",
        "No rules on file",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ]);
      continue;
    }
    for (const obligation of state.obligations) {
      const products = obligation.products
        .map((product) => `${product.label}: ${product.bandWords}`)
        .join("; ");
      const base = [
        state.state.name,
        state.law ?? "",
        obligation.duty,
        obligation.statusLabel,
        products,
      ];
      const version = state.obligationsVersionWords ?? "";
      if (obligation.deadlines.length === 0) {
        rows.push([
          ...base,
          obligation.dueWords,
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          obligation.citation,
          version,
        ]);
        continue;
      }
      for (const deadline of obligation.deadlines) {
        rows.push([
          ...base,
          deadline.dueOn,
          deadline.basisLabel,
          deadline.standingLabel,
          deadline.completedBy === null
            ? ""
            : (people.get(deadline.completedBy) ?? deadline.completedBy),
          deadline.completedAt ?? "",
          deadline.completedOn ?? "",
          deadline.completionNote ?? "",
          deadline.completionReference ?? "",
          deadline.citation,
          version,
        ]);
      }
    }
  }
  return rows;
}
