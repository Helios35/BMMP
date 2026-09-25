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
import { absoluteInstant } from "@/features/battery-record/format-instant";
import { resolveUserNames } from "@/features/battery-record/user-names";
import type { TimeZone } from "@/types/common";
import type { ContainerLabel, DocumentRender } from "@/types/documents";
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
  /** A type whose page arrives with its own unit — shown as the render's own record. */
  | { readonly kind: "render_record" };

export interface DocumentView {
  readonly render: DocumentRender;
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

export async function readDocument(
  ctx: RequestContext,
  render: DocumentRender,
): Promise<DocumentView> {
  const [organization, labels, successors, container, shipment, names] =
    await Promise.all([
      data.organizations.get(ctx, ctx.organizationId),
      render.documentType === "container_label"
        ? data.containerLabels.list(ctx, {
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
  const page: DocumentPage =
    render.documentType === "container_label" && label !== null
      ? { kind: "container_label", label, container }
      : { kind: "render_record" };

  return {
    render,
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
