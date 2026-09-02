"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { CatalogCandidateView } from "@/components/extraction-review/types";
import type { ClassificationMissingInput } from "@/domain/classification/waste-stream";
import type { BatteryRecordStatus } from "@/domain/taxonomy/battery-record-status";
import { requireWrite } from "@/lib/auth/guard";
import { nowIso } from "@/lib/auth/session";
import {
  actionFailed,
  actionFailedFrom,
  actionSucceeded,
  type ActionResult,
} from "@/lib/action-result";
import type { Uuid } from "@/types/common";

import {
  applyCatalogRematchSchema,
  findCatalogCandidatesSchema,
  firstIssue,
  recordDamageAssessmentSchema,
  voidBatteryRecordSchema,
} from "./schemas";
import { recordDamageAssessmentFor } from "./server/condition";
import {
  applyCatalogRematch as applyCatalogRematchFor,
  findCatalogCandidatesForRecord as findCandidatesFor,
} from "./server/rematch";
import { voidBatteryRecordFor } from "./server/void";

/**
 * The write paths on `/batteries/[id]` — `UX_SPEC.md` §3.7,
 * `TECHNICAL_SPEC.md` §7.1.
 *
 * Thin on purpose. Each action does the five things §7.1 names and nothing
 * else: (1) `requireWrite` on the record route, naming the action for the
 * denial row; (2) zod parse from `./schemas`; (3) the work, in
 * `./server/*.ts`, which takes a `RequestContext` and an instant so it runs
 * under an integration test with no `next/headers` in sight; (4) `ActionResult`
 * out, never a throw across the boundary; (5) `revalidatePath` so the record
 * page re-renders from server state.
 *
 * **Nothing here is optimistic.** A confirmed condition, a re-matched entry
 * and a void are legal facts; the dialog waits for the result and the page
 * re-renders from what `src/data` holds (design §0.16).
 *
 * `redirect()` is called outside the `try`, as `src/features/auth/actions.ts`
 * does: Next signals it by throwing, and a catch that turned it into an
 * `ActionResult` would leave the caller on a record that no longer exists for
 * it.
 */

const RECORD_ROUTE = "/batteries/[id]" as const;

/** What the condition dialog is told when the save lands. */
export interface RecordDamageAssessmentResult {
  readonly assessmentId: Uuid;
  readonly status: BatteryRecordStatus;
  readonly classification: "decided" | "blocked" | "unresolved";
  readonly missingInput: ClassificationMissingInput | null;
}

export async function recordDamageAssessment(
  input: unknown,
): Promise<ActionResult<RecordDamageAssessmentResult>> {
  const guard = await requireWrite(RECORD_ROUTE, "recordDamageAssessment");
  if (!guard.ok) return guard;
  const { ctx } = guard;

  try {
    const parsed = recordDamageAssessmentSchema.safeParse(input);
    if (!parsed.success) {
      const issue = firstIssue(parsed.error);
      return actionFailed({
        code: "VALIDATION",
        message: issue.message,
        ...(issue.field === undefined ? {} : { field: issue.field }),
        correlationId: ctx.correlationId,
      });
    }

    const outcome = await recordDamageAssessmentFor(ctx, parsed.data, nowIso());
    revalidatePath(`/batteries/${parsed.data.recordId}`);

    return actionSucceeded({
      assessmentId: outcome.assessment.id,
      status: outcome.record.status,
      classification: outcome.reclassification.kind,
      missingInput: outcome.reclassification.missingInput,
    });
  } catch (error) {
    return actionFailedFrom(error, ctx.correlationId);
  }
}

export async function findCatalogCandidatesForRecord(
  input: unknown,
): Promise<ActionResult<readonly CatalogCandidateView[]>> {
  const guard = await requireWrite(
    RECORD_ROUTE,
    "findCatalogCandidatesForRecord",
  );
  if (!guard.ok) return guard;
  const { ctx } = guard;

  try {
    const parsed = findCatalogCandidatesSchema.safeParse(input);
    if (!parsed.success) {
      return actionFailed({
        code: "VALIDATION",
        message: firstIssue(parsed.error).message,
        correlationId: ctx.correlationId,
      });
    }
    return actionSucceeded(await findCandidatesFor(ctx, parsed.data.recordId));
  } catch (error) {
    return actionFailedFrom(error, ctx.correlationId);
  }
}

export interface ApplyCatalogRematchResult {
  readonly status: BatteryRecordStatus;
  readonly changedFields: readonly string[];
  readonly classification: "decided" | "blocked" | "unresolved";
  readonly missingInput: ClassificationMissingInput | null;
}

export async function applyCatalogRematch(
  input: unknown,
): Promise<ActionResult<ApplyCatalogRematchResult>> {
  const guard = await requireWrite(RECORD_ROUTE, "applyCatalogRematch");
  if (!guard.ok) return guard;
  const { ctx } = guard;

  try {
    const parsed = applyCatalogRematchSchema.safeParse(input);
    if (!parsed.success) {
      const issue = firstIssue(parsed.error);
      return actionFailed({
        code: "VALIDATION",
        message: issue.message,
        ...(issue.field === undefined ? {} : { field: issue.field }),
        correlationId: ctx.correlationId,
      });
    }

    const outcome = await applyCatalogRematchFor(ctx, parsed.data, nowIso());
    revalidatePath(`/batteries/${parsed.data.recordId}`);

    return actionSucceeded({
      status: outcome.record.status,
      changedFields: outcome.changedFields,
      classification: outcome.reclassification.kind,
      missingInput: outcome.reclassification.missingInput,
    });
  } catch (error) {
    return actionFailedFrom(error, ctx.correlationId);
  }
}

export async function voidBatteryRecord(
  input: unknown,
): Promise<ActionResult<never>> {
  const guard = await requireWrite(RECORD_ROUTE, "voidBatteryRecord");
  if (!guard.ok) return guard;
  const { ctx } = guard;

  try {
    const parsed = voidBatteryRecordSchema.safeParse(input);
    if (!parsed.success) {
      const issue = firstIssue(parsed.error);
      return actionFailed<never>({
        code: "VALIDATION",
        message: issue.message,
        ...(issue.field === undefined ? {} : { field: issue.field }),
        correlationId: ctx.correlationId,
      });
    }

    await voidBatteryRecordFor(ctx, parsed.data, nowIso());
    revalidatePath("/batteries");
    revalidatePath(`/batteries/${parsed.data.recordId}`);
  } catch (error) {
    return actionFailedFrom<never>(error, ctx.correlationId);
  }

  redirect("/batteries");
}
