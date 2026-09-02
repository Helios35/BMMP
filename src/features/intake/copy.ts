import { CHEMISTRY_LABELS } from "@/domain/taxonomy/chemistry";
import { DAMAGE_FINDING_TYPE_LABELS } from "@/domain/taxonomy/damage-finding-type";
import { LABEL_FIELD_CODE_LABELS } from "@/domain/taxonomy/label-field-code";
import type { LabelFieldCode } from "@/domain/taxonomy/label-field-code";
import { ROLE_LABELS } from "@/domain/taxonomy/role";
import type { DamageFindingsValidation } from "@/domain/condition/damage";
import type { OutstandingItem } from "@/domain/intake/commit-gate";

/**
 * Every sentence the intake server side says to a person, written once —
 * `UX_SPEC.md` §2.1, §3.6, §10.3.
 *
 * Three standing rules govern every string here:
 *
 * - **What failed, what state the record is in, what to do next** (§10.3).
 *   Never a stack trace, a provider name, an internal id or a SQL error.
 * - **No jurisdiction threshold, deadline, citation or unit is a literal**
 *   (Rule 1.23), and no confidence threshold value either (D-22) — nothing
 *   here states a number a rule or a configuration row supplies.
 * - **Chemistry is never said to have been read from a photograph**
 *   (Rules 2.9, 2.10). The label's characters are read; chemistry comes from
 *   a matched catalog entry or a person, and the copy says exactly that.
 *
 * Role names come from `ROLE_LABELS` and field names from
 * `LABEL_FIELD_CODE_LABELS` — a T-37 or T-09 label written inline is a defect
 * even when it happens to match (`TAXONOMY.md` §5.3).
 */

/** Who to send someone to when a rule or a profile is missing (Rule 3.10, E-13). */
export const RULE_SUPPLIERS = `A ${ROLE_LABELS.facility_manager} or a ${ROLE_LABELS.platform_admin}`;

// --- sessions -----------------------------------------------------------------

/** Neutral by design: absent and another tenant's read the same (Rule 1.2). */
export const INTAKE_NOT_FOUND = "That intake could not be found.";

export const INTAKE_CLOSED =
  "This intake has already been closed. Nothing was changed.";

export const INTAKE_HAS_NO_RECORD =
  "This intake has no battery record attached to it, so it cannot continue. Start a new intake for this battery.";

export const CONFIGURATION_CHANGED_MID_SESSION =
  "The label-reading configuration changed after this intake started, so its result would not reproduce. Start a new intake for this battery.";

// --- photos and the label read ---------------------------------------------------

export const PHOTO_NOT_ON_INTAKE = "That photo is not on this intake.";

export const PHOTO_NOT_A_LABEL =
  "Only a label photo can be read. Choose the label photo and try again.";

export const PHOTO_FILE_MISSING = "Attach a photo to send.";

export const PHOTO_TYPE_UNSUPPORTED =
  "That file type can't be used here. Take the photo as a JPEG, PNG or WebP image.";

export const PHOTO_UNREADABLE =
  "That image could not be read. Take the photo again.";

export const PHOTO_ALREADY_ON_INTAKE =
  "The same photo is already on this intake.";

export const PHOTO_INTAKE_CLOSED =
  "This intake is closed and no longer accepts photos.";

export const PHOTO_SENT = "Photo sent.";

export const LABEL_READ_UNAVAILABLE =
  "The label could not be read right now. Your photos are kept — try again, or enter the details by hand.";

export const LABEL_READ_MALFORMED =
  "The label reader returned something that could not be used. Your photos are kept — try again, or enter the details by hand.";

export const LABEL_READ_NEEDS_CROP =
  "The label could not be found in the photo. Draw a box around it to continue.";

// --- the extraction review card ---------------------------------------------------

export function fieldValueRefused(
  fieldCode: LabelFieldCode,
  reason: string,
): string {
  return `${LABEL_FIELD_CODE_LABELS[fieldCode]} was not accepted: ${reason}.`;
}

export const CHEMISTRY_UNKNOWN_REFUSED = `Choose a chemistry. "${CHEMISTRY_LABELS.unknown}" is the absence of one, not a value.`;

export const CHEMISTRY_NEEDS_SOURCE =
  "Pick a catalog entry or enter the chemistry before confirming it. The characters printed on the label are not a chemistry on their own.";

export const CONDITION_CONFIRMED_AT_STEP_3 =
  "Assessed condition is recorded and confirmed at step 3, not on the review card.";

export const CATALOG_ENTRY_NOT_AVAILABLE =
  "That catalog entry is not available for matching.";

export const CANNOT_SHIP_WITHOUT_CATALOG =
  "You can log this battery now. It can't go on a shipping paper until this product is in the catalog.";

export function reviewIncomplete(items: readonly OutstandingItem[]): string {
  return `Finish the extraction review before continuing: ${items.map((item) => item.label).join("; ")}.`;
}

export const STEP_NOT_OPEN = "That step is not open yet.";

// --- condition ----------------------------------------------------------------

export function findingsRefused(
  validation: Extract<DamageFindingsValidation, { ok: false }>,
): string {
  switch (validation.reason) {
    case "empty":
      return `Record at least one finding. "${DAMAGE_FINDING_TYPE_LABELS.none_observed}" counts as one.`;
    case "none_observed_not_exclusive":
      return `"${DAMAGE_FINDING_TYPE_LABELS.none_observed}" cannot be recorded beside another finding.`;
    case "unknown_finding":
      return "One of the findings is not a recognised finding type. Nothing was changed.";
  }
}

export const CONDITION_NOT_RECORDED =
  "Record the findings before confirming the assessed condition.";

// --- placement ------------------------------------------------------------------

export const CONTAINER_NOT_FOUND = "That container could not be found.";

export const CONTAINER_NEEDS_CLASSIFICATION =
  "No container can be created until the waste classification is decided.";

export const NO_JURISDICTION_PROFILE = `No jurisdiction profile is on file for this site, so the waste classification cannot be decided. ${RULE_SUPPLIERS} can supply it.`;

export const NO_CLASSIFICATION_RULE_IN_FORCE = `No published rule version covering waste classification is in force for this site, so the classification cannot be decided. ${RULE_SUPPLIERS} can supply it.`;

export const NO_ACCUMULATION_RULE_IN_FORCE = `No published rule version covering the accumulation period is in force for this site, so no storage clock can start. ${RULE_SUPPLIERS} can supply it.`;

export const NEW_CLOCK_ON_PLACEMENT =
  "A new clock starts when this battery is placed.";

// --- the commit -----------------------------------------------------------------

export function commitOutstanding(items: readonly OutstandingItem[]): string {
  return `This battery can't be logged yet: ${items.map((item) => item.label).join("; ")}.`;
}

export const COMMIT_REFUSED_BY_GATE =
  "Chemistry, model and condition are always confirmed by a person, at every confidence band, before a record is logged.";

export const BATTERY_LOGGED = "Battery logged";

export const LOG_ANOTHER = "Log another";

// --- reasons written to the audit log -------------------------------------------

export const REASON_SAVED_TO_QUEUE = "session_saved_to_queue";
