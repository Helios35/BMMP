/**
 * The audit log's page copy, in one place.
 *
 * It lives here rather than inline on the page because **the loading skeleton
 * renders the same sentence invisibly to take exactly the space the real one
 * will** (`UX_SPEC.md` §6.3). Inline, the two would drift the first time a word
 * changed, and the drift would be a silent 48px jump under the reader's thumb
 * rather than a failing assertion.
 */
export const AUDIT_PAGE_DESCRIPTION =
  "Every action this organization and this system took, newest first. The log is append-only: no one can edit or remove a row, and refused actions are recorded here alongside the ones that went through.";
