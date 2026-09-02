import type { ConfidenceBand } from "@/domain/taxonomy/confidence-band";
import {
  LABEL_FIELD_CODE_LABELS,
  type LabelFieldCode,
} from "@/domain/taxonomy/label-field-code";

/**
 * What still stands between this intake and a committed record —
 * `UX_SPEC.md` §2.1.4(6).
 *
 * **The server and the card share this list.** The primary control on the card
 * renders `aria-disabled` with these items beneath it, and `confirmIntake`
 * refuses on the server for the same reasons — one function, so the reason a
 * person reads is the reason the commit would give. A checklist computed twice
 * drifts, and a drifted checklist lets a card say "ready" to a server that
 * says no (or worse, the reverse).
 *
 * **Nothing here is configurable.** Which fields are hard-gated is T-09's
 * business (`HARD_GATED_LABEL_FIELD_CODES`, carried on each field as
 * `isHardGated`); that a hard-gated field needs a person is Rule 2.15 and no
 * threshold value changes it. There is no bulk path through this list.
 *
 * Every label comes from `LABEL_FIELD_CODE_LABELS` — never an inline field
 * name (TAXONOMY.md §5.3).
 */

export type FieldConfirmationStatus = "pending" | "confirmed" | "rejected";

export interface CommitFieldState {
  readonly fieldCode: LabelFieldCode;
  readonly status: FieldConfirmationStatus;
  readonly value: string | null;
  readonly confidenceBand: ConfidenceBand | null;
  readonly isHardGated: boolean;
  /** The record cannot be written without a value here. */
  readonly isRequired: boolean;
}

export type OutstandingItemKind =
  | "confirm_hard_gated"
  | "resolve_low_confidence"
  | "required_value"
  | "confirm_condition"
  | "choose_container"
  | "offline"
  | "classification_blocked";

export interface OutstandingItem {
  readonly kind: OutstandingItemKind;
  readonly fieldCode?: LabelFieldCode;
  /** Ready to render. Field names come from T-09's labels. */
  readonly label: string;
}

export interface CommitGateInput {
  readonly fields: readonly CommitFieldState[];
  /** Step 3's assessed condition has been confirmed by a person (Rule 6.2). */
  readonly conditionConfirmed: boolean;
  /** Whether the viewer's role is the one that confirms condition. Changes the wording, never the requirement. */
  readonly ownsCondition: boolean;
  readonly containerChosen: boolean;
  /** The flow was entered with placement expected. Unplaced intake is allowed when this is false. */
  readonly requiresContainer: boolean;
  readonly isOffline: boolean;
  /**
   * The classification preview could not be completed for a reason other than
   * an unconfirmed chemistry (E-13). Optional because the review step has no
   * preview yet; absent reads as not blocked.
   */
  readonly classificationBlocked?: boolean;
}

/** The bands whose fields a person has to confirm or reject before continuing. */
const BANDS_REQUIRING_RESOLUTION: readonly ConfidenceBand[] = [
  "low",
  "not_extracted",
];

/** Assessed condition is confirmed on step 3, as a condition, not as a text field. */
const CONDITION_FIELD: LabelFieldCode = "assessed_condition";

function isBlank(value: string | null): boolean {
  return value === null || value.trim().length === 0;
}

function confirmItem(fieldCode: LabelFieldCode): OutstandingItem {
  return {
    kind: "confirm_hard_gated",
    fieldCode,
    label: `Confirm ${LABEL_FIELD_CODE_LABELS[fieldCode]}`,
  };
}

function resolveItem(fieldCode: LabelFieldCode): OutstandingItem {
  return {
    kind: "resolve_low_confidence",
    fieldCode,
    label: `Resolve ${LABEL_FIELD_CODE_LABELS[fieldCode]}`,
  };
}

function requiredItem(fieldCode: LabelFieldCode): OutstandingItem {
  return {
    kind: "required_value",
    fieldCode,
    label: `${LABEL_FIELD_CODE_LABELS[fieldCode]} is required`,
  };
}

const OFFLINE_ITEM: OutstandingItem = {
  kind: "offline",
  label: "Reconnect to log this battery",
};

/**
 * The field-level items, shared by both gates.
 *
 * - a hard-gated field not `confirmed` → confirm it (no band exempts it);
 * - a `low` or `not_extracted` field still `pending` → resolve it, by confirming
 *   a value or rejecting the read (§2.1.4);
 * - a required field with no value, however it got there → supply one. A
 *   rejected read of a required field is still a missing value.
 *
 * The condition field is skipped here: it is confirmed on step 3 as a
 * condition (Rule 6.2), and {@link outstandingCommitItems} lists it under its
 * own kind.
 */
function fieldItems(
  fields: readonly CommitFieldState[],
): readonly OutstandingItem[] {
  const items: OutstandingItem[] = [];
  for (const field of fields) {
    if (field.fieldCode === CONDITION_FIELD) continue;
    if (field.isHardGated && field.status !== "confirmed") {
      items.push(confirmItem(field.fieldCode));
    } else if (
      field.status === "pending" &&
      field.confidenceBand !== null &&
      BANDS_REQUIRING_RESOLUTION.includes(field.confidenceBand)
    ) {
      items.push(resolveItem(field.fieldCode));
    }
    if (field.isRequired && isBlank(field.value)) {
      items.push(requiredItem(field.fieldCode));
    }
  }
  return items;
}

/**
 * Step 2 → step 3. Empty means the person may continue to confirm and place.
 *
 * Hard-gated model and chemistry confirmed, every low or unread field
 * confirmed-or-rejected, required values present, and a connection — a
 * confirmation is never optimistic, so an offline card cannot continue
 * (`UX_SPEC.md` §6.4).
 */
export function canContinueFromReview(
  fields: readonly CommitFieldState[],
  isOffline: boolean,
): readonly OutstandingItem[] {
  const items = [...fieldItems(fields)];
  if (isOffline) items.push(OFFLINE_ITEM);
  return items;
}

/**
 * Everything outstanding before **Confirm and log battery** may act. Empty means
 * the commit may proceed; the server checks the same list before it writes.
 */
export function outstandingCommitItems(
  input: CommitGateInput,
): readonly OutstandingItem[] {
  const items = [...fieldItems(input.fields)];

  if (!input.conditionConfirmed) {
    const label = LABEL_FIELD_CODE_LABELS[CONDITION_FIELD];
    items.push({
      kind: "confirm_condition",
      fieldCode: CONDITION_FIELD,
      // The requirement is the same either way; only who is being addressed
      // changes. A handler who does not assess condition is told what is
      // missing, not told to do something their role cannot.
      label: input.ownsCondition
        ? `Confirm ${label}`
        : `${label} has not been confirmed`,
    });
  }

  if (input.requiresContainer && !input.containerChosen) {
    items.push({ kind: "choose_container", label: "Choose a container" });
  }

  if (input.classificationBlocked === true) {
    items.push({
      kind: "classification_blocked",
      label: "Classification could not be completed",
    });
  }

  if (input.isOffline) items.push(OFFLINE_ITEM);

  return items;
}
