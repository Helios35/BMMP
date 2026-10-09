import "server-only";

import { data } from "@/data";
import type {
  PageRequest,
  RequestContext,
  ShipmentQuery,
} from "@/data/contracts";
import { isAppError } from "@/lib/errors";
import type { Uuid } from "@/types/common";
import type { DocumentRender, Shipment } from "@/types/documents";

/**
 * The `/shipments` ledger read — `UX_SPEC.md` §3.11.
 *
 * Each row carries its record and container counts — membership derives
 * through the container (`ERD.md` §11.1) — the state of its newest shipping
 * paper, and whether a fully-regulated record leaves the manifest outstanding,
 * so the ledger never shows a green tick on a shipment that is not fully
 * documented (E-14).
 */

const CONTAINER_LIMIT = 200;
const RECORD_LIMIT = 1000;
const DESTINATION_LIMIT = 200;

export type PaperState = "none" | "issued" | "voided" | "superseded";

export interface ShipmentListRow {
  readonly shipment: Shipment;
  readonly recordCount: number;
  readonly containerCount: number;
  readonly paper: PaperState;
  readonly paperRender: DocumentRender | null;
  /** D-36 — a fully-regulated record is on the shipment and the manifest is outstanding. */
  readonly manifestOutstanding: boolean;
}

export interface ShipmentListResult {
  readonly rows: readonly ShipmentListRow[];
  readonly total: number;
  readonly error?: {
    readonly message: string;
    readonly correlationId?: string;
  };
}

/** The newest paper's render, and its state. */
export async function newestPaper(
  ctx: RequestContext,
  shipmentId: Uuid,
): Promise<{
  readonly state: PaperState;
  readonly render: DocumentRender | null;
}> {
  const papers = await data.shippingPapers.list(ctx, {
    shipmentId,
    limit: 1,
  });
  const [paper] = papers.items;
  if (paper === undefined) return { state: "none", render: null };
  const render = await data.documentRenders.get(ctx, paper.documentRenderId);
  if (render === null) return { state: "none", render: null };
  const state: PaperState =
    render.status === "voided"
      ? "voided"
      : render.status === "superseded"
        ? "superseded"
        : "issued";
  return { state, render };
}

/** Whether any record on the shipment is governed by a fully-regulated decision (D-36). */
export async function holdsFullyRegulated(
  ctx: RequestContext,
  recordIds: readonly Uuid[],
): Promise<boolean> {
  for (const batteryRecordId of recordIds) {
    const decisions = await data.classificationDecisions.list(ctx, {
      batteryRecordId,
      status: "active",
      limit: 1,
    });
    if (decisions.items[0]?.wasteClassification === "fully_regulated") {
      return true;
    }
  }
  return false;
}

export async function readShipmentList(
  ctx: RequestContext,
  query: ShipmentQuery & PageRequest,
): Promise<ShipmentListResult> {
  try {
    const page = await data.shipments.list(ctx, query);
    const rows: ShipmentListRow[] = [];
    for (const shipment of page.items) {
      const containers = await data.containers.list(ctx, {
        shipmentId: shipment.id,
        limit: CONTAINER_LIMIT,
      });
      const records =
        containers.items.length === 0
          ? []
          : (
              await data.batteryRecords.list(ctx, {
                containerIds: containers.items.map((container) => container.id),
                excludeVoided: true,
                excludeDrafts: true,
                limit: RECORD_LIMIT,
              })
            ).items;
      const paper = await newestPaper(ctx, shipment.id);
      rows.push({
        shipment,
        recordCount: records.length,
        containerCount: containers.items.length,
        paper: paper.state,
        paperRender: paper.render,
        manifestOutstanding: await holdsFullyRegulated(
          ctx,
          records.map((record) => record.id),
        ),
      });
    }
    return { rows, total: page.total };
  } catch (cause) {
    // A records-service failure renders the table's error state with Retry;
    // anything else is loud (`TECHNICAL_SPEC.md` §10.1).
    if (!isAppError(cause) || cause.code !== "INTEGRATION") throw cause;
    console.error("[shipments] the shipment ledger could not be read", cause);
    return {
      rows: [],
      total: 0,
      error: { message: cause.userMessage, correlationId: cause.correlationId },
    };
  }
}

/** The destination filter's options — every facility this organization has shipped to. */
export async function shipmentDestinations(
  ctx: RequestContext,
): Promise<readonly string[]> {
  const page = await data.shipments.list(ctx, { limit: DESTINATION_LIMIT });
  return [
    ...new Set(page.items.map((shipment) => shipment.destinationFacilityName)),
  ].sort((a, b) => a.localeCompare(b));
}
