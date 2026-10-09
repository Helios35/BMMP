import { ROLE_LABELS, type RoleCode } from "@/domain/taxonomy/role";
import type { ShippingPaperPrecondition } from "@/domain/transport/shipping-paper";

/**
 * Every sentence `/shipments`, `/shipments/new` and `/shipments/[id]` speak —
 * `UX_SPEC.md` §3.11–§3.13, §2.6; E-2, E-9, E-14.
 *
 * **No regulatory string is here** (Rule 1.23): no emergency text, no
 * certification, no citation, no exception rule, no retention period. Those
 * are rule-version data and arrive in the payload. **No probability of
 * anything** (Rule 1.25). **A light-category shipment is never implied to need
 * no paperwork** (E-14) — every shipment needs a shipping paper (Rule 5.4).
 */

// --- /shipments --------------------------------------------------------------------

export const SHIPMENTS_DESCRIPTION =
  "Every movement off site, retained for the period the jurisdiction's rule supplies. Every shipment needs a shipping paper, whatever its waste classification.";
export const LIST_CAPTION = "Shipments";
export const LIST_SEARCH_PLACEHOLDER =
  "Search by shipment number or destination";
export const BUILD_A_SHIPMENT = "Build a shipment";
export const ZERO_SHIPMENTS_TITLE = "No shipments yet.";
export const ZERO_SHIPMENTS_BODY =
  "A shipment is built from containers that are labelled and ready to leave. Its shipping paper is generated before it departs.";
export const ZERO_SHIPMENTS_WHO_CAN =
  "A Compliance Handler or a Platform Admin builds a shipment.";
export const SHIPMENT_DETAIL_REASON =
  "Open the shipment to see its paper, contents and history.";

export const COLUMN_NUMBER = "Shipment";
export const COLUMN_DATE = "Departed";
export const COLUMN_DESTINATION = "Destination";
export const COLUMN_MODE = "Transport mode";
export const COLUMN_RECORDS = "Records";
export const COLUMN_CONTAINERS = "Containers";
export const COLUMN_PAPER = "Shipping paper";
export const COLUMN_STATUS = "Status";
export const NOT_DEPARTED = "Not departed";

export const PAPER_NONE = "Not generated";

// --- the stepper ---------------------------------------------------------------------

export const STEP_LABELS = {
  contents: "Contents",
  transport: "Transport",
  review: "Review and generate",
} as const;
export const STEPS_LABEL = "Shipment steps";
export const STEP_LOCKED_SELECT =
  "Choose at least one container that can ship before continuing.";
export const STEP_LOCKED_TRANSPORT =
  "Record the transport details to save the shipment before reviewing it.";
export const STEP_LOCKED_REVIEW =
  "Save the contents and the transport details to reach review.";

export const NEW_SHIPMENT_DESCRIPTION =
  "Choose the containers, record how they travel, and review the shipping paper before it is generated.";

// --- step 1 ----------------------------------------------------------------------------

export const CONTENTS_TITLE = "Containers";
export const CONTENTS_DESCRIPTION =
  "Choose the containers this shipment carries. A container that cannot ship says why.";
export const SUMMARY_TITLE = "In this shipment";
export const SUMMARY_NOTHING = "Nothing chosen yet.";
export const SUMMARY_RECORDS = "Records";
export const SUMMARY_CHEMISTRIES = "Chemistries";
export const SUMMARY_MASS = "Mass";
export const SUMMARY_ENERGY = "Energy";
export const SUMMARY_UNKNOWN_PART = "not recorded for every record";
export const SUMMARY_DAMAGED = "Damaged, defective or recalled";
export const SUMMARY_NO_DAMAGED = "None";
export const CONTINUE = "Continue";
export const SAVE_CONTENTS = "Save contents";
export const SAVING = "Saving…";
export const BACK = "Back";
export const VOIDS_PAPER_NOTICE =
  "This shipment's shipping paper is issued. Changing its contents voids that paper immediately — it is kept, marked void — and a new one must be generated (Rule 5.13).";
export const VOID_REASON_LABEL = "Why are the contents changing?";
export const VOID_REASON_REQUIRED =
  "State why. A voided paper records its reason (Rule 5.14).";
export const CONTENTS_CHANGED =
  "The containers changed since you chose them. Review the selection — nothing was saved.";

/** E-2 on step 1 — an explanatory state, never an empty list. */
export const ZERO_CONTAINERS_TITLE = "There are no containers to ship.";
export const ZERO_CONTAINERS_BODY =
  "A shipment is built from containers. Batteries are placed in a container when they are logged, and a container is labelled before it ships.";
export const OPEN_CONTAINERS = "Go to containers";

// --- step 2 ----------------------------------------------------------------------------

export const TRANSPORT_TITLE = "Transport";
export const TRANSPORT_DESCRIPTION =
  "How the shipment travels, who carries it, and where it goes.";
export const MODE_LEGEND = "Transport mode";
export const DESTINATION_LEGEND = "Destination";
export const CARRIER_LEGEND = "Carrier";
export const FIELD_FACILITY = "Facility name";
export const FIELD_LINE1 = "Street address";
export const FIELD_LINE2 = "Address line 2 (optional)";
export const FIELD_CITY = "City";
export const FIELD_REGION = "State or region";
export const FIELD_POSTAL = "Postal code";
export const FIELD_COUNTRY = "Country";
export const FIELD_DESTINATION_ID = "Receiving facility identifier (optional)";
export const FIELD_CARRIER = "Carrier name";
export const FIELD_CARRIER_ID = "Carrier identifier, where one is required";
export const SAVE_AND_REVIEW = "Save and review";

export const AIR_BLOCK_TITLE =
  "Air transport is not available for this shipment.";
export const AIR_MISSING_CITATION =
  "No citation is on file for this prohibition in the governing rule version. The block holds regardless; a Platform Admin must add the citation.";
export const AIR_UNAVAILABLE_TOOLTIP =
  "Air is unavailable: this shipment holds a damaged, defective or recalled battery.";
export const AIR_CHECK_FAILED =
  "We couldn't confirm this shipment's constraints. Air transport is unavailable until we can.";
export const RETRY = "Retry";
export const PATH_GROUND = "Ship by ground";
export const PATH_REMOVE = "Remove these records and ship the rest by air";
export const PATH_REASSESS = "Re-assess the damage on a record";

// --- step 3 ----------------------------------------------------------------------------

export const REVIEW_TITLE = "Review and generate";
export const CHECKLIST_TITLE = "Before the shipping paper can be generated";
export const CHECKLIST_COMPLETE =
  "Every precondition is met. The paper below is what will be issued.";
export function checklistUnmet(count: number): string {
  return count === 1
    ? "1 precondition is unmet. The shipping paper cannot be generated until it is."
    : `${count} preconditions are unmet. The shipping paper cannot be generated until they are.`;
}

export const PRECONDITION_TITLES: Readonly<
  Record<ShippingPaperPrecondition, string>
> = {
  contents: "Contents",
  identification: "Confirmed identification on every record",
  classification: "An active classification on every record",
  transport_mode: "No damage determination conflicting with the mode",
  emergency_contact: "A verified 24-hour emergency contact number",
  destination_and_carrier: "Destination and transporter details recorded",
  shipping_identifiers: "Shipping identifiers from the catalog",
  quantity: "A stated quantity on every line",
  container_labels: "A current label on every container",
  rule_data: "Rule data on file",
};

export const MET = "Met";
export const UNMET = "Not met";

/** "A Facility Manager or a Platform Admin can fix this." — from `ROLE_LABELS`, never a literal list. */
export function whoCanFix(roles: readonly RoleCode[]): string {
  const names = roles.map((role) => {
    const label = ROLE_LABELS[role];
    return `${/^[aeiou]/i.test(label) ? "an" : "a"} ${label}`;
  });
  if (names.length === 0) return "";
  const joined =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
  return `${joined?.charAt(0).toUpperCase()}${joined?.slice(1)} can fix this.`;
}
export const FIX_IN_SETTINGS = "Open organization settings";
export const FIX_IN_CATALOG = "Open catalog administration";
export const FIX_ON_REVIEW = "Open the review queue";
export const FIX_TRANSPORT = "Edit transport details";
export const FIX_CONTENTS = "Edit contents";

export const LINES_TITLE = "Lines";
export const CLASSIFICATION_TITLE = "Classification, per record";
export const PACKAGING_TITLE = "Packaging exception";
export const PACKAGING_NO_RULE =
  "No packaging-exception rule is on file for this site's jurisdiction, so none is applied. The shipment falls under the full packaging obligations (Rules 5.19, 5.20).";
export const PACKAGING_UNREADABLE =
  "A packaging-exception rule is on file in a form this version cannot read, so none is applied. The shipment falls under the full packaging obligations (Rules 5.19, 5.20).";

export const MANIFEST_TITLE =
  "A hazardous waste manifest is required and outstanding";
export function manifestBody(recordNumbers: readonly string[]): string {
  return (
    `${recordNumbers.join(", ")} ${recordNumbers.length === 1 ? "is" : "are"} classified fully regulated. ` +
    "BMMP documents these lines in full and does not produce the hazardous waste manifest in this version; it is produced outside BMMP. " +
    "This shipment is not fully documented until it is."
  );
}
export const MANIFEST_BADGE = "Manifest outstanding";

export const DDR_TITLE =
  "Damaged, defective or recalled batteries are on this shipment";
export function ddrBody(recordNumbers: readonly string[]): string {
  return (
    `${recordNumbers.join(", ")} ${recordNumbers.length === 1 ? "is" : "are"} on the damaged, defective or recalled path. ` +
    "Air transport is unavailable, and the damaged/defective packet must be issued before departure (Rule 6.16)."
  );
}

export const DRAFT_TITLE = "Draft — not valid, not issued";
export const DRAFT_DETAIL =
  "A draft is never a document. It satisfies nothing, never accompanies a shipment, and is never printed as valid (Rule 5.28).";
export const PAPER_GAP = "Not on file — the paper cannot be generated";

export const GENERATE = "Generate shipping paper";
export const GENERATING = "Generating…";
export const GENERATE_GATED =
  "Every precondition in the checklist must be met first.";
export const GENERATE_CONFIRM_TITLE = "Generate the shipping paper?";
export const GENERATE_CONFIRM_BODY =
  "The paper is issued exactly as previewed and is never edited afterwards. A change to the contents voids it; a correction is a new paper.";
export const GENERATE_CONFIRM = "Generate";
export const CANCEL = "Cancel";

// --- /shipments/[id] -------------------------------------------------------------------

export const TAB_PAPER = "Shipping paper";
export const TAB_CONTENTS = "Contents";
export const TAB_HISTORY = "History";
export const NO_PAPER_TITLE = "No shipping paper has been generated.";
export const NO_PAPER_BODY =
  "The shipment cannot depart without one. Review its checklist to see what is outstanding.";
export const REVIEW_CHECKLIST = "Review the checklist";
export const PAPER_VOIDED_TITLE = "This shipment's shipping paper was voided.";
export const PAPER_VOIDED_BODY =
  "Its contents changed after the paper was generated, or its transport details needed correcting. The voided paper is kept and readable; a new one must be generated before departure.";

/** D-58 item 8 — void with a reason, so transport details can be corrected. */
export const VOID_PAPER = "Void paper";
export const VOID_PAPER_TITLE = "Void the shipping paper?";
export const VOID_PAPER_BODY =
  "The paper is kept, still readable, and marked void with your reason and your name. The shipment returns to needing a new paper, and its transport details open for correction.";
export const VOID_PAPER_REASON = "Why is this paper being voided?";
export const VOID_PAPER_REASON_REQUIRED =
  "A void records its reason (Rule 5.14). State it to continue.";
export const VOID_PAPER_CONFIRM = "Void paper";
export const VOIDING_PAPER = "Voiding…";

/** D-58 item 9 — a draft is stored only when someone prints or downloads it. */
export const PRINT_DRAFT = "Open the draft to print";
export const DOWNLOAD_DRAFT = "Download draft";
export const DRAFT_STORED_NOTE =
  "Printing or downloading stores the draft as it stands, watermarked not valid on every page. It changes nothing on the checklist.";
export const PRIOR_PAPERS = "Earlier papers";
export const OPEN_DOCUMENT = "Open the document";

export const DEPART = "Record departure";
export const DEPARTING = "Recording…";
export const DEPART_TITLE = "Record this shipment's departure?";
export const DEPART_BODY =
  "Departure records the date, time zone and who recorded it. The storage clocks of the containers on this shipment stop, the records move to shipped, and the retention period is stamped from the jurisdiction's rule. It cannot be undone.";
export const DEPART_CONFIRM = "Record departure";
export const ARRIVE = "Record arrival";
export const ARRIVING = "Recording…";
export const ARRIVE_TITLE = "Record this shipment's arrival?";
export const ARRIVE_BODY =
  "Arrival closes the shipment and moves its records to closed out, which is final.";
export const ARRIVE_REFERENCE = "Receipt reference (optional)";
export const ARRIVE_CONFIRM = "Record arrival";
export const CHANGE_CONTENTS = "Change contents";
export const CONTINUE_SHIPMENT = "Continue building";

export const CONTENTS_CONTAINERS = "Containers";
export const CONTENTS_RECORDS = "Records";
export const HISTORY_RENDERS = "Every render";
export const HISTORY_AUDIT = "Audit trail";
export const HISTORY_AUDIT_ROLES =
  "The audit trail is read by a Facility Manager, an Auditor / Underwriter or a Platform Admin.";
export const NO_AUDIT_ROWS = "No audit events are recorded for this shipment.";
export const NO_RENDERS = "No document has been rendered for this shipment.";
export const RETENTION_LABEL = "Retained until";
export const RETENTION_PENDING = "Stamped at departure";
export const BLOCKED_AIR_ATTEMPT = "Last refused air request";
