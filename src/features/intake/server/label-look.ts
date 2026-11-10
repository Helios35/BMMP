import "server-only";

import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import { labelLookRoutesToReview } from "@/domain/photo-checks/label-look";
import type { ReviewReasonCode } from "@/domain/taxonomy/review-reason-code";
import {
  runLabelLookCheck,
  type LabelLookFinding,
} from "@/features/photo-checks/server/run-checks";
import type { BatteryRecord } from "@/types/battery-record";
import type { CatalogEntry } from "@/types/catalog";
import type { IsoTimestamp, JsonObject } from "@/types/common";
import type { IntakeDraft, IntakeSession } from "@/types/intake";

import { REASON_LABEL_LOOK_DIFFERS } from "../copy";
import { userEvent, type RequestAttribution } from "./audit";

/**
 * The label look check, as the intake records it — Rule 2.36; T-52
 * `label_look_differs`; D-68, D-75.
 *
 * **It runs where Rule 2.35 runs, through the same call sites**: the read's
 * exact match (`intake-pipeline.ts`, beside `compareReadWithEntry`) and a
 * person's pick (`selectCatalogCandidate`, beside `routeLabelDisagreement`).
 * The comparison is the vision provider's, through
 * `runLabelLookCheck`; this module only routes what it found.
 *
 * Only **looks different** routes. Could not compare, no reference on file
 * and a failed check are recorded on the run and route nothing (D-75 #7).
 */

const LOOK_DIFFERS: ReviewReasonCode = "label_look_differs";

/**
 * The run as it goes on the record's history — the reference it was compared
 * against and the outcome (Rules 2.36, 12.15). No score, no words.
 */
export function labelLookHistory(finding: LabelLookFinding): JsonObject {
  return {
    outcome: finding.outcome,
    catalogEntryId: finding.entry.id,
    catalogReferencePhotoId: finding.reference?.id ?? null,
    comparedIntakePhotoId: finding.subject.id,
    photoCheckId: finding.check?.id ?? null,
  };
}

/**
 * A person picked an entry whose reference the label looks different from:
 * the record routes to review with `label_look_differs` added. **It blocks
 * nothing** — the person can still confirm from here or from `/review`; it
 * puts a second pair of eyes on it. A reason already on the session stays.
 */
export async function routeLabelLookDifference(
  ctx: RequestContext,
  input: {
    readonly session: IntakeSession;
    readonly record: BatteryRecord;
    readonly finding: LabelLookFinding;
    readonly at: IsoTimestamp;
    readonly attribution: RequestAttribution;
  },
): Promise<void> {
  if (!labelLookRoutesToReview(input.finding.outcome)) return;
  // Re-read: Rule 2.35's routing on the same pick may have just added its own.
  const session =
    (await data.intakeSessions.get(ctx, input.session.id)) ?? input.session;
  const record =
    (await data.batteryRecords.get(ctx, input.record.id)) ?? input.record;

  const stored = session.reviewReasonCodes ?? [];
  const reviewReasonCodes = stored.includes(LOOK_DIFFERS)
    ? stored
    : [...stored, LOOK_DIFFERS];
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
      beforeState: { status: record.status, reasonCodes: [...stored] },
      afterState: {
        status: "pending_review",
        reasonCodes: [...reviewReasonCodes],
        labelLook: labelLookHistory(input.finding),
      },
      changedFields:
        record.status === "pending_review" ? ["reasonCodes"] : ["status"],
      reason: REASON_LABEL_LOOK_DIFFERS,
      attribution: input.attribution,
    }),
  );
}

/** Rule 2.36 on a person's pick: run the look check, and route a difference. Never throws. */
export async function checkPickedEntryLook(
  ctx: RequestContext,
  input: {
    readonly session: IntakeSession;
    readonly record: BatteryRecord;
    readonly draft: IntakeDraft;
    readonly entry: CatalogEntry;
    readonly at: IsoTimestamp;
    readonly attribution: RequestAttribution;
  },
): Promise<LabelLookFinding | null> {
  try {
    const [labelPhoto, crop] = await Promise.all([
      input.draft.labelPhotoId === null
        ? Promise.resolve(null)
        : data.intakePhotos.get(ctx, input.draft.labelPhotoId),
      input.draft.labelCropId === null
        ? Promise.resolve(null)
        : data.intakePhotos.get(ctx, input.draft.labelCropId),
    ]);
    const finding = await runLabelLookCheck(ctx, {
      entry: input.entry,
      labelPhoto,
      crop,
      // The upload's name is not on the row; the fixture reads a stored
      // photo as its default scenario. A real provider reads the bytes.
      labelFileName: null,
      labelBytes: null,
      at: input.at,
      attribution: input.attribution,
    });
    if (finding !== null) {
      await routeLabelLookDifference(ctx, {
        session: input.session,
        record: input.record,
        finding,
        at: input.at,
        attribution: input.attribution,
      });
    }
    return finding;
  } catch (error) {
    console.error(
      `[intake] the label look check on a pick did not complete (correlationId=${ctx.correlationId})`,
      error,
    );
    return null;
  }
}
