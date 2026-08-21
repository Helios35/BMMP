/**
 * The Terms of Service document a sign-up acceptance is recorded against.
 *
 * **Rule 7.5 — every acceptance records the exact version accepted.** So the key
 * and the version are values the acceptance carries, never something inferred
 * later from "whatever is current now". They live here as one pair rather than
 * being typed at each call site, because two call sites are two versions and the
 * row is permanent and never edited.
 *
 * **This is product configuration, not a jurisdiction value.** Rule 1.23 governs
 * thresholds, deadlines, retention periods and citations; a document key and a
 * version string are none of those. When Terms of Service versioning ships
 * (Rules 7.12–7.15) this pair is read from the published document rather than
 * declared, and this module is where that change lands.
 *
 * `TERMS_DOCUMENT_VERSION` matches the version the fixtures already carry, so a
 * founding sign-up and a fixture organization are governed by the same terms.
 */

export const TERMS_DOCUMENT_KEY = "terms_of_service";
export const TERMS_DOCUMENT_VERSION = "2026-06";

/**
 * Where the full text opens, in a new tab — and **never the only place the grant
 * is stated** (`UX_SPEC.md` §3.2).
 *
 * **Null, and deliberately so.** No canonical document gives the Terms of
 * Service a location, and `_ANCHORS.md` §5 fixes the B1a page list at twenty
 * routes — a `/legal/*` page would be a twenty-first, which is a decision-log
 * entry rather than a builder's call. A link to a page that does not exist is
 * worse than no link on the one control that carries a legal grant, so the form
 * renders the link only when this is set and the label carries the grant in full
 * either way. Raised as OQ-1a with the copy itself.
 */
export const TERMS_DOCUMENT_HREF: string | null = null;

/**
 * The visible label on the sign-up checkbox — **the single most legally loaded
 * string in the product.**
 *
 * `UX_SPEC.md` §3.2 requires the data training-rights grant **in the visible
 * label, not behind a link alone**, and no canonical document fixes the words.
 * This unit writes them; it does not settle them. Flagged as OQ-1 and routed
 * past counsel before Gate 1 alongside OQ-3 and OQ-12.
 *
 * Binding on it, and none of these is a style preference:
 *
 * - The checkbox is required. There is no "skip", no "decide later", no
 *   pre-check (Rule 7.1).
 * - It is one `<label>` with the link inline, and **the sentence reads correctly
 *   with the link removed** — which is why the grant is spelled out here and the
 *   link only opens the full text.
 * - The second sentence is Rule 7.3: acceptance is made by a member holding the
 *   organization's binding authority, and the founding member created here is
 *   the first holder (Rules 1.8, 7.3; D-35).
 */
export const TERMS_CHECKBOX_LEAD =
  "I accept the Terms of Service and grant Next Sketch the right to use the battery photographs, label readings and confirmed identifications submitted by this organization to train and improve its models.";

export const TERMS_CHECKBOX_AUTHORITY =
  "I have authority to accept on this organization's behalf.";

export const TERMS_LINK_TEXT = "Read the Terms of Service";

/** Rule 7.5 — stated beneath the label, at caption size, and **not part of the label**. */
export const TERMS_RECORD_NOTE =
  "Recorded permanently with the version, the time and your name.";
