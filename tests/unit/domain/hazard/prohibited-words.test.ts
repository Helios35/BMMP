import { describe, expect, it } from "vitest";

import * as PANEL_COPY from "@/components/hazard/ranking-copy";
import { mockStore, resetMockStore } from "@/data/mock";
import { PLATFORM_HAZARD_RANKING_SCHEME } from "@/data/mock/fixtures/platform-configuration";
import { gatherHazardRankingInputs } from "@/data/mock/hazard-ranking-inputs";
import {
  CHANGED_SINCE,
  containsProhibitedRankingWord,
  currentItemStates,
  hazardRankingView,
  itemKey,
  NOT_RANKED_EMPTY,
  NOT_RANKED_NOT_HELD,
  NOT_RANKED_YET,
  PROHIBITED_RANKING_PATTERNS,
  RANKING_UNAVAILABLE,
  rankingCsvCells,
  rankedItemIdOf,
  validateHazardRankingScheme,
  whyStatements,
} from "@/domain/hazard";
import { HAZARD_FACTOR_CODE_LABELS } from "@/domain/taxonomy/hazard-factor-code";
import { HAZARD_RANKING_BAND_LABELS } from "@/domain/taxonomy/hazard-ranking-band";
import { HAZARD_RANKING_SCOPE_LABELS } from "@/domain/taxonomy/hazard-ranking-scope";
import { BATTERY_CSV_HEADERS } from "@/features/battery-record/battery-csv";
import * as LIST_COPY from "@/features/hazard-ranking/ranking-copy";

/**
 * **No probability, percentage, likelihood, chance, score, total, weight or
 * "risk"** on any ranking surface, export or stored row — Rules 1.25, 10.3,
 * 10.4, 10.25; the brief's hard rule and the spec's §6 test.
 *
 * Every label, basis statement, "why", CSV cell and fixed string the ranking
 * produces is held to `PROHIBITED_RANKING_PATTERNS`, against the seeded run
 * and against a fresh one, so a new factor basis cannot slip a word in.
 */

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "function") return [];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap(strings);
  }
  return [];
}

function expectClean(where: string, texts: readonly string[]): void {
  for (const text of texts) {
    expect(containsProhibitedRankingWord(text), `${where}: "${text}"`).toBe(
      false,
    );
  }
}

describe("the prohibited words (Rules 1.25, 10.3)", () => {
  it("catches each word the spec names", () => {
    for (const text of [
      "12% of packs",
      "a probability",
      "likely to ignite",
      "a chance of fire",
      "fire risk",
      "a hazard score",
      "a total of points",
      "factor weight",
      "high hazard",
    ]) {
      expect(containsProhibitedRankingWord(text), text).toBe(true);
    }
    expect(PROHIBITED_RANKING_PATTERNS.length).toBeGreaterThanOrEqual(6);
  });

  it("is absent from every scheme label", () => {
    expectClean("scheme", strings(PLATFORM_HAZARD_RANKING_SCHEME.factors));
    expect(validateHazardRankingScheme(PLATFORM_HAZARD_RANKING_SCHEME).ok).toBe(
      true,
    );
  });

  it("is absent from every fixed string and every ranking taxonomy label", () => {
    expectClean("panel copy", strings(PANEL_COPY));
    expectClean("list copy", strings(LIST_COPY));
    expectClean("standings", [
      CHANGED_SINCE,
      NOT_RANKED_YET,
      NOT_RANKED_EMPTY,
      NOT_RANKED_NOT_HELD,
      RANKING_UNAVAILABLE,
    ]);
    expectClean("T-33", Object.values(HAZARD_RANKING_BAND_LABELS));
    expectClean("T-34", Object.values(HAZARD_FACTOR_CODE_LABELS));
    expectClean("T-67", Object.values(HAZARD_RANKING_SCOPE_LABELS));
    expectClean("CSV headings", BATTERY_CSV_HEADERS.slice(-4));
  });

  it("is absent from every stored row, basis, why and CSV cell of the seeded run", () => {
    const store = resetMockStore();
    const rows = store.hazardRankings.all();
    expect(rows.length).toBeGreaterThan(0);
    const validation = validateHazardRankingScheme(
      PLATFORM_HAZARD_RANKING_SCHEME,
    );
    if (!validation.ok) throw new Error("scheme");
    const s = mockStore();
    const inputs = gatherHazardRankingInputs(
      {
        organizations: s.organizations.all(),
        users: s.users.all(),
        batteryRecords: s.batteryRecords.all(),
        catalogEntries: s.catalogEntries.all(),
        damageAssessments: s.damageAssessments.all(),
        recallMatches: s.recallMatches.all(),
        recallCheckRuns: s.recallCheckRuns.all(),
        containers: s.containers.all(),
        lots: s.lots.all(),
      },
      rows[0]?.organizationId ?? "",
    );
    const states = currentItemStates(
      inputs,
      validation.scheme,
      "2026-11-13T00:00:00.000Z",
    );
    for (const row of rows) {
      // The stored row: every string field, and no key that names a number about hazard.
      expectClean(`row ${row.id}`, strings(row));
      for (const key of Object.keys(row)) {
        expect(key).not.toMatch(/probab|likel|risk|score|weight|total/i);
      }
      expectClean(`why ${row.id}`, whyStatements(row));
      const view = hazardRankingView({
        row,
        current: states.get(itemKey(row.scopeType, rankedItemIdOf(row))),
        schemeVersion: validation.scheme.schemeVersion,
        organizationName: inputs.organizationName,
        timeZone: inputs.timeZone,
      });
      expectClean(`view ${row.id}`, strings(view));
      expectClean(`csv ${row.id}`, rankingCsvCells(view));
    }
  });
});
