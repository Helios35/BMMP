import {
  HAZARD_FACTOR_CODE_LABELS,
  HAZARD_FACTOR_CODES,
} from "@/domain/taxonomy/hazard-factor-code";
import {
  HAZARD_RANKING_BAND_LABELS,
  HAZARD_RANKING_BANDS,
  type HazardRankingBand,
} from "@/domain/taxonomy/hazard-ranking-band";
import { readTaxonomyValue } from "@/domain/taxonomy/lookup";

import type { HazardRankingWhy, WhyComparison } from "./order";
import type { CurrentItemState, HazardRankingFactorEntry } from "./run";
import { positionText, shortPositionText } from "./words";

/**
 * A ranking, said in words — Rule 10.25.
 *
 * Every sentence here is comparative: ranked above, ranked below, level with.
 * The panel, the list column and the CSV all read their words from this
 * module, so a screen and an export can never word the same ranking two ways.
 */

/** The parts of a stored ranking row these words read. */
export interface RankingWords {
  readonly rankPosition: number | null;
  readonly rankedSetSize: number;
  readonly levelWithCount: number;
  readonly band: string;
  readonly factors: readonly HazardRankingFactorEntry[];
  readonly why: HazardRankingWhy;
}

/** A T-34 label, or the stored code as stored (TAXONOMY.md §5.8). */
export function factorLabel(code: string): string {
  const read = readTaxonomyValue(
    HAZARD_FACTOR_CODES,
    HAZARD_FACTOR_CODE_LABELS,
    code,
  );
  return read.recognised ? read.label : read.storedValue;
}

/** A T-33 label, or the stored band as stored (TAXONOMY.md §5.8). */
export function bandLabel(band: string): string {
  const read = readTaxonomyValue(
    HAZARD_RANKING_BANDS,
    HAZARD_RANKING_BAND_LABELS,
    band,
  );
  return read.recognised ? read.label : read.storedValue;
}

export function isPlacedBand(
  band: string,
): band is Exclude<HazardRankingBand, "not_ranked"> {
  return (
    band !== "not_ranked" &&
    (HAZARD_RANKING_BANDS as readonly string[]).includes(band)
  );
}

/** "3rd of 41, level with 5 others" — the position, or `null` for a row with none. */
export function rankingPositionText(row: RankingWords): string | null {
  if (row.rankPosition === null) return null;
  return positionText({
    position: row.rankPosition,
    setSize: row.rankedSetSize,
    levelWithCount: row.levelWithCount,
  });
}

/** The list column and the CSV cell: "3 of 41 · Band 1 — highest relative ranking in set". */
export function rankingSummaryText(row: RankingWords): string {
  const band = bandLabel(row.band);
  if (row.rankPosition === null || !isPlacedBand(row.band)) return band;
  return `${shortPositionText({ position: row.rankPosition, setSize: row.rankedSetSize })} · ${band}`;
}

function comparisonText(
  direction: "above" | "below",
  comparison: WhyComparison,
): string {
  return `Ranked ${direction} ${comparison.otherLabel} on ${factorLabel(comparison.factorCode)}: ${comparison.ownLevelLabel} vs ${comparison.otherLevelLabel}.`;
}

/** Why it sits where it does: against the item just above and just below, and who it is level with. */
export function whyStatements(row: RankingWords): readonly string[] {
  const statements: string[] = [];
  const { why } = row;
  if (row.band === "not_ranked") {
    statements.push(
      "Nothing sets it apart in this set, so it is not given a band.",
    );
  } else {
    statements.push(
      why.above === null
        ? "Nothing ranks above it."
        : comparisonText("below", why.above),
    );
    statements.push(
      why.below === null
        ? "Nothing ranks below it."
        : comparisonText("above", why.below),
    );
  }
  if (row.levelWithCount > 0) {
    const named = why.levelWithLabels.join(", ");
    const more = row.levelWithCount - why.levelWithLabels.length;
    const rest =
      more > 0 ? ` and ${more} ${more === 1 ? "other" : "others"}` : "";
    statements.push(`Level with ${named}${rest} on every factor.`);
  }
  return statements;
}

/** "Damage indicators: Cosmetic only" — one factor's level. */
export function factorLevelText(entry: HazardRankingFactorEntry): string {
  return `${factorLabel(entry.code)}: ${entry.value}`;
}

/** The CSV's "Ranking factors": every factor's level, in the scheme's order. */
export function rankingFactorsText(row: RankingWords): string {
  return [...row.factors]
    .sort((a, b) => a.order - b.order)
    .map(factorLevelText)
    .join("; ");
}

/** What an item shows: its ranking, or why it has none — Rule 10.24. */
export type HazardRankingStandingKind =
  "ranked" | "changed_since" | "not_ranked_yet" | "not_held" | "empty";

/**
 * Read an item's current row against the item as it stands now.
 *
 * - **Changed since** when an input the ranking read has changed, the item
 *   left held inventory or emptied, or the scheme moved on.
 * - **Not ranked yet** for a held item with no current row.
 * - An empty container or lot, and anything outside held inventory, has no
 *   ranking and says why.
 */
export function hazardRankingStanding(input: {
  readonly row: {
    readonly schemeVersion: string;
    readonly inputsSignature: string;
  } | null;
  readonly current: CurrentItemState | undefined;
  readonly schemeVersion: string;
}): HazardRankingStandingKind {
  const { row, current } = input;
  const isHeld = current?.isHeld === true;
  const isEmpty = current?.isEmpty === true;
  if (row === null) {
    if (!isHeld) return "not_held";
    if (isEmpty) return "empty";
    return "not_ranked_yet";
  }
  if (
    !isHeld ||
    isEmpty ||
    row.schemeVersion !== input.schemeVersion ||
    row.inputsSignature !== current?.inputsSignature
  ) {
    return "changed_since";
  }
  return "ranked";
}

/** Rows a list sorts by ranking: positions first, then everything without one. */
export function rankingSortKey(
  row: { readonly rankPosition: number | null } | null,
): number | null {
  return row?.rankPosition ?? null;
}
