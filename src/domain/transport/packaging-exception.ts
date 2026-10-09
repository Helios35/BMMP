import type { ResolvedRule } from "@/domain/rules/resolve";
import type { PackagingException } from "@/domain/taxonomy/packaging-exception";

/**
 * Packaging-exception eligibility — `BUSINESS_RULES.md` Rules 5.19, 5.20; T-20.
 *
 * **The system never assumes eligibility.** Eligibility is rule data evaluated
 * from the shipment's mode, destination type and contents under the version in
 * force on the shipment date (Rule 5.19). No version of that rule is on file,
 * and no payload schema for it has been authored, so this module can only ever
 * answer one way: **no exception was applied**, with the reason it could not
 * be determined stated beside it. A shipment that does not qualify falls back
 * to the full packaging obligations (Rule 5.20) — which is what `none` records.
 *
 * When planning authors the rule and its schema, the evaluator is written
 * here against that schema, and nothing about the answer below changes for a
 * shipment that does not qualify.
 */

export type PackagingExceptionBasis =
  /** No version of the rule is on file for the site's jurisdiction. */
  | "no_rule_on_file"
  /** A version is on file, in a schema this version does not read. */
  | "rule_not_readable";

/** Recorded on the shipment and the paper (Rule 5.19). A plain-data shape — it is stored. */
export type PackagingExceptionDetermination = {
  readonly exceptions: readonly PackagingException[];
  readonly basis: PackagingExceptionBasis;
  /** The citation of the version on file, where there is one. */
  readonly citation: string | null;
  readonly ruleVersionId: string | null;
};

export function determinePackagingException(
  resolved: ResolvedRule | null,
): PackagingExceptionDetermination {
  if (resolved === null) {
    return {
      exceptions: ["none"],
      basis: "no_rule_on_file",
      citation: null,
      ruleVersionId: null,
    };
  }
  return {
    exceptions: ["none"],
    basis: "rule_not_readable",
    citation: resolved.version.citation,
    ruleVersionId: resolved.version.ruleVersionId,
  };
}
