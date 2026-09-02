import type { CatalogCandidateView } from "@/components/extraction-review/types";
import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import {
  normalizePartNumber,
  rankCatalogCandidates,
  type MatchCandidateInput,
  type MatchedOnField,
  type RankedCandidate,
} from "@/domain/catalog/match";
import { CHEMISTRY_LABELS } from "@/domain/taxonomy/chemistry";
import { labelFor } from "@/domain/taxonomy/lookup";
import { ValidationError } from "@/lib/errors";
import type { BatteryRecord } from "@/types/battery-record";
import type { IsoTimestamp, JsonObject, Uuid } from "@/types/common";
import type { CatalogEntry } from "@/types/catalog";
import { userEvent, writeAuditEvent } from "./audit";
import {
  assertRecordEditable,
  reclassifyRecord,
  resolveClassificationRule,
  type ReclassificationOutcome,
} from "./reclassify";

/**
 * **Re-run catalog matching** — Rules 2.18, 2.19, 2.32, 3.15; §11.1 step 4.
 *
 * Two halves, deliberately separate. `findCatalogCandidatesForRecord` retrieves
 * and ranks and **selects nothing** — Rule 2.19 forbids auto-selecting a top
 * candidate or silently narrowing to one, so the dialog shows the ranked list
 * and a person picks. `applyCatalogRematch` then records that pick.
 *
 * **Chemistry on the record comes from the matched entry**, and only from it
 * or from a person (`chemistrySource` is `catalog_match` or `human_entry`).
 * Nothing in this module reads a photograph, and no copy on the dialog says
 * anything was detected.
 *
 * A corrected identification re-opens the confidence gate for chemistry and
 * model (Rule 2.32): the person confirms the new values in the dialog, and the
 * confirmation is recorded as `chemistryConfirmedBy` / `chemistryConfirmedAt`
 * here. The record is then re-classified, because chemistry is an input to the
 * waste-stream decision (Rule 3.15).
 *
 * The tolerances and weights the scorer reads come out of the platform
 * configuration through `src/data`; nothing here holds a number (D-22, D-40).
 */

/** §2.13 — at most five candidates are presented. */
const CANDIDATE_LIMIT = 5;

const MATCHED_ON_LABELS: Readonly<Record<MatchedOnField, string>> = {
  manufacturer: "manufacturer",
  model: "model",
  voltage: "voltage",
  capacity_ah: "capacity",
  energy_wh: "energy",
};

function candidateInput(entry: CatalogEntry): MatchCandidateInput {
  return {
    catalogEntryId: entry.id,
    manufacturerName: entry.manufacturerName,
    modelName: entry.modelName,
    partNumber: entry.partNumber,
    partNumberNormalized: entry.partNumberNormalized,
    nominalVoltageV: entry.nominalVoltageV,
    ratedCapacityAh: entry.ratedCapacityAh,
    ratedEnergyWh: entry.ratedEnergyWh,
    labelTextPatterns: entry.labelTextPatterns,
  };
}

/** Nameplate figures as the entry states them, unit beside each — data, never a literal. */
function specLines(entry: CatalogEntry): readonly string[] {
  const lines: string[] = [];
  if (entry.partNumber !== null) lines.push(`Part number ${entry.partNumber}`);
  if (entry.nominalVoltageV !== null) {
    lines.push(`Nominal voltage ${entry.nominalVoltageV} V`);
  }
  if (entry.ratedCapacityAh !== null) {
    lines.push(`Rated capacity ${entry.ratedCapacityAh} Ah`);
  }
  if (entry.ratedEnergyWh !== null) {
    lines.push(`Rated energy ${entry.ratedEnergyWh} Wh`);
  }
  return lines;
}

function candidateView(
  ranked: RankedCandidate,
  entry: CatalogEntry,
): CatalogCandidateView {
  const matchedOn = ranked.matchedOn.map((field) => MATCHED_ON_LABELS[field]);
  return {
    catalogEntryId: entry.id,
    title: [entry.manufacturerName, entry.modelName ?? entry.partNumber]
      .filter((part): part is string => part !== null)
      .join(" "),
    chemistryLabel: labelFor(CHEMISTRY_LABELS, entry.chemistry),
    specs: specLines(entry),
    matchedOnLabel:
      matchedOn.length === 0
        ? ranked.matchMethodCode === "exact_part_number"
          ? "Matched on part number"
          : "No field matched"
        : `Matched on ${matchedOn.join(", ")}`,
    // Carried for the ranking only. Never rendered as a number.
    matchScore: ranked.matchScore,
  };
}

/**
 * Retrieve, rank, present. The record's own identifiers are the query: part
 * number first, the manufacturer alone when that finds nothing (§7.3 step 4).
 */
export async function findCatalogCandidatesForRecord(
  ctx: RequestContext,
  recordId: Uuid,
): Promise<readonly CatalogCandidateView[]> {
  const record = await data.batteryRecords.get(ctx, recordId);
  if (record === null) {
    throw new ValidationError({
      userMessage: "This record could not be found.",
      correlationId: ctx.correlationId,
    });
  }

  const configuration =
    await data.platformConfiguration.readIntakeGateConfiguration(ctx);

  const partNumberNormalized =
    record.partNumber === null ? null : normalizePartNumber(record.partNumber);
  const manufacturerNormalized =
    record.manufacturerName === null
      ? null
      : record.manufacturerName.trim().toLowerCase();

  let entries: readonly CatalogEntry[] = [];
  if (partNumberNormalized !== null && partNumberNormalized !== "") {
    entries = await data.catalogEntries.findCandidates(ctx, {
      partNumberNormalized,
      limit: CANDIDATE_LIMIT,
    });
  }
  if (entries.length === 0 && manufacturerNormalized !== null) {
    entries = await data.catalogEntries.findCandidates(ctx, {
      manufacturerNormalized,
      limit: CANDIDATE_LIMIT,
    });
  }
  if (entries.length === 0) {
    // No identifier to search on, or nothing under it: the broadest published
    // set, ranked, so a person can still pick from what the catalog holds.
    entries = await data.catalogEntries.findCandidates(ctx, {
      limit: CANDIDATE_LIMIT,
    });
  }

  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const ranked = rankCatalogCandidates(
    {
      manufacturer: record.manufacturerName,
      model: record.modelName,
      voltageV: record.nominalVoltageV,
      capacityAh: record.ratedCapacityAh,
      energyWh: record.ratedEnergyWh,
    },
    entries.map(candidateInput),
    {
      tolerances: configuration.matchTolerances,
      scoring: configuration.matchScoring,
    },
  );

  return ranked.slice(0, CANDIDATE_LIMIT).flatMap((candidate) => {
    const entry = byId.get(candidate.catalogEntryId);
    return entry === undefined ? [] : [candidateView(candidate, entry)];
  });
}

export interface ApplyCatalogRematchOutcome {
  readonly record: BatteryRecord;
  readonly entry: CatalogEntry;
  readonly changedFields: readonly string[];
  readonly reclassification: ReclassificationOutcome;
}

function identificationSnapshot(record: BatteryRecord): JsonObject {
  return {
    catalogEntryId: record.catalogEntryId,
    chemistry: record.chemistry,
    chemistrySource: record.chemistrySource,
    chemistryConfirmedBy: record.chemistryConfirmedBy,
    manufacturerName: record.manufacturerName,
    brandName: record.brandName,
    modelName: record.modelName,
    partNumber: record.partNumber,
    applicationClass: record.applicationClass,
  };
}

/**
 * Record a person's pick. The entry's chemistry becomes the record's, the
 * person's confirmation is attributed, and the record is re-classified.
 *
 * Identity fields the record already carries are **kept**: what was read from
 * the label or entered by a person is evidence, and the catalog fills only the
 * gaps. `applicationClass` is treated the same way, with T-01's `unknown`
 * read as the gap it is.
 */
export async function applyCatalogRematch(
  ctx: RequestContext,
  input: { readonly recordId: Uuid; readonly catalogEntryId: Uuid },
  at: IsoTimestamp,
): Promise<ApplyCatalogRematchOutcome> {
  const record = await data.batteryRecords.get(ctx, input.recordId);
  if (record === null) {
    throw new ValidationError({
      userMessage: "This record could not be found.",
      correlationId: ctx.correlationId,
    });
  }
  assertRecordEditable(ctx, record);

  const entry = await data.catalogEntries.get(ctx, input.catalogEntryId);
  if (entry === null || entry.status !== "published") {
    // T-07 — only a published entry is available for matching, and an entry
    // this organisation cannot see is one that does not exist for it.
    throw new ValidationError({
      userMessage: "That catalog entry is not available for matching.",
      field: "catalogEntryId",
      correlationId: ctx.correlationId,
    });
  }

  const before = identificationSnapshot(record);

  const updated = await data.batteryRecords.update(ctx, record.id, {
    catalogEntryId: entry.id,
    chemistry: entry.chemistry,
    chemistrySource: "catalog_match",
    chemistryConfirmedBy: ctx.userId,
    chemistryConfirmedAt: at,
    ...(record.modelName === null && entry.modelName !== null
      ? { modelName: entry.modelName }
      : {}),
    ...(record.partNumber === null && entry.partNumber !== null
      ? { partNumber: entry.partNumber }
      : {}),
    ...(record.brandName === null && entry.brandName !== null
      ? { brandName: entry.brandName }
      : {}),
    ...(record.manufacturerName === null
      ? { manufacturerName: entry.manufacturerName }
      : {}),
    ...(record.applicationClass === "unknown"
      ? { applicationClass: entry.applicationClass }
      : {}),
  });

  const after = identificationSnapshot(updated);
  const changedFields = Object.keys(after).filter(
    (key) => before[key] !== after[key],
  );

  await writeAuditEvent(
    ctx,
    userEvent(ctx, {
      eventType: "catalog_entry.matched",
      entityTable: "catalog_entry",
      entityId: entry.id,
      occurredAt: at,
      afterState: {
        batteryRecordId: record.id,
        selection: "human_pick",
        previousCatalogEntryId: record.catalogEntryId,
      },
    }),
  );

  await writeAuditEvent(
    ctx,
    userEvent(ctx, {
      eventType: "battery_record.status_changed",
      entityTable: "battery_record",
      entityId: record.id,
      occurredAt: at,
      beforeState: before,
      afterState: after,
      changedFields,
      reason: "catalog_rematch",
    }),
  );

  // Rule 3.15 — a corrected identification re-runs the classification.
  const rule = await resolveClassificationRule(ctx, updated, at);
  const reclassification = await reclassifyRecord(ctx, {
    record: updated,
    rule,
    at,
    trigger: "catalog_rematch",
  });

  return {
    record: reclassification.record,
    entry,
    changedFields,
    reclassification,
  };
}
