/**
 * The words on `/documents/[id]` and the embedded document viewers —
 * `UX_SPEC.md` §2.8, §3.14. One file, so a sentence a test asserts on is the
 * sentence the screen shows. No regulatory text, and no probability of
 * anything (Rule 1.25).
 */

export function voidedDetail(record: {
  readonly at: string;
  readonly actor: string;
  readonly reason: string | null;
}): string {
  const reason = record.reason === null ? "" : ` Reason: ${record.reason}`;
  return `Voided ${record.at} by ${record.actor}.${reason}`;
}

export const VOIDED_DETAIL_ELSEWHERE =
  "The reason and who voided it are recorded in the audit log.";

export const DRAFT_RENDER_DETAIL =
  "A draft is never a document. It satisfies nothing, never accompanies a shipment, and is watermarked not valid on every page (Rule 5.28).";

export const NO_STORED_FILE =
  "No stored file exists for this render — it was recorded before document generation. The page below is composed from its stored rows; it is not the issued file, and it has no verification code to check.";

export const INTEGRITY_FAILED_TITLE =
  "This document failed its integrity check";
export const INTEGRITY_FAILED_BODY =
  "Its stored bytes no longer match the hash recorded when it was issued, so it is not shown, printed or downloaded. The record it belongs to is still readable.";
export const OPEN_SOURCE_RECORD = "Open the record it belongs to";

export const VERIFY_TITLE = "Check a paper copy";
export const VERIFY_BODY =
  "Type the verification code printed in the footer of a paper copy. It is checked against this render's stored input.";
export const VERIFY_LABEL = "Verification code";
export const VERIFY_SUBMIT = "Check code";
export const VERIFY_CHECKING = "Checking…";
export const VERIFY_MATCH = "Match";
export function verifyMatchBody(status: string): string {
  return `The code is this render's. The paper was printed from this document, which is ${status.toLowerCase()}.`;
}
export const VERIFY_NO_MATCH = "No match";
export const VERIFY_NO_MATCH_BODY =
  "The code is not this render's. The paper was not printed from this document — check the code, or the document it came from.";
export const VERIFY_EMPTY = "Type the code from the paper first.";
