import type { RecallStandingReason } from "@/domain/recalls/standing";
import { RECALL_MATCH_STATUS_LABELS } from "@/domain/taxonomy/recall-match-status";

/**
 * The words on the record's **Recalls** section — `UX_SPEC.md` §3.7; Rules
 * 10.13, 10.17, 10.18.
 *
 * **No match-strength wording anywhere.** No word here grades a match, puts a
 * number on one or calls a possible match a recall (Rule 10.13), and none
 * states a chance of anything (Rule 10.3). The standing's status words are
 * T-35's own labels; the reasons are this section's.
 */

export const RECALLS_TITLE = "Recalls";
export const RECALLS_DESCRIPTION =
  "Checked against the government recall sources, and any recall a person recorded. A possible match changes nothing until a person confirms it.";

/** The standing line's words for `not_checked`, by reason (Rules 10.11, 10.17). */
export const NOT_CHECKED_TEXT: Readonly<Record<RecallStandingReason, string>> =
  {
    never_checked: RECALL_MATCH_STATUS_LABELS.not_checked,
    source_unavailable: `${RECALL_MATCH_STATUS_LABELS.not_checked} — source unavailable`,
    nothing_to_match: "Nothing to match against.",
  };

export const LAST_CHECKED = "Last checked";
export const CHECKED_AGAINST = "Checked against";
export const NEVER_CHECKED_NOTE =
  "No check has run on this record yet. The next nightly check runs it, or press Check now.";
export const UNAVAILABLE_NOTE =
  "A recall source did not answer. This is not a result: the record has not been checked against it. The next check asks again.";
export const NOTHING_TO_MATCH_NOTE =
  "This record has no confirmed catalog entry and no source make and model, so there is nothing a recall could name. That is recorded, not a failure.";

export const NO_RECALLS_LISTED = "No recall is associated with this record.";

export const MATCHED_ON = "Matched on:";
export const RECORDED_BY_HAND = "Recorded by hand from the notice.";
export const PUBLISHED = "Published";
export const REMEDY = "Remedy";
export const NO_TITLE = "No title recorded";
export const CONFIRMED_BY = "Confirmed by";
export const RECORDED_BY = "Recorded by";
export const DISMISSED_BY = "Dismissed by";
export const WITHDRAWN_BY = "Withdrawn by";
export const REASON = "Reason";
export const WITHDRAWN = "Withdrawn";

export const CHECK_NOW = "Check now";
export const CHECKING = "Checking…";
export const CONFIRM = "Confirm recall";
export const CONFIRMING = "Confirming…";

export const DISMISS_COPY = {
  trigger: "Dismiss",
  title: "Dismiss this possible match?",
  body: "Say why this battery is not the one the recall names. The match stays on the record, marked dismissed, with your reason.",
  reasonLabel: "Why is this not a match?",
  reasonRequired: "State the reason before dismissing.",
  confirm: "Dismiss match",
  confirming: "Dismissing…",
  cancel: "Cancel",
} as const;

export const WITHDRAW_COPY = {
  trigger: "Withdraw",
  title: "Withdraw this recall?",
  body: "Say why. The recall and its withdrawal both stay on the record. The battery stays where it is: moving it out of quarantine is a separate move, and air stays unavailable while any damaged-or-defective finding or other recall remains.",
  reasonLabel: "Why is the recall being withdrawn?",
  reasonRequired: "State the reason before withdrawing.",
  confirm: "Withdraw recall",
  confirming: "Withdrawing…",
  cancel: "Cancel",
} as const;

export const RECORD_RECALL = "Record a recall";
export const RECORD_TITLE = "Record a recall";
export const RECORD_BODY =
  "Record a recall you received outside the system. It counts as confirmed at once: the battery goes on the damaged, defective or recalled path, must be moved to quarantine, and cannot travel by air.";
export const RECORD_SOURCE = "Where it came from";
export const RECORD_REFERENCE = "Notice reference";
export const RECORD_TITLE_FIELD = "Recall title (optional)";
export const RECORD_SUBMIT = "Record recall";
export const RECORD_SUBMITTING = "Recording…";
export const CANCEL = "Cancel";

/** What a refused role is told it cannot do — the roles that can are named from the map (Rule 1.26). */
export const REFUSED_ACT = {
  check_now: "run a recall check",
  confirm: "confirm a recall",
  dismiss: "dismiss a possible recall match",
  withdraw: "withdraw a recall",
  record: "record a recall",
} as const;
