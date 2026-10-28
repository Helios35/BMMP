/**
 * The words on `/containers` and `/containers/[id]` — `UX_SPEC.md` §3.9,
 * §3.10, E-2, E-6, E-7; `SITE_ARCHITECTURE.md` §5.4.
 *
 * One file, so a sentence a test asserts on is the sentence the screen shows.
 * **No period, offset, limit or regulatory phrase is written here** — every
 * number on these screens arrives from a clock, a rule version or a stored row
 * (Rules 1.23, 4.5, 4.18). No sentence states or implies a probability of
 * anything (Rule 1.25).
 */

/** `SITE_ARCHITECTURE.md` §5.4 — for P3, P4 and P5 on a container row, verbatim. */
export const CONTAINER_DETAIL_ROLES_REASON =
  "Container detail requires the Handler, Facility Manager or Admin role.";

/** The unit `container.current_net_mass_kg` and `capacity_kg` are stored in (`ERD.md` §6.1). */
export const CONTAINER_MASS_UNIT = "kg";

export const LIST_CAPTION = "Containers";
export const LIST_SEARCH_PLACEHOLDER = "Search by container ID or location";
export const NEW_CONTAINER = "New container";

/** E-2 on `/containers`. */
export const ZERO_CONTAINERS_TITLE =
  "No containers yet. Create one to start a storage clock.";
export const ZERO_CONTAINERS_WHO_CAN =
  "A Handler, a Facility Manager or an Admin can create one.";

export const COLUMN_ID = "Container";
export const COLUMN_TYPE = "Type";
export const COLUMN_LOCATION = "Location";
export const COLUMN_RECORDS = "Records";
export const COLUMN_FILL = "Fill";
export const COLUMN_CLOCK = "Storage clock";
export const COLUMN_STATUS = "Status";

export const NO_LOCATION = "No location recorded";
export const NO_CLOCK_EMPTY = "No clock running — this container is empty";
export const CYCLE_ENDED =
  "Emptied — this container's accumulation cycle has ended.";

export const TAB_CONTENTS = "Contents";
export const TAB_LABEL = "Label";
export const TAB_HISTORY = "History";

/** §3.10 — the two compliance flags that block shipping, on the header. */
export const FLAG_NO_LABEL_TITLE = "No current printed label";
export const FLAG_NO_LABEL_BODY =
  "This container holds batteries and has no label in force. It cannot be added to a shipment until it is labelled.";
export const FLAG_MISLABELLED_TITLE = "Mislabelled";
export function mislabelledBody(printed: string, current: string): string {
  return `The printed label shows an accumulation start of ${printed}; the container's is ${current}. It must be relabelled before a shipment can be built from it.`;
}
export const FLAG_DAMAGED_TITLE = "Damaged or defective contents";
export const FLAG_DAMAGED_BODY =
  "At least one battery in this container carries a damaged-or-defective flag.";

/** §3.10 — never a re-date control; the reason there is none, stated once. */
export const START_DATE_NOTE =
  "The accumulation start date is set by the first placement and travels with the batteries. Moving, consolidating or splitting never makes it later.";

export const SHIP_THIS_CONTAINER = "Ship this container";
export const MARK_READY_TO_SHIP = "Mark ready to ship";
export const RETIRE_CONTAINER = "Retire container";
export const EDIT_DETAILS = "Edit capacity and location";
export const RECORD_STORAGE_EVENT = "Record a storage event";
export const RECORD_REMEDIATION = "Record a remediation";

export const MOVE = "Move";
export const SPLIT = "Split into a new container";
export const CONSOLIDATE = "Consolidate into…";

export const CONTENTS_EMPTY =
  "This container holds nothing. The storage clock starts when the first battery goes in.";
export const CONTENTS_CAPTION = "Batteries in this container";

export const LABEL_NONE = "No label has been printed for this container.";
export const LABEL_GENERATE = "Generate label";
export const LABEL_GENERATE_NEW = "Generate a new label";
export const LABEL_GENERATING = "Generating…";
export const LABEL_CONFIRM_TITLE = "Generate the container label?";
export const LABEL_CONFIRM_BODY =
  "The label is issued with the wording, contents and start date the records hold now, and is never edited afterwards. Print it from the label that opens next.";
export const LABEL_CONFIRM_SUPERSEDES =
  "The label in force is kept, still readable, and marked superseded by this one (Rules 4.20, 5.15).";
export const LABEL_CONFIRM = "Generate";
export const LABEL_CANCEL = "Cancel";
export const LABEL_BLOCKED_TITLE = "The label cannot be generated yet";
export const LABEL_BLOCKED_GATED =
  "Everything listed under the label must be in place first.";
export const LABEL_OPEN = "Open the label";
export const LABEL_REGENERATE_FLAG =
  "The label no longer matches this container. A person must print a new one before it ships.";

export const HISTORY_EMPTY =
  "Nothing has been recorded against this container yet.";
export const HISTORY_CAPTION = "Storage events and audit events";

export const REMEDIATION_TITLE = "Record a remediation";
export const REMEDIATION_BODY =
  "State what was done with this container's contents, and why. A remediation is an audited event. It does not change the accumulation start date, and the container stays overdue.";
export const REMEDIATION_REASON_LABEL = "What was done, and why";
export const REMEDIATION_REASON_REQUIRED =
  "A remediation is never recorded without a statement.";

export const STORAGE_EVENT_TITLE = "Record a storage event";
export const STORAGE_EVENT_BODY =
  "An inspection of this container, recorded to its history. It changes no date and no status.";

// --- lots — T-25; Rules 4.23, 4.24 ----------------------------------------------

/** `/containers`' two views — the containers, and the lots that group them. */
export const VIEW_CONTAINERS = "Containers";
export const VIEW_LOTS = "Lots";
export const LOTS_CAPTION = "Lots";
export const LOTS_SEARCH_PLACEHOLDER = "Search lot or description";
export const LOT_COLUMN_ID = "Lot";
export const LOT_COLUMN_DESCRIPTION = "Description";
export const LOT_COLUMN_CONTAINERS = "Containers";
export const LOT_COLUMN_EARLIEST = "Earliest accumulation start";
export const LOT_COLUMN_STATUS = "Status";
export const LOT_COLUMN_ACTIONS = "Actions";
export const LOT_NO_DESCRIPTION = "No description";
export const LOT_NO_CONTAINERS = "None";
export const LOT_NO_START = "No battery placed yet";
export const LOT_OVERDUE =
  "Overdue — a container in this lot is past its accumulation period (Rule 4.24).";
/** A lot row does not open: a lot has no route of its own (no 21st route). */
export const LOT_HAS_NO_PAGE =
  "A lot has no page of its own. Its containers are named in the row.";
export const LOT_NO_CLOCK_NOTE =
  "A lot is a grouping, not a place. It has no fill level or clock of its own; it reports its containers' (Rules 4.23, 4.24).";
export const ZERO_LOTS_TITLE = "No lots yet.";
export const ZERO_LOTS_BODY =
  "A lot groups containers for shipping and reporting. Start one here, or when you log a battery.";
export const ZERO_LOTS_WHO_CAN =
  "A Compliance Handler or an Admin can start one.";

export const NEW_LOT = "New lot";
export const NEW_LOT_TITLE = "Start a new lot";
export const NEW_LOT_BODY =
  "The lot opens empty. Add containers to it from each container's page, or when you log a battery.";
export const NEW_LOT_DESCRIPTION_LABEL = "Description (optional)";
export const NEW_LOT_CONFIRM = "Start the lot";
export const NEW_LOT_CONFIRMING = "Starting…";
export const CANCEL = "Cancel";

export const CLOSE_LOT = "Close";
export const CLOSING_LOT = "Closing…";
export const REOPEN_LOT = "Reopen";
export const REOPENING_LOT = "Reopening…";
export const DISSOLVE_LOT = "Dissolve";
export const DISSOLVE_LOT_TITLE = "Dissolve this lot?";
export const DISSOLVE_LOT_BODY =
  "Its containers leave the lot and keep everything else as it is. The lot stays on record as dissolved, and cannot be used again.";
export const DISSOLVE_LOT_CONFIRM = "Dissolve the lot";
export const DISSOLVING_LOT = "Dissolving…";

/** `/containers/[id]`'s lot field. */
export const FIELD_LOT = "Lot";
export const NOT_IN_A_LOT = "Not in a lot";
export const ADD_TO_LOT = "Add to a lot";
export const ADD_TO_LOT_LABEL = "Lot";
export const ADD_TO_LOT_CHOOSE = "Choose an open lot";
export const ADD_TO_NEW_LOT = "Start a new lot with this container";
export const ADDING_TO_LOT = "Adding…";
export const REMOVE_FROM_LOT = "Remove from lot";
export const REMOVING_FROM_LOT = "Removing…";
