import type { TransportTestMarkingValue } from "@/domain/intake/field-validation";
import type { DraftFieldStatus } from "@/types/intake";
import type { IsoTimestamp, TimeZone } from "@/types/common";

/**
 * Every sentence the extraction review card speaks, in one place.
 *
 * `UX_SPEC.md` §2.1, §2.13, E-4 and E-5 fix most of these word for word and
 * the e2e specs assert them as whole rendered paragraphs. A paraphrase in a
 * component is a copy change nobody agreed to; a string here is greppable and
 * reviewable against the spec line it came from.
 *
 * Two things this file never says: that a camera identified a chemistry, and
 * anything resembling a probability of anything (Rules 1.25, 2.9;
 * `_ANCHORS.md` §7.1, §7.2). The unit test over this folder reads every
 * literal for both.
 */

/* ------------------------------------------------------------------ rows */

/** §2.1.2 — an illegible field reads as this, never a blank and never a dash. */
export const NOT_READ = "Not read";

/** §2.1.4(2) — the extracted value stays visible beneath a correction. */
export function readAsCaption(original: string): string {
  return `Read as: ${original}`;
}

/** Rule 2.12 — a value that failed shape validation shows what the model reported. */
export function modelReportedCaption(rawText: string): string {
  return `Model reported: ${rawText}`;
}

export const CONFIRM = "Confirm";
export const CONFIRM_CORRECTED = "Confirm corrected value";
export const CONFIRMING = "Confirming…";
export const CORRECT = "Correct";
export const CHANGE = "Change";
export const REJECT = "Reject";
export const REJECTING = "Rejecting…";
export const ENTER_VALUE = "Enter a value";
export const SAVE_ENTERED = "Save entered value";
export const SAVING_ENTERED = "Saving…";
export const LEAVE_EMPTY = "Leave empty";
export const CANCEL_EDIT = "Cancel";
export const REJECTED_NEEDS_VALUE =
  "Read rejected. Enter the value by hand, or leave it empty.";
export const REJECTED_NEEDS_VALUE_REQUIRED =
  "Read rejected. This field is required — enter the value by hand.";

/** The card's viewer is the one entering, so the badge reads *Entered by you*. */
export const ENTERED_BY_YOU = "you";

/** §2.1.7 — the status half of a row's accessible name. */
export const ROW_STATUS_TEXT: Readonly<Record<DraftFieldStatus, string>> = {
  pending: "not yet confirmed",
  confirmed: "confirmed",
  rejected: "rejected",
};

/** When no source badge renders, the accessible name says so rather than guessing one. */
export const NO_SOURCE_YET = "no source yet";

/** §2.1.7 — spoken before the band label. */
export const CONFIDENCE_PREFIX = "confidence";

/**
 * §2.1.3's tri-state for the transport test marking, labelled. The values are
 * the validator's (`TRANSPORT_TEST_MARKING_VALUES`) and are not a taxonomy
 * system; *could not tell* is a real value and is selectable.
 */
export const TRANSPORT_TEST_MARKING_LABELS: Readonly<
  Record<TransportTestMarkingValue, string>
> = {
  present: "Present",
  not_present: "Not present",
  could_not_tell: "Could not tell",
};

/** The decode line on the date-code row (Rule 2.24). */
export const DECODED_PREFIX = "Decoded";
export const UNDECODABLE = "Undecodable";

/* ------------------------------------------------------------- chemistry */

export const CHEMISTRY_UNSET = "Not set";
export const CHEMISTRY_HOW_TO_SET =
  "Pick a catalog match below, or enter the chemistry by hand.";
export const CHEMISTRY_SELECT_PLACEHOLDER = "Choose a chemistry";
export const CHEMISTRY_SELECT_LABEL = "Chemistry, entered by hand";
/** The characters the label printed. Characters only — not a chemistry (T-09). */
export function labelCharactersCaption(characters: string): string {
  return `Label characters: ${characters}`;
}
export const CHEMISTRY_REJECT_NOTE =
  "Rejecting a catalog-matched chemistry also clears the match.";

/* ---------------------------------------------------------- bulk confirm */

export const BULK_CONFIRM = "Confirm all high-confidence fields";
export const BULK_CONFIRMING = "Confirming…";
export const BULK_CONFIRM_NOTE =
  "Model, chemistry and assessed condition are always confirmed one at a time.";

/* ----------------------------------------------------------- gate banner */

/** §2.1.4(5), verbatim. */
export function needsReviewTitle(fieldsBelowThreshold: number): string {
  const noun = fieldsBelowThreshold === 1 ? "field" : "fields";
  return `Needs review — ${fieldsBelowThreshold} ${noun} below the confidence threshold. Nothing is saved until you confirm.`;
}
/** When no field is below threshold and the reasons are elsewhere (a weak match, say). */
export const NEEDS_REVIEW_TITLE_NO_FIELDS =
  "Needs review. Nothing is saved until you confirm.";
export const RESOLVE_NOW = "Resolve now";
export const SAVE_TO_QUEUE = "Save to review queue";
export const SAVING_TO_QUEUE = "Saving…";

/* ------------------------------------------------------------ action bar */

export const REJECT_READ = "Reject this read";
export const REJECT_READ_TITLE = "Discard everything read from this label?";
export const REJECT_READ_BODY =
  "Your photos are kept. You'll re-take the photo or enter the details by hand.";
export const REJECT_READ_CONFIRM = "Discard the read";
export const REJECT_READ_CONFIRMING = "Discarding…";
export const REJECT_READ_CANCEL = "Cancel";

export const PRIMARY_PENDING_DEFAULT = "Saving…";

/** §2.1.1 — the line under the primary while items remain. */
export function outstandingSummary(count: number): string {
  const noun = count === 1 ? "item" : "items";
  return `${count} ${noun} outstanding before you can continue`;
}

/* ------------------------------------------------------------------ void */

export const VOID_ITEM = "Void this item";
export const VOID_TITLE = "Void this item?";
export const VOID_BODY =
  "The session, its photos and its extraction are kept. A reason is required.";
export const VOID_REASON_LABEL = "Reason for voiding";
export const VOID_REASON_REQUIRED =
  "A reason is required before this can be voided.";
export const VOID_CONFIRM = "Void with this reason";
export const VOID_CONFIRMING = "Voiding…";
export const VOID_CANCEL = "Cancel";

/* ---------------------------------------------------------------- states */

export const READING_LABEL = "Reading label — about 5 seconds";
export const STILL_READING =
  "Still reading — you can wait or enter the details by hand";
/** §2.1.6 — after this many milliseconds the loading copy changes. A UI timing, not a rule. */
export const SLOW_READ_AFTER_MS = 20_000;
export const CANCEL_READ = "Cancel";
export const ENTER_MANUALLY = "Enter details manually";
export const TRY_AGAIN = "Try again";
export const READ_FAILED_TITLE = "The label could not be read.";
export const READ_FAILED_BODY =
  "Your photos are kept and nothing is lost. Try again, or enter the details by hand.";

/* ------------------------------------------------------------ no-read E-4 */

export const NO_READ_TITLE = "We couldn't read anything from this label.";
export const NO_READ_BODY =
  "The photo may be too blurred, too dark, at too steep an angle, or the label may be worn.";
export const NO_READ_RETAKE = "Re-take the photo";
export const NO_READ_ENTER = "Enter the details by hand";
export const NO_READ_SEARCH = "Search the catalog";
export const NO_READ_TIPS: readonly string[] = [
  "Fill the frame with the label.",
  "Avoid glare — try turning the torch off.",
  "Hold the phone parallel to the label.",
];

/* ---------------------------------------------------------- catalog §2.13 */

export const CATALOG_PANEL_TITLE = "Catalog match";
export const CATALOG_PANEL_NOTE =
  "A match is a suggestion. Nothing is chosen until you choose it, and every value it supplies still needs your confirmation.";
export function matchedOnSentence(matchedOnLabel: string): string {
  return `Matched on ${matchedOnLabel}`;
}
export const SEARCH_CATALOG = "Search the catalog";
export const CATALOG_MATCHING = "Matching against the catalog";
export const CATALOG_ERROR_TITLE = "The catalog could not be searched.";
export const CATALOG_RETRY = "Retry";
export const CATALOG_CONTINUE_WITHOUT = "Continue without a catalog match";
export const CATALOG_EMPTY_TITLE = "No catalog match found.";
export const CATALOG_EMPTY_BODY =
  "We read the label but this product isn't in the catalog yet. You can still log this battery.";
/** E-5's second line, verbatim. Discovering this at `/shipments/new` is a failure of this screen. */
export const CANNOT_SHIP_NOTE =
  "You can log this battery now. It can't go on a shipping paper until this product is in the catalog.";
export const CATALOG_ENTER_MANUALLY = "Enter details manually";
export const CATALOG_PROPOSE = "Propose a new catalog entry";
export const CATALOG_SELECTING = "Applying the match…";
export const CATALOG_TOP_CANDIDATE = "Closest match";

/* ---------------------------------------------------------------- header */

export const NOT_READ_YET = "Not read yet";
export const ENLARGE_CROP = "Enlarge the label crop";
export const NO_CROP_YET = "No label crop yet";

/**
 * `Read Aug 12, 2026, 09:41 PDT` — the zone is the site's, never the
 * browser's (Rule 4.29). `Intl` is the whole implementation.
 */
export function readAtLabel(instant: IsoTimestamp, timeZone: TimeZone): string {
  return `Read ${formatInstant(instant, timeZone)}`;
}

export function formatInstant(
  instant: IsoTimestamp,
  timeZone: TimeZone,
): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).format(new Date(instant));
}
