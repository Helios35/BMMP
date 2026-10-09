import "server-only";

import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import { canReadRoute } from "@/domain/access/route-capability";
import {
  DOCUMENT_RENDER_STATUSES,
  DOCUMENT_RENDER_STATUS_LABELS,
} from "@/domain/taxonomy/document-render-status";
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
} from "@/domain/taxonomy/document-type";
import { readTaxonomyValue } from "@/domain/taxonomy/lookup";
import {
  readStoredPaperHeader,
  type StoredPaperHeader,
} from "@/domain/transport/stored-paper";
import { absoluteInstant } from "@/features/battery-record/format-instant";
import { resolveUserNames } from "@/features/battery-record/user-names";
import { DocumentIntegrityError, NotFoundError } from "@/lib/errors";
import type { Sha256, TimeZone } from "@/types/common";
import type {
  ContainerLabel,
  DocumentRender,
  Shipment,
  ShippingPaper,
} from "@/types/documents";
import type { Container } from "@/types/storage";

/**
 * What `/documents/[id]` and the Label tab show about one render —
 * `UX_SPEC.md` §2.8, §3.14.
 *
 * **Every value is the render's own, or its frozen row's**: a
 * `container_label`'s phrase, contents and start date are the label row's as
 * printed, never today's container re-read (Rules 4.19, 4.20). The page the
 * viewer shows is composed from those rows — the stored file is what a
 * download streams.
 */

export interface DocumentSource {
  readonly label: string;
  readonly href: string | null;
}

export type DocumentPage =
  | {
      readonly kind: "container_label";
      readonly label: ContainerLabel;
      readonly container: Container | null;
    }
  /**
   * A shipping paper — its lines from its own `shipping_paper` row, its header
   * from the render's stored input, never today's shipment (Rules 5.12, 5.14).
   */
  | {
      readonly kind: "shipping_paper";
      readonly paper: ShippingPaper;
      readonly header: StoredPaperHeader | null;
      readonly shipment: Shipment | null;
      readonly shipper: string;
    }
  /** A type whose page arrives with its own unit — shown as the render's own record. */
  | { readonly kind: "render_record" };

/**
 * The render's stored file, as a read of it found it — `TECHNICAL_SPEC.md`
 * §8.4. **Stored** is bytes that re-hash to the row's `content_hash`;
 * **absent** is a render with no file behind it (the fixtures that predate
 * document generation); **integrity failed** is bytes that no longer hash —
 * never shown, never served.
 */
export type StoredFile =
  | { readonly state: "stored"; readonly contentHash: Sha256 }
  | { readonly state: "absent" }
  | { readonly state: "integrity_failed"; readonly message: string };

/** A void's reason and actor, from its audit row (Rule 5.14), for a role that reads the log. */
export interface VoidRecord {
  readonly at: string;
  readonly actor: string;
  readonly reason: string | null;
}

export interface DocumentView {
  readonly render: DocumentRender;
  readonly storedFile: StoredFile;
  /**
   * Null when the render is not voided, or when the role cannot read the
   * audit log the reason lives on (Rule 12.8) — the marking then says where
   * it is recorded.
   */
  readonly voidRecord: VoidRecord | null;
  readonly typeLabel: string;
  readonly statusLabel: string;
  readonly generatedAt: string;
  readonly generatedBy: string;
  readonly source: DocumentSource;
  /** The zone every instant on the page is read in (Rule 4.29). */
  readonly timeZone: TimeZone;
  readonly supersededBy: DocumentRender | null;
  readonly page: DocumentPage;
}

async function readStoredFile(
  ctx: RequestContext,
  render: DocumentRender,
): Promise<StoredFile> {
  try {
    const stored = await data.documentRenders.readBytes(ctx, render.id);
    return { state: "stored", contentHash: stored.contentHash };
  } catch (error) {
    // Both outcomes are states the page shows, stated; anything else is not
    // ours to interpret and goes on up.
    if (error instanceof NotFoundError) return { state: "absent" };
    if (error instanceof DocumentIntegrityError) {
      return { state: "integrity_failed", message: error.userMessage };
    }
    throw error;
  }
}

async function readVoidRecord(
  ctx: RequestContext,
  render: DocumentRender,
  timeZone: TimeZone,
): Promise<VoidRecord | null> {
  if (render.status !== "voided" || !canReadRoute(ctx.role, "/audit")) {
    return null;
  }
  const page = await data.auditEvents.list(ctx, {
    entityId: render.id,
    eventType: "document_render.voided",
    limit: 1,
  });
  const event = page.items[0];
  if (event === undefined) return null;
  const names =
    event.actorUserId === null
      ? new Map<string, string>()
      : await resolveUserNames(ctx, [event.actorUserId]);
  return {
    at: absoluteInstant(event.occurredAt, timeZone),
    actor:
      event.actorUserId === null
        ? (event.actorLabel ?? "Not recorded")
        : (names.get(event.actorUserId) ?? "Not recorded"),
    reason: event.reason,
  };
}

export async function readDocument(
  ctx: RequestContext,
  render: DocumentRender,
): Promise<DocumentView> {
  const [organization, labels, papers, successors, container, shipment, names] =
    await Promise.all([
      data.organizations.get(ctx, ctx.organizationId),
      render.documentType === "container_label"
        ? data.containerLabels.list(ctx, {
            documentRenderId: render.id,
            limit: 1,
          })
        : Promise.resolve(null),
      render.documentType === "shipping_paper"
        ? data.shippingPapers.list(ctx, {
            documentRenderId: render.id,
            limit: 1,
          })
        : Promise.resolve(null),
      data.documentRenders.list(ctx, {
        ...(render.containerId === null
          ? {}
          : { containerId: render.containerId }),
        ...(render.shipmentId === null
          ? {}
          : { shipmentId: render.shipmentId }),
        documentType: render.documentType,
        limit: 50,
      }),
      render.containerId === null
        ? Promise.resolve(null)
        : data.containers.get(ctx, render.containerId),
      render.shipmentId === null
        ? Promise.resolve(null)
        : data.shipments.get(ctx, render.shipmentId),
      resolveUserNames(ctx, [render.renderedBy]),
    ]);

  const timeZone = container?.siteTimeZone ?? organization?.timeZone ?? "UTC";

  const type = readTaxonomyValue(
    DOCUMENT_TYPES,
    DOCUMENT_TYPE_LABELS,
    render.documentType,
  );
  const status = readTaxonomyValue(
    DOCUMENT_RENDER_STATUSES,
    DOCUMENT_RENDER_STATUS_LABELS,
    render.status,
  );

  const source: DocumentSource =
    container !== null
      ? {
          label: `Container ${container.containerCode}`,
          href: canReadRoute(ctx.role, "/containers/[id]")
            ? `/containers/${container.id}`
            : null,
        }
      : shipment !== null
        ? {
            label: `Shipment ${shipment.shipmentNumber}`,
            href: canReadRoute(ctx.role, "/shipments/[id]")
              ? `/shipments/${shipment.id}`
              : null,
          }
        : { label: "Not recorded", href: null };

  const label = labels?.items[0] ?? null;
  const paper = papers?.items[0] ?? null;
  const page: DocumentPage =
    render.documentType === "container_label" && label !== null
      ? { kind: "container_label", label, container }
      : render.documentType === "shipping_paper" && paper !== null
        ? {
            kind: "shipping_paper",
            paper,
            header: readStoredPaperHeader(render.inputSnapshot),
            shipment,
            shipper:
              organization === null
                ? "Not recorded"
                : (organization.legalName ?? organization.name),
          }
        : { kind: "render_record" };

  const [storedFile, voidRecord] = await Promise.all([
    readStoredFile(ctx, render),
    readVoidRecord(ctx, render, timeZone),
  ]);

  return {
    render,
    storedFile,
    voidRecord,
    typeLabel: type.recognised ? type.label : type.storedValue,
    statusLabel: status.recognised ? status.label : status.storedValue,
    generatedAt: absoluteInstant(render.renderedAt, timeZone),
    generatedBy: names.get(render.renderedBy) ?? "Not recorded",
    source,
    timeZone,
    supersededBy:
      successors.items.find(
        (candidate) => candidate.supersedesDocumentRenderId === render.id,
      ) ?? null,
    page,
  };
}
