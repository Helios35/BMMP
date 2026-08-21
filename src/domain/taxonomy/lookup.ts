/**
 * The shared read helpers every classification system is read through.
 *
 * `TAXONOMY.md` §5.3 says each system module exports exactly three things — the
 * value list, the union type and the label lookup. These helpers live here so
 * that stays true: one generic reader used by every system, rather than
 * forty-seven near-identical `isX()` functions that will eventually disagree.
 *
 * §5.7 lists "a second lookup of the same system anywhere in the codebase" as a
 * review rejection. Reading a label goes through `labelFor` and the system's own
 * lookup, always.
 */

/**
 * A value the codebase does not recognise, carried alongside what was stored.
 *
 * Every read path must tolerate one — from a value retired in a later taxonomy
 * version, from a newer deployment, or from an import (`TAXONOMY.md` §5.8).
 */
export interface UnrecognisedTaxonomyValue {
  readonly recognised: false;
  /** The value exactly as stored. Rendered as-is; never blanked, never coerced. */
  readonly storedValue: string;
}

export interface RecognisedTaxonomyValue<T extends string> {
  readonly recognised: true;
  readonly storedValue: T;
  readonly label: string;
}

export type TaxonomyRead<T extends string> =
  RecognisedTaxonomyValue<T> | UnrecognisedTaxonomyValue;

/**
 * Whether a stored string is a value this build knows about.
 *
 * A `false` answer is not an error. It means the row holds a value retired in a
 * later taxonomy version or written by a newer deployment, and §5.8 is explicit
 * about what happens next: **render it, do not crash; never coerce it to a
 * default; never filter it out of a count.** Silently reading a retired
 * `light_category_v1` as `light_category` fabricates a compliance record, and a
 * record that vanishes from a total because its value was unrecognised is the
 * worst possible failure in an audit export.
 */
export function isTaxonomyValue<T extends string>(
  values: readonly T[],
  storedValue: string,
): storedValue is T {
  return (values as readonly string[]).includes(storedValue);
}

/**
 * Read a stored value against its system, keeping an unrecognised one intact.
 *
 * The caller gets a discriminated result rather than a label-or-fallback string,
 * so "this value is not one we know" is a state a surface has to handle
 * deliberately — which is what §5.8 asks for and what a silent `?? "Unknown"`
 * would quietly skip.
 */
export function readTaxonomyValue<T extends string>(
  values: readonly T[],
  labels: Readonly<Record<T, string>>,
  storedValue: string,
): TaxonomyRead<T> {
  if (isTaxonomyValue(values, storedValue)) {
    return { recognised: true, storedValue, label: labels[storedValue] };
  }
  return { recognised: false, storedValue };
}

/**
 * The display label for a recognised stored value.
 *
 * Typed so it cannot be called with an unrecognised string — reach for
 * `readTaxonomyValue` when the input came out of a database column rather than
 * out of the type system.
 */
export function labelFor<T extends string>(
  labels: Readonly<Record<T, string>>,
  storedValue: T,
): string {
  return labels[storedValue];
}

/**
 * A system's values paired with their labels, in the order the value list
 * declares — which is the display order (`TAXONOMY.md` §5.7).
 *
 * Sorting a user-facing list by stored value is a review rejection: alphabetical
 * order of machine strings is meaningless to a user.
 */
export function optionsFor<T extends string>(
  values: readonly T[],
  labels: Readonly<Record<T, string>>,
): readonly { readonly value: T; readonly label: string }[] {
  return values.map((value) => ({ value, label: labels[value] }));
}
