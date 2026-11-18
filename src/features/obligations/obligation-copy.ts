/**
 * The obligations page's own words — `UX_SPEC.md` §3.21. The rule-derived
 * sentences ("No producer rules on file…", "No date yet", the basis line)
 * live in `src/domain/producer/words.ts`, so the page, the panel and the CSV
 * say them the same way.
 */

export const CHECK_NOW = "Check now";
export const CHECKING = "Checking…";
export const EXPORT = "Export";

export const TAB_DEADLINES = "Deadlines";
export const TAB_STATES = "States";
export const TAB_PRODUCTS = "Products";

export const DEADLINES_CAPTION = "Obligation deadlines";
export const STATES_CAPTION = "States the products are sold in";
export const PRODUCTS_CAPTION = "Declared products";

export const ADD_PRODUCT = "Add product";
export const ADDING = "Adding…";
export const EDIT_STATES = "Edit states";
export const SAVING = "Saving…";
export const REMOVE = "Remove";
export const MARK_DONE = "Mark done";
export const REOPEN = "Reopen";

export const ZERO_PRODUCTS_TITLE = "No products yet";
export const ZERO_PRODUCTS_BODY =
  "Declare the products your organization makes or imports, and the states you sell them in. The obligations follow from the rule data on file.";
export const ZERO_PRODUCTS_WHO_CAN =
  "A Producer Compliance Officer or an Admin can add one.";
export const ZERO_DEADLINES_TITLE = "No dated deadlines";
export const ZERO_DEADLINES_BODY =
  "None of the obligations that apply carries a date yet. Open the States tab for each one.";

export const NOT_CHECKED_YET = "Not checked yet — press Check now.";
export const NO_STATES_SOLD = "Sold in no state";
export const CHOOSE_STATES = "States it is sold in";
export const CHOOSE_ENTRY = "Catalog entry";
export const ENTRY_PLACEHOLDER = "Choose a published entry";
export const NO_ENTRIES_LEFT =
  "Every published catalog entry is already declared. An Admin publishes new entries.";

export const MARK_DONE_BODY =
  "Record the date it was met and what was done. A later check never undoes this (Rule 8.12).";
export const DATE_MET = "Date it was met";
export const NOTE = "What was done";
export const NOTE_REQUIRED = "Say what was done — the note is required.";
export const REFERENCE = "Reference (optional)";
export const REFERENCE_HINT = "A filing number, a receipt, a membership id.";

export const REOPEN_COPY = {
  trigger: REOPEN,
  title: "Reopen this deadline",
  body: "It goes back to open, and its alerts come back on the next nightly check. Say why.",
  reasonLabel: "Why it is reopened",
  reasonRequired: "Say why it is reopened.",
  confirm: REOPEN,
  confirming: "Reopening…",
  cancel: "Cancel",
} as const;

export const REMOVE_COPY = {
  trigger: REMOVE,
  title: "Remove this product",
  body: "It stops counting toward any state's obligations. Deadlines already marked done stay done; open ones it alone carried are withdrawn. Say why.",
  reasonLabel: "Why it is removed",
  reasonRequired: "Say why it is removed.",
  confirm: REMOVE,
  confirming: "Removing…",
  cancel: "Cancel",
} as const;

export const ACT_REFUSAL =
  "Your role reads producer obligations and does not change them. A Producer Compliance Officer or an Admin can.";

export const STATE_PANEL_CLOSE = "Close";
export const STEWARDSHIP_HEADING = "Stewardship organizations";
export const OBLIGATIONS_HEADING = "Obligations";
export const PRODUCTS_IN_STATE = "Products sold here";
export const PRODUCT_RAN_BUT_CHECK_FAILED =
  "Saved. The check did not finish — press Check now.";
