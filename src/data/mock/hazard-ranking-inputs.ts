import type { HazardRankingInputs } from "@/domain/hazard/run";
import type { Uuid } from "@/types/common";
import type { BatteryRecord } from "@/types/battery-record";
import type { CatalogEntry } from "@/types/catalog";
import type {
  DamageAssessment,
  RecallCheckRun,
  RecallMatch,
} from "@/types/condition";
import type { Container, Lot } from "@/types/storage";
import type { Organization, User } from "@/types/tenancy";

/**
 * What one organization's ranking run reads — gathered from rows, and nothing
 * decided. The adapter calls it over its tables; the fixture seed calls it
 * over the fixture arrays, so the seeded run and a live one read the same
 * way. **Which items are held, and how they rank, is the domain's**
 * (`src/domain/hazard`).
 *
 * No import from the store: the store seeds itself from this module.
 */

export interface HazardRankingRowSource {
  readonly organizations: readonly Organization[];
  readonly users: readonly User[];
  readonly batteryRecords: readonly BatteryRecord[];
  readonly catalogEntries: readonly CatalogEntry[];
  readonly damageAssessments: readonly DamageAssessment[];
  readonly recallMatches: readonly RecallMatch[];
  readonly recallCheckRuns: readonly RecallCheckRun[];
  readonly containers: readonly Container[];
  readonly lots: readonly Lot[];
}

/** Draft and voided records are outside every operational view (T-22; Rule 12.12). */
const OUTSIDE_EVERY_VIEW = ["draft", "voided"];

export function gatherHazardRankingInputs(
  source: HazardRankingRowSource,
  organizationId: Uuid,
): HazardRankingInputs {
  const organization = source.organizations.find(
    (row) => row.id === organizationId,
  );
  const batteries = source.batteryRecords.filter(
    (row) =>
      row.organizationId === organizationId &&
      !OUTSIDE_EVERY_VIEW.includes(row.status),
  );
  const ids = new Set(batteries.map((row) => row.id));
  const catalogIds = new Set(
    batteries
      .map((row) => row.catalogEntryId)
      .filter((id): id is Uuid => id !== null),
  );
  const damageAssessments = source.damageAssessments.filter(
    (row) =>
      row.organizationId === organizationId && ids.has(row.batteryRecordId),
  );
  const people = new Set<Uuid>();
  for (const row of damageAssessments) {
    if (row.assessedBy !== null) people.add(row.assessedBy);
  }
  for (const row of batteries) {
    if (row.chemistryConfirmedBy !== null) people.add(row.chemistryConfirmedBy);
  }

  return {
    organizationName: organization?.name ?? "",
    timeZone: organization?.timeZone ?? "UTC",
    batteries,
    catalogEntries: source.catalogEntries.filter((row) =>
      catalogIds.has(row.id),
    ),
    damageAssessments,
    recallMatches: source.recallMatches.filter(
      (row) =>
        row.organizationId === organizationId && ids.has(row.batteryRecordId),
    ),
    recallCheckRuns: source.recallCheckRuns.filter(
      (row) =>
        row.organizationId === organizationId && ids.has(row.batteryRecordId),
    ),
    containers: source.containers.filter(
      (row) => row.organizationId === organizationId,
    ),
    lots: source.lots.filter((row) => row.organizationId === organizationId),
    // Only the people this organization's own rows name — never a list of
    // the platform's accounts (`features/battery-record/user-names.ts`).
    people: source.users
      .filter((user) => people.has(user.id))
      .map((user) => ({ id: user.id, name: user.fullName ?? user.email })),
  };
}
