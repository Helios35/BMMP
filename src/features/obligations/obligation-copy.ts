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
export const TAB_SALES = "Sales";

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

// --- Sales (Rule 8.17) -----------------------------------------------------------------------

export const SALES_CAPTION = "Units sold, by product, state and year";
export const RECORD_SALES = "Record sales";
export const RECORDING = "Recording…";
export const SALES_YEAR = "Year";
/** The year filter's default — short enough for the filter's width. */
export function latestYearLabel(year: number): string {
  return `${String(year)} (latest)`;
}
export const SALES_BODY =
  "Units sold, offered for sale or distributed in or into the state that calendar year — a whole number, zero allowed. Weight and energy are worked out from the catalog entry, never typed.";
export const SALES_PAIR = "Product and state";
export const SALES_PAIR_PLACEHOLDER = "Choose a product and state";
export const SALES_UNITS = "Units";
export const SALES_UNITS_HINT =
  "A whole number. Zero is an entry; a blank is not.";
export const SALES_NOTE = "Where the number came from";
export const SALES_NOTE_HINT =
  "A distributor report, an order ledger, an estimate and its basis.";
export const SALES_NOTE_REQUIRED =
  "Say where the number came from — the note is required.";
export const SALES_UNITS_REQUIRED = "Units are a whole number, zero or more.";
export const SALES_REPLACED = "Replaced";
export const SALES_NOT_ON_FILE_FIXER =
  "No entry for this year. A missing entry is never read as zero.";
export const ZERO_SALES_TITLE = "No products to record sales for";
export const SALES_ACT_REFUSAL =
  "Your role reads the sales dataset and does not change it. A Producer Compliance Officer or an Admin can record sales.";

// --- Packets (Rules 8.19–8.21) ---------------------------------------------------------------

export const MAKE_PACKET = "Make packet";
export const ISSUE_PACKET = "Issue packet";
export const ISSUING = "Issuing…";
export const PREPARING = "Preparing the packet…";
export const PACKET_PERIOD = "Period";
export const PACKET_YEAR = "Calendar year this report covers";
export const PACKET_YEAR_PLACEHOLDER = "Pick a year";
export const PACKET_ITEMS = "What the filing asks for";
export const PACKET_ISSUED = "Issued. It did not mark the deadline done.";
export const OPEN_PACKET = "Open the packet";
export const PACKETS_UNDER_DEADLINE = "Packets";
export const PACKET_NO_DRAFT =
  "Issuing stores the packet as a document, with the rule versions and the sales it used. There is no draft; a later change means a new packet that replaces this one.";
export const EVIDENCE = "Evidence (optional)";
export const EVIDENCE_NONE = "No packet";
export const EVIDENCE_HINT =
  "Link an issued packet of this deadline as what was filed. A packet never marks a deadline done on its own.";

// --- A product's plan (Rule 8.23) ------------------------------------------------------------

export const PLAN = "Plan";
export const PLAN_HEADING = "Every duty this product carries, by date";
export const PLAN_EMPTY =
  "No obligation applies to this product in the states it is sold in.";
export const PLAN_CANT_TELL =
  "Can't tell yet whether these apply to this product";
