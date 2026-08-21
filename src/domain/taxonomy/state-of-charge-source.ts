/**
 * T-55 · State-of-charge source
 *
 * **Stored on:** `battery_record.soc_source`
 * **Cardinality:** single-select · **Phase:** B1a
 *
 * Records how the state of charge at intake was established, since it is an input to hazard ranking at B2 and a handler's estimate and a meter reading are not the same evidence.
 *
 * **Single-select**, recorded alongside `state_of_charge_band` (T-21) and
 * `state_of_charge_percent_at_intake` at step 3 (Rule 2.26).
 *
 * **`not_observable` is a legitimate answer, not a failure.** It is the correct
 * value for a pack with no indicator and no accessible terminals, and it must
 * never be replaced with a default band or a guessed percentage.
 *
 * **None of these is a health measurement.** State of charge is not state of
 * health, and this column never contributes to a claim about condition
 * (Rule 2.27; `_ANCHORS.md` §7.5).
 *
 * **This value never contributes to a probability of ignition** — no such output
 * exists anywhere in the product (Rule 1.25).
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-55, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const STATE_OF_CHARGE_SOURCES = [
  "device_indicator",
  "handheld_meter",
  "handler_estimate",
  "not_observable",
] as const;

export type StateOfChargeSource = (typeof STATE_OF_CHARGE_SOURCES)[number];

/**
 * Stored value to display label. **The only place a T-55 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const STATE_OF_CHARGE_SOURCE_LABELS: Readonly<
  Record<StateOfChargeSource, string>
> = {
  device_indicator: "Read from an indicator",
  handheld_meter: "Read with a meter",
  handler_estimate: "Handler's estimate",
  not_observable: "Not observable",
};
