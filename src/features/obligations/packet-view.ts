import { basisInstant } from "@/domain/hazard/words";
import {
  DOCUMENT_RENDER_STATUSES,
  DOCUMENT_RENDER_STATUS_LABELS,
} from "@/domain/taxonomy/document-render-status";
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
} from "@/domain/taxonomy/document-type";
import { readTaxonomyValue } from "@/domain/taxonomy/lookup";
import type { TimeZone, Uuid } from "@/types/common";
import type { DocumentRender } from "@/types/documents";

/**
 * A deadline's issued packets, as the Deadlines tab lists them under it —
 * `UX_SPEC.md` §3.21; Rules 8.19, 5.15. Each links to `/documents/[id]`; a
 * superseded one is kept and says so. The title is the packet's own, from
 * its stored input — never today's rule data.
 */

export interface PacketLink {
  readonly id: Uuid;
  readonly deadlineId: Uuid;
  readonly title: string;
  readonly typeLabel: string;
  readonly status: string;
  readonly statusLabel: string;
  readonly issuedText: string;
  readonly href: string;
}

/** What Make packet knows about an obligation's filing before it is opened. */
export interface FilingSummary {
  readonly title: string;
  readonly typeLabel: string;
}

export function packetLinksByDeadline(
  renders: readonly DocumentRender[],
  timeZone: TimeZone,
): ReadonlyMap<Uuid, readonly PacketLink[]> {
  const byDeadline = new Map<Uuid, PacketLink[]>();
  for (const render of [...renders].sort((a, b) =>
    b.renderedAt.localeCompare(a.renderedAt),
  )) {
    if (render.obligationDeadlineId === null) continue;
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
    const title = render.inputSnapshot.title;
    const link: PacketLink = {
      id: render.id,
      deadlineId: render.obligationDeadlineId,
      title:
        typeof title === "string"
          ? title
          : type.recognised
            ? type.label
            : type.storedValue,
      typeLabel: type.recognised ? type.label : type.storedValue,
      status: render.status,
      statusLabel: status.recognised ? status.label : status.storedValue,
      issuedText: basisInstant(render.renderedAt, timeZone),
      href: `/documents/${render.id}`,
    };
    byDeadline.set(render.obligationDeadlineId, [
      ...(byDeadline.get(render.obligationDeadlineId) ?? []),
      link,
    ]);
  }
  return byDeadline;
}
