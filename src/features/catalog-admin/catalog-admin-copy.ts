/**
 * Every sentence `/settings/catalog` speaks — `UX_SPEC.md` §3.19,
 * `SITE_ARCHITECTURE.md` Flow F.
 *
 * Nothing here says a chemistry was detected from a photograph — a proposal's
 * chemistry is what a person entered on the manual path (Rule 2.10) — and
 * nothing here states a probability of anything (Rule 1.25).
 */

export const CATALOG_ADMIN_DESCRIPTION =
  "Review what handlers proposed from a catalog miss, against the photo and label crop they came from. Approving publishes the entry and raises matching records on the review queue for a person to confirm; it changes no record.";

export const PROPOSALS_SECTION = "Proposals";
export const PROPOSALS_DESCRIPTION =
  "Each proposal waits here until you approve or reject it, with a reason.";
export const ENTRIES_SECTION = "All entries";
export const ENTRIES_DESCRIPTION =
  "Every entry already decided. Published entries are available to intake matching.";

export const NO_PROPOSALS = "No proposals are waiting.";
export const NO_PROPOSALS_BODY =
  "Handlers propose an entry when a label matches nothing in the catalog.";

export function proposedByLine(name: string | null, at: string): string {
  return name === null ? `Proposed ${at}` : `Proposed by ${name}, ${at}`;
}

export const PHOTO_NOT_LINKED = "No intake photo is linked to this proposal.";
export const IMAGE_NOT_SERVED = "Image not available on the mock adapter.";

export const PROPOSAL_NOT_OPEN =
  "That proposal is no longer waiting. It was approved or rejected, or it never was.";

// --- approve ------------------------------------------------------------------------

export const APPROVE = "Approve entry";
export const APPROVE_TITLE = "Approve this catalog entry?";
export const APPROVE_BODY =
  "It becomes searchable at /catalog and available to intake matching. Records committed unmatched against the same identifying fields are raised on the review queue for a person to confirm. No record changes now.";
export const APPROVE_REASON_LABEL = "Reason for approving";
export const APPROVE_REASON_REQUIRED =
  "A reason is required before this entry can be approved.";
export const APPROVE_CONFIRM = "Approve with this reason";
export const APPROVING = "Approving…";

// --- reject -------------------------------------------------------------------------

export const REJECT = "Reject";
export const REJECT_TITLE = "Reject this proposal?";
export const REJECT_BODY =
  "A rejected entry never becomes available for matching; a corrected product is a new entry. The record it was proposed from keeps its identification.";
export const REJECT_REASON_LABEL = "Reason for rejecting";
export const REJECT_REASON_REQUIRED =
  "A reason is required before this proposal can be rejected.";
export const REJECT_CONFIRM = "Reject with this reason";
export const REJECTING = "Rejecting…";

export const CANCEL = "Cancel";

export function approvedNotice(raised: number): string {
  if (raised === 0) {
    return "Entry approved and published. No unmatched record carries the same identifying fields.";
  }
  return raised === 1
    ? "Entry approved and published. 1 record is raised on the review queue for a person to confirm the match."
    : `Entry approved and published. ${raised} records are raised on the review queue for a person to confirm the match.`;
}
export const REJECTED_NOTICE = "Proposal rejected. Nothing was published.";

// --- the Flow F raise, as the alert names it ----------------------------------------

export function rematchAlertTitle(recordNumber: string): string {
  return `${recordNumber} matches an approved catalog entry`;
}

export function rematchAlertBody(entryTitle: string): string {
  return `${entryTitle} was approved. Confirm the match on the review queue, or keep the record as it is identified. Nothing on the record has changed.`;
}

export const OPEN_ENTRY = "Open the entry";
export const PLATFORM_ENTRY = "Platform entry";
export const ORGANIZATION_ENTRY = "This organization";
