import "server-only";

import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import {
  compareLabelToCatalog,
  labelDisagreesWithCatalog,
  type LabelCatalogComparison,
} from "@/domain/catalog/label-catalog-check";
import type { MatchTolerances } from "@/domain/intake/thresholds";
import type { LabelFieldCode } from "@/domain/taxonomy/label-field-code";
import type { ReviewReasonCode } from "@/domain/taxonomy/review-reason-code";
import type { BatteryRecord } from "@/types/battery-record";
import type { CatalogEntry } from "@/types/catalog";
import type { IsoTimestamp, JsonObject } from "@/types/common";
import type { IntakeDraft, IntakeSession } from "@/types/intake";

import { REASON_LABEL_CATALOG_MISMATCH } from "../copy";
import { userEvent, type RequestAttribution } from "./audit";

/**
 * The label-vs-catalog check, as the intake reads and records it — Rule 2.35;
 * T-52 `label_catalog_mismatch`; D-68.
 *
 * The comparison is `compareLabelToCatalog`, pure; this module only supplies
 * its two sides from what the session holds and writes what a disagreement
 * changes. **The label side is what the label read** — each field's
 * `originalValue` — so a correction a person types cannot hide a
 * disagreement, and a field the read left empty is never one (Rule 2.11).
 */

const MISMATCH: ReviewReasonCode = "label_catalog_mismatch";

function readOf(draft: IntakeDraft, fieldCode: LabelFieldCode): string | null {
  return (
    draft.fields.find((field) => field.fieldCode === fieldCode)
      ?.originalValue ?? null
  );
}

/** One read run's fields as printed, keyed the way the extraction rows are. */
export function labelReadFromFields(
  fields: readonly {
    readonly fieldCode: LabelFieldCode;
    readonly fieldValue: string | null;
  }[],
) {
  const value = (fieldCode: LabelFieldCode): string | null =>
    fields.find((field) => field.fieldCode === fieldCode)?.fieldValue ?? null;
  return {
    manufacturer: value("manufacturer"),
    model: value("model"),
    voltage: value("voltage"),
    capacityAh: value("capacity_ah"),
    energyWh: value("energy_wh"),
    // Catalog matching resolves no printed chemistry code to a T-01 value in
    // this version, so Rule 2.35 compares none (a code with no resolution is
    // not compared).
    chemistry: null,
  };
}

function labelReadFromDraft(draft: IntakeDraft) {
  return labelReadFromFields(
    (
      ["manufacturer", "model", "voltage", "capacity_ah", "energy_wh"] as const
    ).map((fieldCode) => ({ fieldCode, fieldValue: readOf(draft, fieldCode) })),
  );
}

function entrySide(entry: CatalogEntry) {
  return {
    catalogEntryId: entry.id,
    manufacturerName: entry.manufacturerName,
    brandName: entry.brandName,
    partNumber: entry.partNumber,
    partNumberNormalized: entry.partNumberNormalized,
    nominalVoltageV: entry.nominalVoltageV,
    ratedCapacityAh: entry.ratedCapacityAh,
    ratedEnergyWh: entry.ratedEnergyWh,
    chemistry: entry.chemistry === "unknown" ? null : entry.chemistry,
  };
}

/** Compare one read run's fields with the entry it resolved to exactly (Rule 2.18). */
export function compareReadWithEntry(
  fields: Parameters<typeof labelReadFromFields>[0],
  entry: CatalogEntry,
  tolerances: MatchTolerances,
): LabelCatalogComparison {
  return compareLabelToCatalog(
    labelReadFromFields(fields),
    entrySide(entry),
    tolerances,
  );
}

/** Compare what the session's label read with an entry — the pick, or the exact match. */
export function compareDraftWithEntry(
  draft: IntakeDraft,
  entry: CatalogEntry,
  tolerances: MatchTolerances,
): LabelCatalogComparison {
  return compareLabelToCatalog(
    labelReadFromDraft(draft),
    entrySide(entry),
    tolerances,
  );
}

/**
 * The comparison as it goes on the record's history — the values compared and
 * the tolerance in force (Rules 2.35, 12.15). No score: a list of fields.
 */
export function comparisonHistory(
  comparison: LabelCatalogComparison,
  configurationVersion: string,
): JsonObject {
  return {
    catalogEntryId: comparison.catalogEntryId,
    compared: [...comparison.compared],
    disagreements: comparison.disagreements.map((disagreement) => ({
      fieldCode: disagreement.fieldCode,
      labelSays: disagreement.labelSays,
      catalogSays: disagreement.catalogSays,
      toleranceRelative: disagreement.toleranceRelative,
    })),
    configurationVersion,
  };
}

/**
 * A person picked an entry the label disagrees with (Rule 2.19): the record
 * routes to review with `label_catalog_mismatch` added, and the disagreement
 * is kept on its history. **It blocks nothing** — the person who picked it can
 * still confirm it, from here or from `/review`; it only puts a second pair of
 * eyes on it (Rule 2.35).
 *
 * Every pick that shows a disagreement is recorded, because each is one a
 * person was shown. A pick that agrees changes nothing: a reason already on
 * the session is history, never withdrawn by a later choice.
 */
export async function routeLabelDisagreement(
  ctx: RequestContext,
  input: {
    readonly session: IntakeSession;
    readonly record: BatteryRecord;
    readonly comparison: LabelCatalogComparison;
    readonly configurationVersion: string;
    readonly at: IsoTimestamp;
    readonly attribution: RequestAttribution;
  },
): Promise<void> {
  const { session, record, comparison } = input;
  if (!labelDisagreesWithCatalog(comparison)) return;

  const stored = session.reviewReasonCodes ?? [];
  const reviewReasonCodes = stored.includes(MISMATCH)
    ? stored
    : [...stored, MISMATCH];
  await data.intakeSessions.update(ctx, session.id, {
    isReviewRequired: true,
    reviewReasonCodes,
  });
  if (record.status !== "pending_review") {
    await data.batteryRecords.update(ctx, record.id, {
      status: "pending_review",
    });
  }
  await data.auditEvents.write(
    ctx,
    userEvent(ctx, {
      eventType: "battery_record.routed_to_review",
      entityTable: "battery_record",
      entityId: record.id,
      at: input.at,
      beforeState: {
        status: record.status,
        reasonCodes: [...stored],
      },
      afterState: {
        status: "pending_review",
        reasonCodes: [...reviewReasonCodes],
        labelCatalog: comparisonHistory(comparison, input.configurationVersion),
      },
      changedFields:
        record.status === "pending_review" ? ["reasonCodes"] : ["status"],
      reason: REASON_LABEL_CATALOG_MISMATCH,
      attribution: input.attribution,
    }),
  );
}
