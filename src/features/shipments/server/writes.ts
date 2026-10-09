import "server-only";

import { data } from "@/data";
import type {
  IssuedShippingPaper,
  RequestContext,
  ShipmentContentsChangeResult,
  ShipmentDepartureResult,
  ShipmentTransportDetails,
  StorageWriteAttribution,
  VoidedShippingPaper,
} from "@/data/contracts";
import { preDocumentStatus } from "@/domain/transport/shipping-paper";
import {
  composeShippingPaper,
  composeShippingPaperDraft,
} from "@/features/documents/server/compose";
import { NotFoundError, ValidationError } from "@/lib/errors";
import type { IsoTimestamp, Uuid } from "@/types/common";
import type { DocumentRender, Shipment } from "@/types/documents";

import { shipperName } from "../paper-view";
import { DRAFT_DETAIL, PAPER_GAP } from "../shipment-copy";

import {
  activeOrganization,
  readShippingPaperBuild,
  resolveTransportRules,
  shipmentContainers,
} from "./paper-build";

/**
 * The shipment writes, as the Server Actions run them — Flow B.
 *
 * Each is the adapter's one operation, and then **T-28's derived `ready`
 * settled from the builder** against the rows the write just produced: a
 * shipment sits in `ready` because the Rule 5.3 precondition set is met,
 * never because someone said so. Generate is the one write that reads the
 * build **before** it writes — server side, at commit — and hands the adapter
 * nothing but the builder's complete outcome.
 *
 * Here rather than in the actions file so the integration suite runs the same
 * code the screens do, without a request.
 */

async function shipmentOrThrow(
  ctx: RequestContext,
  shipmentId: Uuid,
): Promise<Shipment> {
  const shipment = await data.shipments.get(ctx, shipmentId);
  if (shipment === null) {
    throw new NotFoundError({
      userMessage: "That shipment was not found. Nothing was changed.",
      correlationId: ctx.correlationId,
      context: { shipmentId },
    });
  }
  return shipment;
}

/** Move a pre-document shipment between `draft` and `ready` to match its checklist. */
export async function settleShipmentReadiness(
  ctx: RequestContext,
  shipment: Shipment,
  at: IsoTimestamp,
  attribution: StorageWriteAttribution,
): Promise<Shipment> {
  if (shipment.status !== "draft" && shipment.status !== "ready") {
    return shipment;
  }
  const { build } = await readShippingPaperBuild(ctx, shipment, at);
  return data.shipments.settleReadiness(ctx, {
    shipmentId: shipment.id,
    readiness: preDocumentStatus(build.checklist),
    at,
    attribution,
  });
}

export async function assembleShipment(
  ctx: RequestContext,
  input: {
    readonly containerIds: readonly Uuid[];
    readonly transport: ShipmentTransportDetails;
  },
  at: IsoTimestamp,
  attribution: StorageWriteAttribution,
): Promise<Shipment> {
  const shipment = await data.shipments.assemble(ctx, {
    containerIds: input.containerIds,
    transport: input.transport,
    at,
    attribution,
  });
  return settleShipmentReadiness(ctx, shipment, at, attribution);
}

export async function changeShipmentContents(
  ctx: RequestContext,
  input: {
    readonly shipmentId: Uuid;
    readonly containerIds: readonly Uuid[];
    readonly reason: string | null;
  },
  at: IsoTimestamp,
  attribution: StorageWriteAttribution,
): Promise<ShipmentContentsChangeResult> {
  const result = await data.shipments.changeContents(ctx, {
    shipmentId: input.shipmentId,
    containerIds: input.containerIds,
    reason: input.reason,
    at,
    attribution,
  });
  const shipment = await settleShipmentReadiness(
    ctx,
    result.shipment,
    at,
    attribution,
  );
  return { ...result, shipment };
}

export async function recordShipmentTransport(
  ctx: RequestContext,
  input: {
    readonly shipmentId: Uuid;
    readonly transport: ShipmentTransportDetails;
  },
  at: IsoTimestamp,
  attribution: StorageWriteAttribution,
): Promise<Shipment> {
  const shipment = await data.shipments.recordTransport(ctx, {
    shipmentId: input.shipmentId,
    transport: input.transport,
    at,
    attribution,
  });
  return settleShipmentReadiness(ctx, shipment, at, attribution);
}

/**
 * **Generate shipping paper** — Flow B4. The build is read again here, at
 * commit, from the rows; an incomplete one issues nothing and says which
 * preconditions are unmet (Rule 5.3). The draft is never a document
 * (Rule 5.28), so there is no path from an incomplete build to a render.
 */
export async function generateShippingPaper(
  ctx: RequestContext,
  shipmentId: Uuid,
  at: IsoTimestamp,
  attribution: StorageWriteAttribution,
): Promise<IssuedShippingPaper> {
  const shipment = await shipmentOrThrow(ctx, shipmentId);
  const { build, organization, rules } = await readShippingPaperBuild(
    ctx,
    shipment,
    at,
  );
  if (build.kind !== "complete") {
    const count = build.checklist.unmet.length;
    throw new ValidationError({
      userMessage:
        `The shipping paper cannot be generated: ${count} ${count === 1 ? "precondition is" : "preconditions are"} unmet. ` +
        "Each is named in the checklist. Nothing was issued (Rule 5.3).",
      correlationId: ctx.correlationId,
      context: { rule: "5.3", unmet: build.checklist.unmet },
    });
  }
  return data.shipments.issueShippingPaper(ctx, {
    shipmentId,
    paper: build.outcome,
    // The bytes are rendered from exactly the outcome the checklist called
    // complete, inside the adapter's one operation (`TECHNICAL_SPEC.md` §8.2).
    compose: composeShippingPaper({
      paper: build.outcome,
      shipperName: shipperName(organization),
      timeZone: rules.timeZone,
    }),
    at,
    attribution,
  });
}

/**
 * **Void the issued paper, with a reason** (D-58 item 8) — so transport
 * details can be corrected. The shipment returns to `draft` and its
 * readiness is settled again from the checklist.
 */
export async function voidShippingPaper(
  ctx: RequestContext,
  input: { readonly shipmentId: Uuid; readonly reason: string },
  at: IsoTimestamp,
  attribution: StorageWriteAttribution,
): Promise<VoidedShippingPaper> {
  const result = await data.shipments.voidShippingPaper(ctx, {
    shipmentId: input.shipmentId,
    reason: input.reason,
    at,
    attribution,
  });
  const shipment = await settleShipmentReadiness(
    ctx,
    result.shipment,
    at,
    attribution,
  );
  return { ...result, shipment };
}

/**
 * **A draft, stored because someone printed or downloaded it** (D-58 item 9;
 * Rule 5.28). The builder's draft as it stands, watermarked not valid. It
 * closes no precondition and writes no `shipping_paper`: the checklist reads
 * the same before and after.
 */
export async function storeShippingPaperDraft(
  ctx: RequestContext,
  shipmentId: Uuid,
  at: IsoTimestamp,
  attribution: StorageWriteAttribution,
): Promise<DocumentRender> {
  const shipment = await shipmentOrThrow(ctx, shipmentId);
  const { build, organization, rules } = await readShippingPaperBuild(
    ctx,
    shipment,
    at,
  );
  return data.documentRenders.storeDraft(ctx, {
    documentType: "shipping_paper",
    shipmentId,
    compose: composeShippingPaperDraft({
      draft: build.draft,
      origin: shipment.originAddress,
      destinationAddress: shipment.destinationAddress,
      destinationIdentifier: shipment.destinationIdentifier,
      carrierIdentifier: shipment.transporterIdentifier,
      shipperName: shipperName(organization),
      gap: PAPER_GAP,
      draftNotice: DRAFT_DETAIL,
      timeZone: rules.timeZone,
    }),
    at,
    attribution,
  });
}

/** **Departure** — the retention rule is resolved for the ship date at the site (Rule 5.18). */
export async function departShipment(
  ctx: RequestContext,
  shipmentId: Uuid,
  at: IsoTimestamp,
  attribution: StorageWriteAttribution,
): Promise<ShipmentDepartureResult> {
  const shipment = await shipmentOrThrow(ctx, shipmentId);
  const [organization, containers] = await Promise.all([
    activeOrganization(ctx),
    shipmentContainers(ctx, shipment.id),
  ]);
  const rules = await resolveTransportRules(ctx, organization, containers, at);
  return data.shipments.recordDeparture(ctx, {
    shipmentId,
    retentionRule: rules.retention,
    at,
    attribution,
  });
}

export async function recordShipmentArrival(
  ctx: RequestContext,
  input: {
    readonly shipmentId: Uuid;
    readonly receivedConfirmationRef: string | null;
  },
  at: IsoTimestamp,
  attribution: StorageWriteAttribution,
): Promise<Shipment> {
  return data.shipments.recordArrival(ctx, {
    shipmentId: input.shipmentId,
    receivedConfirmationRef: input.receivedConfirmationRef,
    at,
    attribution,
  });
}
