import type { IsoTimestamp, TimeZone } from "@/types/common";
import { civilDateInZone } from "@/domain/storage/clock-display";
import type { DocumentRenderStatus } from "@/domain/taxonomy/document-render-status";
import {
  DOCUMENT_TYPE_LABELS,
  type DocumentType,
} from "@/domain/taxonomy/document-type";

/**
 * What a render knows about itself, carried **inside** its input snapshot —
 * `TECHNICAL_SPEC.md` §8.1, §8.4; `ERD.md` §7.5.
 *
 * The footer prints the render id, the PDF's `creationDate` is its render
 * instant and its `producer` names the renderer — so all three are inputs the
 * render consumed, and an input the render consumed is in the snapshot
 * ("everything the render consumed"). That is also what makes two renders of
 * the same paper carry two different verification codes: each code answers
 * for exactly one render.
 *
 * **Every printed instant is formatted here, from the snapshot**, in the
 * site's zone (Rule 4.29) — the template prints the string and reads no clock.
 */

/** The two document types this unit renders. */
export type RenderedDocumentType = Extract<
  DocumentType,
  "shipping_paper" | "container_label"
>;

/** A render is issued, or it is a draft (Rule 5.28). Supersession and voiding come later, by mark. */
export type RenderedDocumentStatus = Extract<
  DocumentRenderStatus,
  "issued" | "draft"
>;

/** Across every page of a draft, so no page of it can be mistaken for a document (Rule 5.28). */
export const DRAFT_WATERMARK = "NOT VALID";

export type DocumentIdentity = {
  readonly documentRenderId: string;
  readonly documentType: RenderedDocumentType;
  /** T-38's label — the document's printed title. */
  readonly typeLabel: string;
  readonly status: RenderedDocumentStatus;
  readonly templateKey: string;
  readonly templateVersion: string;
  /** The PDF's `creationDate`. */
  readonly renderedAt: IsoTimestamp;
  /** The zone every printed instant is read in. */
  readonly timeZone: TimeZone;
  /** `renderedAt`, as printed. */
  readonly renderedAtText: string;
  /** The PDF's `producer` metadata. */
  readonly producer: string;
  /** Draft only. */
  readonly watermark: string | null;
  /** Draft only — the sentence that says what a draft is not. */
  readonly draftNotice: string | null;
};

/** `2026-10-09 10:00 (America/Los_Angeles)` — 24-hour, unambiguous, the same on every machine. */
export function printedInstant(
  instant: IsoTimestamp,
  timeZone: TimeZone,
): string {
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(instant));
  return `${civilDateInZone(instant, timeZone)} ${time} (${timeZone})`;
}

export function documentIdentity(input: {
  readonly documentRenderId: string;
  readonly documentType: RenderedDocumentType;
  readonly status: RenderedDocumentStatus;
  readonly templateKey: string;
  readonly templateVersion: string;
  readonly renderedAt: IsoTimestamp;
  readonly timeZone: TimeZone;
  readonly producer: string;
  /** Required for a draft; ignored for an issued render. */
  readonly draftNotice: string;
}): DocumentIdentity {
  const isDraft = input.status === "draft";
  return {
    documentRenderId: input.documentRenderId,
    documentType: input.documentType,
    typeLabel: DOCUMENT_TYPE_LABELS[input.documentType],
    status: input.status,
    templateKey: input.templateKey,
    templateVersion: input.templateVersion,
    renderedAt: input.renderedAt,
    timeZone: input.timeZone,
    renderedAtText: printedInstant(input.renderedAt, input.timeZone),
    producer: input.producer,
    watermark: isDraft ? DRAFT_WATERMARK : null,
    draftNotice: isDraft ? input.draftNotice : null,
  };
}
