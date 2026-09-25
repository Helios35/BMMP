import { CHEMISTRY_LABELS } from "@/domain/taxonomy/chemistry";
import {
  LABEL_FIELD_CODE_LABELS,
  type LabelFieldCode,
} from "@/domain/taxonomy/label-field-code";
import { ROLE_LABELS } from "@/domain/taxonomy/role";

/**
 * Every sentence `/review` speaks that the extraction review card does not —
 * `UX_SPEC.md` §3.8a, §3.8b, E-5, E-8b, E-15.
 *
 * The spec fixes several of these word for word and the e2e specs assert them
 * as rendered. Two things this file never says: that a chemistry was seen in
 * a photograph, and anything resembling a probability of anything (Rules
 * 1.25, 2.9; `_ANCHORS.md` §7.1, §7.2). Role and field names come from their
 * taxonomy labels, never inline (`TAXONOMY.md` §5.3).
 */

// --- both compositions -------------------------------------------------------------

export const REVIEW_TITLE = "Review queue";

/** E-15 — the good empty state, styled as one (§3.8a). */
export const NOTHING_TO_REVIEW = "Nothing to review.";
export const NOTHING_TO_REVIEW_BODY = "Every reading has been confirmed.";
export const NOTHING_TO_REVIEW_ACTION = "Go to batteries";

/** E-15 — filters exclude everything. **Never the zero-items copy.** */
export const FILTERED_EMPTY_TITLE = "No queue items match these filters";
export const FILTERED_EMPTY_BODY =
  "Everything you can reach is still here — these filters just exclude all of it.";
export const CLEAR_FILTERS = "Clear filters";

export const QUEUE_READ_FAILED =
  "We could not load the review queue. Nothing has changed — try again.";

// --- P1 and P6: the work queue (§3.8a) -------------------------------------------------

export const WORK_QUEUE_DESCRIPTION =
  "Every reading the confidence gate held back, oldest first. An item leaves only when a person confirms it or voids it with a stated reason.";

export const QUEUE_LIST_LABEL = "Items waiting";

export const SELECT_AN_ITEM = "Choose an item from the queue to work it.";

export const ITEM_NOT_ON_QUEUE =
  "That item is no longer on the queue. It was confirmed or voided, or it never was.";

export const PREVIOUS_ITEM = "Previous";
export const NEXT_ITEM = "Next item";
export const BACK_TO_QUEUE = "Back to the queue";

export function positionLabel(index: number, total: number): string {
  return `Item ${index + 1} of ${total}`;
}

export function flaggedFieldsLabel(count: number): string {
  if (count === 0) return "No field flagged";
  return count === 1 ? "1 field flagged" : `${count} fields flagged`;
}

export const NO_CONTAINER_NAMED = "No container named yet";

/** §3.8a's primary — the commit. */
export const CONFIRM_AND_COMMIT = "Confirm and commit";
export const COMMITTING = "Committing…";

export const CONDITION_SECTION = "Assessed condition";
export const PLACEMENT_SECTION = "Place into a container";
export const PLACEMENT_DESCRIPTION =
  "Optional. The storage clock starts when the battery goes into a container.";

/** The card's read-only condition row, on this route. */
export const CONDITION_CONFIRMED_BELOW =
  "Confirmed below, under Assessed condition";

export function loggedNotice(recordNumber: string): string {
  return `${recordNumber} is logged and has left the queue.`;
}
export function voidedNotice(recordNumber: string): string {
  return `${recordNumber} is voided with your reason and has left the queue. The record, its photos and its extraction are kept.`;
}
export function rematchConfirmedNotice(recordNumber: string): string {
  return `${recordNumber} now carries the approved catalog entry, confirmed by you.`;
}
export function rematchDeclinedNotice(recordNumber: string): string {
  return `${recordNumber} keeps its identification. Your reason is recorded on the raise.`;
}
export const OPEN_THE_RECORD = "Open the record";

// --- why each item is here (T-52 and Flow F) ----------------------------------------------

export const REMATCH_REASON = "An approved catalog entry matches this record";

export const REMATCH_NOT_OPEN =
  "That re-match is no longer waiting. It was confirmed or declined, or it never was.";

// --- a Flow F raise (§3.8a, E-5, Flow F step 4) -----------------------------------------

export const REMATCH_TITLE = "Confirm the catalog match";

export const REMATCH_BODY =
  "An Admin approved a catalog entry whose identifying fields match this record. Nothing on the record has changed. Confirm the match to take the entry's details, or keep the record as it is identified.";

export const REMATCH_CURRENT = "This record now";
export const REMATCH_PROPOSED = "The approved entry";

export function matchedOnSentence(fields: readonly string[]): string {
  return fields.length === 0
    ? "Matched on the record's identifiers"
    : `Matched on ${fields.join(", ")}`;
}

export function chemistryWillChange(
  current: string | null,
  proposed: string,
): string | null {
  if (current === null) return null;
  if (current === proposed) return null;
  return `Confirming replaces the chemistry ${current} with ${proposed}. The record is re-classified, and its container's segregation class is checked again.`;
}

export const CHEMISTRY_NOT_SET = CHEMISTRY_LABELS.unknown;

export const ENTRY_NOT_AVAILABLE =
  "The approved entry is no longer available to this organization, so the match cannot be confirmed. Keep the record as it is identified.";

export const CONFIRM_MATCH = "Confirm the match";
export const CONFIRMING_MATCH = "Confirming…";
export const KEEP_IDENTIFICATION = "Keep as identified";
export const KEEP_TITLE = "Keep this record as it is identified?";
export const KEEP_BODY =
  "The approved entry is not attached to this record. A reason is required, and it is kept with the raise.";
export const KEEP_REASON_LABEL = "Reason for keeping the record as identified";
export const KEEP_REASON_REQUIRED =
  "A reason is required before the record can be kept as identified.";
export const KEEP_CONFIRM = "Keep with this reason";
export const KEEPING = "Saving…";
export const KEEP_CANCEL = "Cancel";

// --- P2: the unidentified-inventory view (§3.8b) -------------------------------------------

/** §3.8b, the neutral alert's headline — her language, not the pipeline's. */
export function unidentifiedHeadline(count: number): string {
  return count === 1
    ? "1 battery in your containers isn't identified yet."
    : `${count} batteries in your containers aren't identified yet.`;
}

/** §3.8b, verbatim. It is why an intake backlog is a storage problem. */
export const UNIDENTIFIED_WHY =
  "Until a handler confirms what these are, they can't be classified — so they can't be checked against their container's segregation class or clocked against the right accumulation period.";

/** E-15 for P2 — her assurance, not an absence of work (§3.8b). */
export const ALL_IDENTIFIED =
  "Every battery in your containers has been identified.";
export const ALL_IDENTIFIED_ACTION = "Go to containers";

export const INVENTORY_CAPTION =
  "Unidentified batteries, grouped by the container each one is keyed on";

export const COLUMN_RECORD = "Record";
export const COLUMN_SITE = "Site";
export const COLUMN_AGE = "Age in queue";
export const COLUMN_CLOCK = "Storage clock";
export const COLUMN_CLASS = "Segregation class";
export const COLUMN_FLAGGED = "Flagged fields";

export const NO_CLOCK_RUNNING = "No clock running";

export function rollUpLabel(input: {
  readonly containerCode: string;
  readonly unidentified: number;
  readonly total: number;
  readonly clockTier: string | null;
  readonly classLabel: string;
}): string {
  const clock =
    input.clockTier === null ? "no clock running" : `clock ${input.clockTier}`;
  return `${input.containerCode} · ${input.unidentified} unidentified of ${input.total} · ${clock} · ${input.classLabel}`;
}

export const NO_CONTAINER_GROUP = "Not yet keyed on a container";
export const NO_CONTAINER_GROUP_NOTE =
  "The intake named no container. Placement is recorded when a handler confirms the battery.";

export const OPEN_CONTAINER = "Open the container";
export const OPEN_RECORD = "Open the record";
export const RECORD_STORAGE_EVENT = "Record a storage event";
export const SEE_CLOCK_ALERTS = "See storage-clock alerts";

export const SUMMARY_TITLE = "What was read";

/** The bytes are not served in B1a; the frame keeps the photo's size (`step-views.ts`). */
export const IMAGE_NOT_SERVED = "Image not available on the mock adapter.";
export const SUMMARY_CLOSE = "Close";

/** The plain statement §3.8b asks for, built from T-09's labels. */
export function unconfirmedStatement(
  unconfirmed: readonly LabelFieldCode[],
): string {
  if (unconfirmed.length === 0) {
    return "Every hard-gated field is confirmed. The record is waiting on the rest of the review.";
  }
  const names = unconfirmed.map((code) => LABEL_FIELD_CODE_LABELS[code]);
  const last = names[names.length - 1] ?? "";
  const leading = names.slice(0, -1);
  const list =
    leading.length === 0 ? last : `${leading.join(", ")} and ${last}`;
  const verb = names.length === 1 ? "is" : "are";
  return `${list} ${verb} not yet confirmed.`;
}

/** Who can confirm, for the summary panel — named, never linked (Rule 2.22). */
export const WHO_CONFIRMS = `A ${ROLE_LABELS.compliance_handler} or a ${ROLE_LABELS.platform_admin} confirms these on the review queue.`;
