import type { DdrFlag } from "@/domain/taxonomy/ddr-flag";
import type { RecallMatchStatus } from "@/domain/taxonomy/recall-match-status";

/**
 * The `recalled` DDR flag — T-30, T-35; Rules 6.5, 6.24, 10.14, 10.16.
 *
 * **`recalled` is owned by the recall path and nothing else.** A damage
 * assessment sets and clears `damaged` and `defective` and never touches
 * `recalled`; a recall decision sets and clears `recalled` and never touches
 * the other two. The air prohibition follows the whole set: any flag removes
 * air, so **air reopens only when the damage assessment and every recall
 * association are clear** — withdrawing a recall is not a route around Rule
 * 6.7 (Rule 6.24).
 */

/** Whether any confirmed recall remains — the only thing that holds `recalled` (Rule 10.16). */
export function holdsRecalledFlag(
  matches: readonly { readonly status: RecallMatchStatus }[],
): boolean {
  return matches.some((match) => match.status === "confirmed_match");
}

/** The record's flags with `recalled` set or cleared, the others untouched. */
export function withRecalledFlag(
  flags: readonly DdrFlag[],
  recalled: boolean,
): readonly DdrFlag[] {
  const others = flags.filter((flag) => flag !== "recalled");
  return recalled ? [...others, "recalled"] : others;
}

/**
 * The record's flags after a damage determination: `damaged` and `defective`
 * from the assessment, `recalled` carried over from what the record holds.
 */
export function withDamageFlags(
  current: readonly DdrFlag[],
  fromAssessment: readonly DdrFlag[],
): readonly DdrFlag[] {
  const damage = fromAssessment.filter((flag) => flag !== "recalled");
  return current.includes("recalled") ? [...damage, "recalled"] : damage;
}

/** Any DDR flag removes air transport (Rules 6.7, 6.8). */
export function prohibitsAir(flags: readonly DdrFlag[]): boolean {
  return flags.length > 0;
}
