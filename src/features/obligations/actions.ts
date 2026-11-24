"use server";

import { revalidatePath } from "next/cache";

import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import {
  mayTakeProducerAction,
  type ProducerAction,
} from "@/domain/access/producer-actions";
import type { RunTrigger } from "@/domain/producer";
import {
  actionFailed,
  actionFailedFrom,
  actionSucceeded,
  type ActionResult,
} from "@/lib/action-result";
import { requireActionOn } from "@/lib/auth/guard";
import { nowIso } from "@/lib/auth/session";
import { requestAttribution } from "@/features/intake/server/session-action";

import { ACT_REFUSAL, PRODUCT_RAN_BUT_CHECK_FAILED } from "./obligation-copy";
import {
  addProductSchema,
  changeStatesSchema,
  markDoneSchema,
  packetSchema,
  recordSalesSchema,
  removeProductSchema,
  reopenSchema,
} from "./schemas";
import {
  issuePacketFor,
  readPacketPreview,
  type PacketPreview,
} from "./server/packets";
import { checkObligationsFor } from "./server/run";

/**
 * The obligations page's acts — `UX_SPEC.md` §3.21; Rules 8.6, 8.11, 8.12,
 * 8.15.
 *
 * Thin, as every action is: (1) the guard — `/obligations` is a route the
 * role reads and the producer action map lets it act, and a refusal is
 * audited; (2) zod; (3) the write through `src/data`; (4) `ActionResult`,
 * never a throw across the boundary; (5) revalidate. **A product change sets a
 * run going** (Rule 8.11): the product is saved first, and if the run then
 * fails the reader is told to press Check now rather than shown a stale
 * answer as current.
 */

const ROUTE = "/obligations";

async function guarded(
  attempted: string,
  action: ProducerAction,
): Promise<
  | { readonly ok: true; readonly ctx: RequestContext }
  | { readonly ok: false; readonly result: ActionResult<never> }
> {
  const guard = await requireActionOn(
    ROUTE,
    attempted,
    (role) => mayTakeProducerAction(role, action),
    ACT_REFUSAL,
  );
  return guard.ok ? { ok: true, ctx: guard.ctx } : { ok: false, result: guard };
}

function invalid(
  ctx: RequestContext,
  issues: readonly { readonly message: string }[],
  fallback: string,
): ActionResult<never> {
  return actionFailed({
    code: "VALIDATION",
    message: issues[0]?.message ?? fallback,
    correlationId: ctx.correlationId,
  });
}

/** After a product change: the run, or a stated failure that keeps the change. */
async function runAfterProductChange(
  ctx: RequestContext,
  trigger: Exclude<RunTrigger, "nightly_job" | "check_now">,
): Promise<{ readonly checked: boolean }> {
  try {
    await checkObligationsFor(
      ctx,
      nowIso(),
      await requestAttribution(),
      trigger,
    );
    return { checked: true };
  } catch (cause) {
    console.error(
      `[obligations] the run after a product change failed (correlationId=${ctx.correlationId})`,
      cause,
    );
    return { checked: false };
  }
}

export async function addProduct(
  input: unknown,
): Promise<
  ActionResult<{ readonly id: string; readonly note: string | null }>
> {
  const guard = await guarded("addProducerProduct", "manage_products");
  if (!guard.ok) return guard.result;
  const { ctx } = guard;
  const parsed = addProductSchema.safeParse(input);
  if (!parsed.success) {
    return invalid(ctx, parsed.error.issues, "The product could not be added.");
  }
  try {
    const product = await data.producerProducts.add(ctx, {
      catalogEntryId: parsed.data.catalogEntryId,
      jurisdictionIds: parsed.data.jurisdictionIds,
      at: nowIso(),
      attribution: await requestAttribution(),
    });
    const run = await runAfterProductChange(ctx, "product_added");
    revalidatePath(ROUTE);
    return actionSucceeded({
      id: product.id,
      note: run.checked ? null : PRODUCT_RAN_BUT_CHECK_FAILED,
    });
  } catch (error) {
    return actionFailedFrom(error, ctx.correlationId);
  }
}

export async function changeProductStates(
  input: unknown,
): Promise<ActionResult<{ readonly note: string | null }>> {
  const guard = await guarded("changeProducerProductStates", "manage_products");
  if (!guard.ok) return guard.result;
  const { ctx } = guard;
  const parsed = changeStatesSchema.safeParse(input);
  if (!parsed.success) {
    return invalid(ctx, parsed.error.issues, "The states could not be saved.");
  }
  try {
    await data.producerProducts.changeStates(ctx, parsed.data.productId, {
      jurisdictionIds: parsed.data.jurisdictionIds,
      at: nowIso(),
      attribution: await requestAttribution(),
    });
    const run = await runAfterProductChange(ctx, "product_changed");
    revalidatePath(ROUTE);
    return actionSucceeded({
      note: run.checked ? null : PRODUCT_RAN_BUT_CHECK_FAILED,
    });
  } catch (error) {
    return actionFailedFrom(error, ctx.correlationId);
  }
}

export async function removeProduct(
  input: unknown,
): Promise<ActionResult<{ readonly note: string | null }>> {
  const guard = await guarded("removeProducerProduct", "manage_products");
  if (!guard.ok) return guard.result;
  const { ctx } = guard;
  const parsed = removeProductSchema.safeParse(input);
  if (!parsed.success) {
    return invalid(
      ctx,
      parsed.error.issues,
      "The product could not be removed.",
    );
  }
  try {
    await data.producerProducts.remove(ctx, parsed.data.productId, {
      reason: parsed.data.reason,
      at: nowIso(),
      attribution: await requestAttribution(),
    });
    const run = await runAfterProductChange(ctx, "product_removed");
    revalidatePath(ROUTE);
    return actionSucceeded({
      note: run.checked ? null : PRODUCT_RAN_BUT_CHECK_FAILED,
    });
  } catch (error) {
    return actionFailedFrom(error, ctx.correlationId);
  }
}

export async function checkNow(): Promise<
  ActionResult<{ readonly evaluatedAt: string; readonly written: number }>
> {
  const guard = await guarded("checkProducerObligations", "check_now");
  if (!guard.ok) return guard.result;
  const { ctx } = guard;
  try {
    const recorded = await checkObligationsFor(
      ctx,
      nowIso(),
      await requestAttribution(),
      "check_now",
    );
    revalidatePath("/", "layout");
    return actionSucceeded({
      evaluatedAt: recorded.evaluatedAt,
      written: recorded.counts.written,
    });
  } catch (error) {
    return actionFailedFrom(error, ctx.correlationId);
  }
}

export async function markDeadlineDone(
  input: unknown,
): Promise<ActionResult<{ readonly id: string }>> {
  const guard = await guarded("completeObligationDeadline", "mark_deadline");
  if (!guard.ok) return guard.result;
  const { ctx } = guard;
  const parsed = markDoneSchema.safeParse(input);
  if (!parsed.success) {
    return invalid(
      ctx,
      parsed.error.issues,
      "The deadline could not be marked done.",
    );
  }
  try {
    const deadline = await data.obligationDeadlines.complete(
      ctx,
      parsed.data.deadlineId,
      {
        completedOn: parsed.data.completedOn,
        note: parsed.data.note,
        reference: parsed.data.reference ?? null,
        evidenceDocumentRenderId: parsed.data.evidenceDocumentRenderId ?? null,
        at: nowIso(),
        attribution: await requestAttribution(),
      },
    );
    revalidatePath("/", "layout");
    return actionSucceeded({ id: deadline.id });
  } catch (error) {
    return actionFailedFrom(error, ctx.correlationId);
  }
}

export async function reopenDeadline(
  input: unknown,
): Promise<ActionResult<{ readonly id: string }>> {
  const guard = await guarded("reopenObligationDeadline", "mark_deadline");
  if (!guard.ok) return guard.result;
  const { ctx } = guard;
  const parsed = reopenSchema.safeParse(input);
  if (!parsed.success) {
    return invalid(
      ctx,
      parsed.error.issues,
      "The deadline could not be reopened.",
    );
  }
  try {
    const deadline = await data.obligationDeadlines.reopen(
      ctx,
      parsed.data.deadlineId,
      {
        reason: parsed.data.reason,
        at: nowIso(),
        attribution: await requestAttribution(),
      },
    );
    revalidatePath("/", "layout");
    return actionSucceeded({ id: deadline.id });
  } catch (error) {
    return actionFailedFrom(error, ctx.correlationId);
  }
}

/**
 * **Record sales** — Rule 8.17. Recording again for the same product, state
 * and year is a correction; the old entry is kept and shown as replaced.
 */
export async function recordSales(
  input: unknown,
): Promise<ActionResult<{ readonly id: string; readonly corrected: boolean }>> {
  const guard = await guarded("recordProducerSales", "record_sales");
  if (!guard.ok) return guard.result;
  const { ctx } = guard;
  const parsed = recordSalesSchema.safeParse(input);
  if (!parsed.success) {
    return invalid(
      ctx,
      parsed.error.issues,
      "The sales could not be recorded.",
    );
  }
  try {
    const recorded = await data.producerSales.record(ctx, {
      producerProductId: parsed.data.productId,
      jurisdictionId: parsed.data.jurisdictionId,
      year: parsed.data.year,
      units: parsed.data.units,
      basisNote: parsed.data.basisNote,
      at: nowIso(),
      attribution: await requestAttribution(),
    });
    revalidatePath(ROUTE);
    return actionSucceeded({
      id: recorded.record.id,
      corrected: recorded.replaced !== null,
    });
  } catch (error) {
    return actionFailedFrom(error, ctx.correlationId);
  }
}

/**
 * What **Make packet** would issue — Rules 8.19–8.21. Every filled value and
 * every gap, before anything is issued; nothing is stored.
 */
export async function previewPacket(
  input: unknown,
): Promise<ActionResult<PacketPreview>> {
  const guard = await guarded("previewFilingPacket", "make_packets");
  if (!guard.ok) return guard.result;
  const { ctx } = guard;
  const parsed = packetSchema.safeParse(input);
  if (!parsed.success) {
    return invalid(
      ctx,
      parsed.error.issues,
      "The packet could not be prepared.",
    );
  }
  try {
    return actionSucceeded(
      await readPacketPreview(
        ctx,
        parsed.data.deadlineId,
        nowIso(),
        parsed.data.year,
      ),
    );
  } catch (error) {
    return actionFailedFrom(error, ctx.correlationId);
  }
}

/**
 * **Issue packet** — one deliberate act, no draft (Rule 8.19). It never
 * marks the deadline done; a new packet supersedes the deadline's last one.
 */
export async function issuePacket(input: unknown): Promise<
  ActionResult<{
    readonly id: string;
    readonly supersededId: string | null;
  }>
> {
  const guard = await guarded("issueFilingPacket", "make_packets");
  if (!guard.ok) return guard.result;
  const { ctx } = guard;
  const parsed = packetSchema.safeParse(input);
  if (!parsed.success) {
    return invalid(ctx, parsed.error.issues, "The packet could not be issued.");
  }
  try {
    const issued = await issuePacketFor(
      ctx,
      parsed.data.deadlineId,
      nowIso(),
      parsed.data.year,
      await requestAttribution(),
    );
    revalidatePath(ROUTE);
    return actionSucceeded({
      id: issued.documentRender.id,
      supersededId: issued.supersededDocumentRenderId,
    });
  } catch (error) {
    return actionFailedFrom(error, ctx.correlationId);
  }
}
