import type { BatteryRecordStatus } from "@/domain/taxonomy/battery-record-status";

import { normalizePartNumber } from "./match";

/**
 * Which records an approved catalog entry raises on `/review` — Flow F
 * step 4; Rule 2.20; T-61; EC-13.
 *
 * *"Every `battery_record` that was committed unmatched against the same
 * identifying fields is offered a re-match. Re-matching never silently changes
 * a confirmed chemistry — it raises the record on `/review` for a human to
 * confirm."*
 *
 * **This decides who is asked, never the answer.** It returns records to
 * raise; it changes nothing on them. The re-match itself is a person's act on
 * `/review`, attributed and audited as `battery_record.confirmed`.
 *
 * **Exact identifiers, not a score.** "The same identifying fields" is an
 * equality: the manufacturer, and the model or part number, after the same
 * normalisation the catalog's own `part_number_normalized` column applies. A
 * fuzzy score would need a threshold, a threshold is platform configuration
 * (D-43), and a person being asked about a near miss they already rejected
 * (EC-10) is the queue teaching them to stop reading it.
 */

/**
 * Committed: a person confirmed the identification (Rule 2.21) and the record
 * is still in the facility's hands. `draft` and `pending_review` are still
 * intakes — the catalog panel on their card is where a match is picked — and
 * `voided`, `staged`, `shipped` and `closed` records are past re-identifying
 * from the queue: a staged record's identity is its shipment's concern.
 *
 * The same set the record's own re-match path accepts
 * (`assertRecordEditable`), so nothing is raised that a person could not then
 * confirm.
 */
const COMMITTED_OPEN_STATUSES: readonly BatteryRecordStatus[] = [
  "confirmed",
  "classified",
  "reclassifying",
  "stored",
  "quarantined",
];

export interface RematchRecord {
  readonly id: string;
  readonly status: BatteryRecordStatus;
  readonly catalogEntryId: string | null;
  readonly manufacturerName: string | null;
  readonly modelName: string | null;
  readonly partNumber: string | null;
}

export interface RematchEntry {
  readonly manufacturerName: string;
  readonly modelName: string | null;
  readonly partNumber: string | null;
}

/** The identifier fields that agreed, in the order they were compared. */
export type RematchIdentifier = "manufacturer" | "model" | "part_number";

function normalized(value: string | null): string | null {
  if (value === null) return null;
  const out = normalizePartNumber(value);
  return out === "" ? null : out;
}

/**
 * The fields on which a record identifies the same product as an entry, or
 * `null` where it does not.
 *
 * The manufacturer must agree, and so must the model or the part number —
 * either side's model against either side's part number, because the label
 * prints one string and the record and the entry split it differently
 * (`mapDraftToRecordUpdate` writes the printed string to both).
 */
export function sameIdentifyingFields(
  record: Omit<RematchRecord, "id" | "status" | "catalogEntryId">,
  entry: RematchEntry,
): readonly RematchIdentifier[] | null {
  const recordMaker = normalized(record.manufacturerName);
  if (
    recordMaker === null ||
    recordMaker !== normalized(entry.manufacturerName)
  ) {
    return null;
  }

  const entryIds = new Set(
    [normalized(entry.modelName), normalized(entry.partNumber)].filter(
      (value): value is string => value !== null,
    ),
  );
  const matched: RematchIdentifier[] = ["manufacturer"];
  const model = normalized(record.modelName);
  const part = normalized(record.partNumber);
  if (model !== null && entryIds.has(model)) matched.push("model");
  // One printed string on both columns agrees once; it is not two matches.
  if (part !== null && part !== model && entryIds.has(part)) {
    matched.push("part_number");
  }
  return matched.length > 1 ? matched : null;
}

export interface RematchCandidate {
  readonly recordId: string;
  readonly matchedOn: readonly RematchIdentifier[];
}

/** Committed, unmatched, and identifying the same product: the records an approval raises. */
export function rematchCandidates(
  records: readonly RematchRecord[],
  entry: RematchEntry,
): readonly RematchCandidate[] {
  return records.flatMap((record) => {
    if (record.catalogEntryId !== null) return [];
    if (!COMMITTED_OPEN_STATUSES.includes(record.status)) return [];
    const matchedOn = sameIdentifyingFields(record, entry);
    return matchedOn === null ? [] : [{ recordId: record.id, matchedOn }];
  });
}
