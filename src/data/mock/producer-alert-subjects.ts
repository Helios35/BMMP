import {
  MISSING_INPUT_WORDS,
  type DeadlineAlertSubject,
  type MissingInput,
} from "@/domain/producer";
import type { ObligationDeadline, ProducerObligation } from "@/types/producer";

/**
 * The deadlines an organization's alerts are decided from (Rule 8.13) — each
 * deadline on a current obligation, with the words its alert carries. Read
 * from plain rows, so the job and the seed build them one way.
 */

function cantTellNote(row: ProducerObligation): string | null {
  if (row.status !== "undetermined") return null;
  const products = row.appliesBecause.products;
  if (!Array.isArray(products)) return null;
  const notes = products.flatMap((value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return [];
    }
    if (value.truth !== "cant_tell" || typeof value.label !== "string") {
      return [];
    }
    const listed: readonly unknown[] = Array.isArray(value.missing)
      ? value.missing
      : [];
    const missing = listed
      .filter(
        (input): input is MissingInput =>
          typeof input === "string" && input in MISSING_INPUT_WORDS,
      )
      .map((input) => MISSING_INPUT_WORDS[input]);
    return [`${value.label} — ${missing.join(", ")}`];
  });
  return notes.length === 0 ? null : notes.join("; ");
}

export function deadlineAlertSubjects(
  obligations: readonly ProducerObligation[],
  deadlines: readonly ObligationDeadline[],
): readonly DeadlineAlertSubject[] {
  const current = new Map(
    obligations.filter((row) => row.isCurrent).map((row) => [row.id, row]),
  );
  return deadlines.flatMap((row) => {
    const obligation = current.get(row.producerObligationId);
    if (obligation === undefined) return [];
    const stateName = obligation.appliesBecause.stateName;
    const code = obligation.appliesBecause.jurisdictionCode;
    return [
      {
        deadlineId: row.id,
        dueOn: row.dueOn,
        deadlineStatus: row.status,
        obligationStatus: obligation.status,
        stateName: typeof stateName === "string" ? stateName : "A state",
        jurisdictionCode: typeof code === "string" ? code : "",
        duty: obligation.obligationTitle,
        citation: row.citation,
        cantTellNote: cantTellNote(obligation),
      },
    ];
  });
}
