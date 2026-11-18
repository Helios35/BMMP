import type { HazardRankingScope } from "@/domain/taxonomy/hazard-ranking-scope";
import type { IsoTimestamp, TimeZone, Uuid } from "@/types/common";

import {
  bandLabel,
  factorLabel,
  hazardRankingStanding,
  rankingFactorsText,
  rankingPositionText,
  rankingSummaryText,
  whyStatements,
  type HazardRankingStandingKind,
  type RankingWords,
} from "./explain";
import { comparisonSetText, type CurrentItemState } from "./run";
import {
  basisInstant,
  CHANGED_SINCE,
  NOT_RANKED_EMPTY,
  NOT_RANKED_NOT_HELD,
  NOT_RANKED_YET,
  shortPositionText,
} from "./words";

/**
 * One item's ranking, ready to show or export — Rules 10.24, 10.25; T-33.
 *
 * **Never a band without its set, its size and its as-of time** (T-33): a
 * ranked view carries all three, and a view with no ranking says why in
 * words. The panel, the list cell and the CSV all read this one shape.
 */

/** The parts of a stored row a view reads. */
export interface RankingRowInput extends RankingWords {
  readonly scopeType: HazardRankingScope;
  readonly batteryRecordId: Uuid | null;
  readonly containerId: Uuid | null;
  readonly lotId: Uuid | null;
  readonly basisStatement: string;
  readonly schemeVersion: string;
  readonly inputsSignature: string;
  readonly computedAt: IsoTimestamp;
}

export interface RankedFactorView {
  readonly code: string;
  readonly label: string;
  readonly level: string;
  readonly isNotRecorded: boolean;
  readonly basis: string;
}

export type HazardRankingView =
  | {
      readonly kind: "ranked";
      readonly band: string;
      readonly bandLabel: string;
      /** "3 of 41" — `null` when the set placed nobody. */
      readonly shortPosition: string | null;
      /** "3rd of 41, level with 5 others". */
      readonly positionText: string | null;
      /** "3 of 41 · Band 1 — highest relative ranking in set". */
      readonly summary: string;
      /** "41 held batteries at Cascade Auto Recyclers". */
      readonly setText: string;
      readonly asOf: string;
      readonly asOfInstant: IsoTimestamp;
      readonly basisStatement: string;
      readonly factors: readonly RankedFactorView[];
      /** "Damage indicators: Cosmetic only; …" — the CSV's column. */
      readonly factorsText: string;
      readonly why: readonly string[];
      /** Rule 10.24 — an input it read has changed since its as-of time. */
      readonly changedSince: boolean;
    }
  | {
      readonly kind: "not_ranked_yet" | "not_held" | "empty" | "unavailable";
      readonly message: string;
    };

/** The item a row ranks. */
export function rankedItemIdOf(row: {
  readonly batteryRecordId: Uuid | null;
  readonly containerId: Uuid | null;
  readonly lotId: Uuid | null;
}): Uuid {
  return row.batteryRecordId ?? row.containerId ?? row.lotId ?? "";
}

const NO_RANKING_MESSAGES: Readonly<
  Record<Exclude<HazardRankingStandingKind, "ranked" | "changed_since">, string>
> = {
  not_ranked_yet: NOT_RANKED_YET,
  not_held: NOT_RANKED_NOT_HELD,
  empty: NOT_RANKED_EMPTY,
};

/** Rule 10.24 — when the ranking itself cannot be read. Never "Not ranked". */
export const RANKING_UNAVAILABLE =
  "The ranking could not be read just now. The records are unchanged — try again.";

export function hazardRankingView(input: {
  readonly row: RankingRowInput | null;
  readonly current: CurrentItemState | undefined;
  readonly schemeVersion: string;
  readonly organizationName: string;
  readonly timeZone: TimeZone;
}): HazardRankingView {
  const standing = hazardRankingStanding({
    row: input.row,
    current: input.current,
    schemeVersion: input.schemeVersion,
  });
  const { row } = input;
  if (standing !== "ranked" && standing !== "changed_since") {
    return { kind: standing, message: NO_RANKING_MESSAGES[standing] };
  }
  if (row === null) {
    return { kind: "not_ranked_yet", message: NOT_RANKED_YET };
  }
  return {
    kind: "ranked",
    band: row.band,
    bandLabel: bandLabel(row.band),
    shortPosition:
      row.rankPosition === null
        ? null
        : shortPositionText({
            position: row.rankPosition,
            setSize: row.rankedSetSize,
          }),
    positionText: rankingPositionText(row),
    summary: rankingSummaryText(row),
    setText: comparisonSetText({
      scopeType: row.scopeType,
      setSize: row.rankedSetSize,
      organizationName: input.organizationName,
    }),
    asOf: basisInstant(row.computedAt, input.timeZone),
    asOfInstant: row.computedAt,
    basisStatement: row.basisStatement,
    factors: [...row.factors]
      .sort((a, b) => a.order - b.order)
      .map((entry) => ({
        code: entry.code,
        label: factorLabel(entry.code),
        level: entry.value,
        isNotRecorded: entry.level === "not_recorded",
        basis: entry.basis,
      })),
    factorsText: rankingFactorsText(row),
    why: whyStatements(row),
    changedSince: standing === "changed_since",
  };
}

/** The view when the ranking could not be read at all. */
export function unavailableRankingView(): HazardRankingView {
  return { kind: "unavailable", message: RANKING_UNAVAILABLE };
}

/** The four `/batteries` CSV cells — `UX_SPEC.md` §3.5. */
export function rankingCsvCells(
  view: HazardRankingView,
): readonly [string, string, string, string] {
  if (view.kind !== "ranked") return [view.message, "", "", ""];
  const ranking = view.changedSince
    ? `${view.summary} · ${CHANGED_SINCE}`
    : view.summary;
  return [ranking, view.setText, view.asOf, view.factorsText];
}
