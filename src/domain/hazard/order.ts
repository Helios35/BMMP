import type { HazardFactorCode } from "@/domain/taxonomy/hazard-factor-code";
import type { HazardRankingBand } from "@/domain/taxonomy/hazard-ranking-band";
import type { Uuid } from "@/types/common";

import type { FactorReading } from "./readings";
import { PLACED_BANDS } from "./scheme";

/**
 * How items are ordered — Rules 10.21, 10.23; D-77 #1, #5.
 *
 * **Items are compared factor by factor, in the scheme's order, and the first
 * factor where two differ decides which ranks above.** Nothing is added up and
 * no total exists, so every "why" is exact: it names one factor and the two
 * levels. Items that agree on every factor are level, share the best position
 * and share a band.
 *
 * **Band** comes from where an item's level group sits in the set: the share
 * is (items ranked above + (group size − 1) ÷ 2) ÷ (set size − 1), placed
 * against the scheme's cut points. A set of one, or a set in which every item
 * is level, is `not_ranked`: nothing sets an item apart.
 */

export interface RankableItem {
  readonly id: Uuid;
  /** The item's code — `BR-0012`, `C-0007`, `L-0001`. */
  readonly label: string;
  /** In the scheme's order for the item's scope. */
  readonly readings: readonly FactorReading[];
}

/** The first factor two items differ on, and the two levels there. */
export interface WhyComparison {
  readonly otherId: Uuid;
  readonly otherLabel: string;
  readonly factorCode: HazardFactorCode;
  readonly ownLevelLabel: string;
  readonly otherLevelLabel: string;
}

/** Why an item sits where it does — Rule 10.25. */
export interface HazardRankingWhy {
  /** Against the item just above, which it ranks below. `null` at the top. */
  readonly above: WhyComparison | null;
  /** Against the item just below, which it ranks above. `null` at the bottom. */
  readonly below: WhyComparison | null;
  /** The first few items it is level with; the full count is on the row. */
  readonly levelWithLabels: readonly string[];
}

export interface RankedItem {
  readonly item: RankableItem;
  /** The best position its level group holds, from 1. */
  readonly position: number;
  /** How many others are level with it. */
  readonly levelWithCount: number;
  readonly setSize: number;
  readonly band: HazardRankingBand;
  readonly why: HazardRankingWhy;
}

/** How many level items a "why" names before it only counts them. */
const LEVEL_WITH_NAMED = 3;

/** The first factor two items differ on, or `-1` when they are level. */
function firstDifference(a: RankableItem, b: RankableItem): number {
  return a.readings.findIndex(
    (reading, index) => reading.rankIndex !== b.readings[index]?.rankIndex,
  );
}

/** Negative when `a` ranks above `b`, positive when below, `0` when level. */
export function compareRankable(a: RankableItem, b: RankableItem): number {
  const index = firstDifference(a, b);
  if (index === -1) return 0;
  return (
    (a.readings[index]?.rankIndex ?? 0) - (b.readings[index]?.rankIndex ?? 0)
  );
}

function comparison(own: RankableItem, other: RankableItem): WhyComparison {
  const index = firstDifference(own, other);
  const mine = own.readings[index];
  const theirs = other.readings[index];
  if (mine === undefined || theirs === undefined) {
    throw new Error(
      `${own.label} and ${other.label} are level; there is no factor to name.`,
    );
  }
  return {
    otherId: other.id,
    otherLabel: other.label,
    factorCode: mine.code,
    ownLevelLabel: mine.label,
    otherLevelLabel: theirs.label,
  };
}

/** A fraction, as whole parts per million — so a cut point compares exactly. */
const PARTS = 1_000_000;

/**
 * Rule 10.23 — below the first cut point is Band 1, up to each next one is
 * the next band, and the rest is the last. Compared as whole numbers, so a
 * share that lands exactly on a cut point is never moved by rounding.
 */
export function bandFor(input: {
  readonly rankedAbove: number;
  readonly groupSize: number;
  readonly setSize: number;
  readonly cutPoints: readonly number[];
}): HazardRankingBand {
  // share = (above + (g − 1) / 2) / (n − 1) = (2·above + g − 1) / (2·(n − 1))
  const numerator = 2 * input.rankedAbove + input.groupSize - 1;
  const denominator = 2 * (input.setSize - 1);
  for (const [index, cut] of input.cutPoints.entries()) {
    const bound = Math.round(cut * PARTS) * denominator;
    const scaled = numerator * PARTS;
    const within = index === 0 ? scaled < bound : scaled <= bound;
    if (within) return PLACED_BANDS[index] ?? "not_ranked";
  }
  return PLACED_BANDS[input.cutPoints.length] ?? "not_ranked";
}

/**
 * Rank one set of items of one kind. The order among level items is by code,
 * for a stable list; it carries no meaning and the rows say they are level.
 */
export function rankItems(
  items: readonly RankableItem[],
  cutPoints: readonly number[],
): readonly RankedItem[] {
  const sorted = [...items].sort(
    (a, b) => compareRankable(a, b) || a.label.localeCompare(b.label),
  );
  const groups: RankableItem[][] = [];
  for (const item of sorted) {
    const last = groups[groups.length - 1];
    const head = last?.[0];
    if (
      last !== undefined &&
      head !== undefined &&
      compareRankable(head, item) === 0
    ) {
      last.push(item);
    } else {
      groups.push([item]);
    }
  }

  const setSize = sorted.length;
  const isNotRanked = setSize === 1 || groups.length === 1;
  const ranked: RankedItem[] = [];
  let rankedAbove = 0;
  groups.forEach((group, groupIndex) => {
    const previous = groups[groupIndex - 1];
    const next = groups[groupIndex + 1];
    const justAbove = previous?.[previous.length - 1];
    const justBelow = next?.[0];
    const band = isNotRanked
      ? "not_ranked"
      : bandFor({
          rankedAbove,
          groupSize: group.length,
          setSize,
          cutPoints,
        });
    for (const item of group) {
      const level = group.filter((other) => other.id !== item.id);
      ranked.push({
        item,
        position: rankedAbove + 1,
        levelWithCount: level.length,
        setSize,
        band,
        why: {
          above: justAbove === undefined ? null : comparison(item, justAbove),
          below: justBelow === undefined ? null : comparison(item, justBelow),
          levelWithLabels: level
            .slice(0, LEVEL_WITH_NAMED)
            .map((other) => other.label),
        },
      });
    }
    rankedAbove += group.length;
  });
  return ranked;
}
