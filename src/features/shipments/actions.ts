"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";

import type {
  RequestContext,
  ShipmentContentsChangeResult,
} from "@/data/contracts";
import type { AppRoute } from "@/domain/access/routes";
import { firstIssue } from "@/features/intake/schemas";
import type { RequestAttribution } from "@/features/intake/server/audit";
import { requestAttribution } from "@/features/intake/server/session-action";
import {
  actionFailed,
  actionFailedFrom,
  actionSucceeded,
  type ActionResult,
} from "@/lib/action-result";
import { requireWrite } from "@/lib/auth/guard";
import { recordNotFound } from "@/lib/auth/record-denial";
import { nowIso } from "@/lib/auth/session";
import { NotFoundError } from "@/lib/errors";
import type { Uuid } from "@/types/common";

import {
  arrivalSchema,
  assembleShipmentSchema,
  changeContentsSchema,
  recordTransportSchema,
  shipmentIdSchema,
  transportDetails,
  voidPaperSchema,
} from "./schemas";
import {
  assembleShipment as assemble,
  changeShipmentContents,
  departShipment,
  generateShippingPaper as generate,
  recordShipmentArrival,
  recordShipmentTransport,
  storeShippingPaperDraft,
  voidShippingPaper,
} from "./server/writes";

/**
 * The shipment Server Actions — `UX_SPEC.md` §3.12, §3.13;
 * `SITE_ARCHITECTURE.md` Flow B.
 *
 * Every action runs the same steps (`TECHNICAL_SPEC.md` §7.1): the write guard
 * — **P1 and P6 hold it**, and a refusal is audited as an attempt (Rules 1.16,
 * 12.6) and names who can (Rule 1.26) — then a zod parse, the adapter's one
 * operation, and a refresh. **None is optimistic**: the screen re-reads what
 * the server wrote.
 *
 * **There is no input through which a caller sends a paper, a shipping
 * identifier, a status or an air override.** Generate rebuilds the paper from
 * the rows at commit; the air block is the adapter's to refuse, and it is
 * refused for every role (Rule 6.8).
 */

async function shipmentAction<TInput, TData>(
  route: AppRoute,
  attempted: string,
  schema: z.ZodType<TInput>,
  input: unknown,
  run: (
    ctx: RequestContext,
    parsed: TInput,
    attribution: RequestAttribution,
  ) => Promise<TData>,
): Promise<ActionResult<TData>> {
  const guard = await requireWrite(route, attempted);
  if (!guard.ok) return guard;
  const { ctx } = guard;

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const issue = firstIssue(parsed.error);
    return actionFailed<TData>({
      code: "VALIDATION",
      message: issue.message,
      ...(issue.field === undefined ? {} : { field: issue.field }),
      correlationId: ctx.correlationId,
    });
  }

  try {
    const result = await run(ctx, parsed.data, await requestAttribution());
    // Shipments, containers, records, the dashboard and the documents all
    // read what a shipment write changes.
    revalidatePath("/", "layout");
    return actionSucceeded(result);
  } catch (error) {
    const shipmentId = (parsed.data as { shipmentId?: unknown }).shipmentId;
    if (error instanceof NotFoundError && typeof shipmentId === "string") {
      await recordNotFound(ctx, "shipment", shipmentId);
    }
    return actionFailedFrom<TData>(error, ctx.correlationId);
  }
}

/** Step 2's **Save and review** on a new shipment — Flow B1–B2. */
export async function assembleShipment(
  input: unknown,
): Promise<ActionResult<{ readonly shipmentId: Uuid }>> {
  return shipmentAction(
    "/shipments/new",
    "assembleShipment",
    assembleShipmentSchema,
    input,
    async (ctx, parsed, attribution) => {
      const shipment = await assemble(
        ctx,
        {
          containerIds: parsed.containerIds,
          transport: transportDetails(parsed),
        },
        nowIso(),
        attribution,
      );
      return { shipmentId: shipment.id };
    },
  );
}

/** Step 1 on an existing shipment — voids an issued paper (Rule 5.13). */
export async function changeContents(
  input: unknown,
): Promise<ActionResult<ShipmentContentsChangeResult>> {
  return shipmentAction(
    "/shipments/new",
    "changeShipmentContents",
    changeContentsSchema,
    input,
    async (ctx, parsed, attribution) =>
      changeShipmentContents(
        ctx,
        {
          shipmentId: parsed.shipmentId,
          containerIds: parsed.containerIds,
          reason: parsed.reason,
        },
        nowIso(),
        attribution,
      ),
  );
}

/** Step 2 on an existing shipment. Air holding a damaged record is refused and audited. */
export async function recordTransport(
  input: unknown,
): Promise<ActionResult<{ readonly shipmentId: Uuid }>> {
  return shipmentAction(
    "/shipments/new",
    "recordShipmentTransport",
    recordTransportSchema,
    input,
    async (ctx, parsed, attribution) => {
      const shipment = await recordShipmentTransport(
        ctx,
        { shipmentId: parsed.shipmentId, transport: transportDetails(parsed) },
        nowIso(),
        attribution,
      );
      return { shipmentId: shipment.id };
    },
  );
}

/** Step 3's **Generate shipping paper** — Flow B4. The paper is rebuilt here, at commit. */
export async function generateShippingPaper(
  input: unknown,
): Promise<ActionResult<{ readonly shipmentId: Uuid }>> {
  return shipmentAction(
    "/shipments/new",
    "generateShippingPaper",
    shipmentIdSchema,
    input,
    async (ctx, parsed, attribution) => {
      const issued = await generate(
        ctx,
        parsed.shipmentId,
        nowIso(),
        attribution,
      );
      return { shipmentId: issued.shipment.id };
    },
  );
}

/** **Record departure** on `/shipments/[id]` — Rule 5.17. */
export async function recordDeparture(
  input: unknown,
): Promise<ActionResult<{ readonly shipmentId: Uuid }>> {
  return shipmentAction(
    "/shipments/[id]",
    "recordShipmentDeparture",
    shipmentIdSchema,
    input,
    async (ctx, parsed, attribution) => {
      const result = await departShipment(
        ctx,
        parsed.shipmentId,
        nowIso(),
        attribution,
      );
      return { shipmentId: result.shipment.id };
    },
  );
}

/** **Record arrival** on `/shipments/[id]` — Rule 5.26. */
export async function recordArrival(
  input: unknown,
): Promise<ActionResult<{ readonly shipmentId: Uuid }>> {
  return shipmentAction(
    "/shipments/[id]",
    "recordShipmentArrival",
    arrivalSchema,
    input,
    async (ctx, parsed, attribution) => {
      const shipment = await recordShipmentArrival(
        ctx,
        {
          shipmentId: parsed.shipmentId,
          receivedConfirmationRef: parsed.receivedConfirmationRef,
        },
        nowIso(),
        attribution,
      );
      return { shipmentId: shipment.id };
    },
  );
}

/**
 * **Void the paper** on `/shipments/[id]` — D-58 item 8. One audited act with
 * a stated reason; the paper is kept, marked and readable, and the shipment
 * returns to needing a new one.
 */
export async function voidPaper(
  input: unknown,
): Promise<ActionResult<{ readonly shipmentId: Uuid }>> {
  return shipmentAction(
    "/shipments/[id]",
    "voidShippingPaper",
    voidPaperSchema,
    input,
    async (ctx, parsed, attribution) => {
      const result = await voidShippingPaper(
        ctx,
        { shipmentId: parsed.shipmentId, reason: parsed.reason },
        nowIso(),
        attribution,
      );
      return { shipmentId: result.shipment.id };
    },
  );
}

/**
 * Step 3's **Print draft** / **Download draft** — D-58 item 9; Rule 5.28. The
 * draft is rendered and stored as a `draft` render now, because someone is
 * about to print or download it; the browser then streams that render's
 * stored bytes like any other document. The checklist is untouched.
 */
export async function storeDraftPaper(
  input: unknown,
): Promise<ActionResult<{ readonly documentRenderId: Uuid }>> {
  return shipmentAction(
    "/shipments/new",
    "storeShippingPaperDraft",
    shipmentIdSchema,
    input,
    async (ctx, parsed, attribution) => {
      const render = await storeShippingPaperDraft(
        ctx,
        parsed.shipmentId,
        nowIso(),
        attribution,
      );
      return { documentRenderId: render.id };
    },
  );
}
