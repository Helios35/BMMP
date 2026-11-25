import { isFilingDocumentType } from "@/domain/producer/filings";
import type { RoleCode } from "@/domain/taxonomy/role";

import { canReadRoute } from "./route-capability";

/**
 * Who may open a document of a type — Rules 5.27, 8.22; `SITE_ARCHITECTURE.md`
 * §5.2's note under the matrix.
 *
 * Every member reads documents (Rule 5.27), **except a filing packet or an
 * annual report, which follows `/obligations` access**: P2, P3, P5 and P6
 * read one; P1 and P4 can't. One test, read by `/documents/[id]` and both
 * document route handlers, so the page and the bytes can never disagree.
 */

/** The rule a refusal names (Rule 1.26). */
export const FILING_DOCUMENT_RULE = "8.22";

export function mayOpenDocumentType(
  role: RoleCode,
  documentType: string,
): boolean {
  return (
    !isFilingDocumentType(documentType) || canReadRoute(role, "/obligations")
  );
}

/** The refusal's words, citing the rule (Rule 1.26; UX §3.14). */
export const FILING_DOCUMENT_REFUSAL =
  "Your role can't open a filing packet or an annual report (Rule 8.22). A Facility Manager, a Producer Compliance Officer, an Auditor or an Admin can.";
