/**
 * How recall matching reads a name — Rule 10.12, Rule 1.23; D-73.
 *
 * **The normalization and the component terms are configuration, not code.**
 * Which words a maker's name may carry without changing who the maker is
 * (`Inc`, `LLC`), and which words in a vehicle recall's component mean the
 * propulsion or traction battery, are versioned platform configuration read
 * through `platformConfiguration.readRecallMatchConfiguration` and handed in.
 * This module holds the shape and its validation; no word list lives here.
 *
 * The version is stamped on every check run, so a match can be re-explained
 * after the list changes (Rule 12.15).
 */

export interface RecallMatchConfiguration {
  readonly configurationVersion: string;
  /**
   * Whole words dropped from a maker's name before it is compared — a legal
   * suffix is not part of who made the battery. Compared case-insensitively.
   */
  readonly makerWordsIgnored: readonly string[];
  /**
   * A vehicle recall is a candidate only when its component names the
   * propulsion or traction battery (Rule 10.12). A component containing any of
   * these phrases does; compared case-insensitively, as phrases.
   */
  readonly tractionBatteryComponentTerms: readonly string[];
}

export type RecallMatchConfigurationValidation =
  | { readonly ok: true; readonly configuration: RecallMatchConfiguration }
  | { readonly ok: false; readonly issues: readonly string[] };

function isWordList(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "string" && item.trim() !== "")
  );
}

/**
 * A missing or malformed row is a loud failure, never a permissive default:
 * an empty component list would make every vehicle recall a non-candidate,
 * and that reads as "no match" on a record that has one.
 */
export function validateRecallMatchConfiguration(
  value: unknown,
): RecallMatchConfigurationValidation {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, issues: ["configuration is not an object"] };
  }
  const row = value as Record<string, unknown>;
  const issues: string[] = [];
  const version = row.configurationVersion;
  if (typeof version !== "string" || version.trim() === "") {
    issues.push("configurationVersion must be a non-empty string");
  }
  if (!isWordList(row.makerWordsIgnored)) {
    issues.push("makerWordsIgnored must be a list of non-empty words");
  }
  const terms = row.tractionBatteryComponentTerms;
  if (!isWordList(terms) || terms.length === 0) {
    issues.push(
      "tractionBatteryComponentTerms must be a non-empty list of phrases",
    );
  }
  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    configuration: {
      configurationVersion: version as string,
      makerWordsIgnored: row.makerWordsIgnored as readonly string[],
      tractionBatteryComponentTerms: terms as readonly string[],
    },
  };
}
