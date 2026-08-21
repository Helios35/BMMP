/**
 * T-57 · Date code decode method
 *
 * **Stored on:** `date_code_decode.decoded_by_method`
 * **Cardinality:** single-select · **Phase:** B1a
 *
 * Records whether the manufacture date came from a deterministic decoder or from a person.
 *
 * **There are two values and there will never be a third.** **Date-code decoding
 * is deterministic and rules-based** (Rule 2.24); there is no machine-learning
 * path and `TECHNICAL_SPEC.md` §11.1 step 6.3 says so explicitly. **`ERD.md`
 * §5.6 states it as an absence:** no value in this set means "inferred by a
 * model."
 *
 * **A decoder is versioned and its version is stored**, so a decode reproduces
 * after the decoder changes.
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-57, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const DATE_CODE_DECODE_METHODS = [
  "deterministic_decoder",
  "human_entry",
] as const;

export type DateCodeDecodeMethod = (typeof DATE_CODE_DECODE_METHODS)[number];

/**
 * Stored value to display label. **The only place a T-57 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const DATE_CODE_DECODE_METHOD_LABELS: Readonly<
  Record<DateCodeDecodeMethod, string>
> = {
  deterministic_decoder: "Decoded by rule",
  human_entry: "Entered by hand",
};
