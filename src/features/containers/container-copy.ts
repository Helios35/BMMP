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

export const LABEL_NONE =
  "No label has been printed for this container. Label generation arrives with document generation.";
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
