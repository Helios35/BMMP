"use client";

import type { ReactElement, ReactNode } from "react";

import {
  DocumentViewer,
  type DocumentViewerMetadata,
  type DownloadedDocument,
} from "@/components/documents/document-viewer";
import {
  actionFailed,
  actionSucceeded,
  type ActionResult,
} from "@/lib/action-result";
import { APP_ERROR_CODES, type AppErrorCode } from "@/lib/errors";

import { recordDocumentPrint } from "../actions";
import { documentPdfPath } from "../verification";

/**
 * `DocumentViewer`, bound to one `document_render` — used by
 * `/documents/[id]`, the Label tab and the shipment's Paper tab, so all three
 * print and download the same way and are audited the same way.
 *
 * **A render with stored bytes is printed and downloaded from those bytes**
 * (`TECHNICAL_SPEC.md` §8.4): Print asks the stream route for a reprint —
 * which records `document.reprinted` and re-hashes the bytes before sending
 * them — and refuses to print if the `ETag` that comes back is not the
 * content hash the page was drawn from. Download streams the same bytes as a
 * file (`document.viewed`). Neither ever renders anything.
 *
 * A render with no stored file prints the page composed from its rows, after
 * the print is recorded, exactly as it did before document generation.
 */

function isAppErrorCode(value: unknown): value is AppErrorCode {
  return (
    typeof value === "string" &&
    (APP_ERROR_CODES as readonly string[]).includes(value)
  );
}

/** A problem+json response, as the viewer's inline error reads it. */
async function failedFrom<T>(response: Response): Promise<ActionResult<T>> {
  const body: unknown = response.headers.get("content-type")?.includes("json")
    ? await response.json()
    : null;
  const problem =
    typeof body === "object" && body !== null
      ? (body as {
          readonly code?: unknown;
          readonly detail?: unknown;
          readonly correlationId?: unknown;
        })
      : {};
  return actionFailed<T>({
    code: isAppErrorCode(problem.code) ? problem.code : "DATA_INTEGRITY",
    message:
      typeof problem.detail === "string"
        ? problem.detail
        : "The document could not be read. Nothing was printed or downloaded.",
    correlationId:
      typeof problem.correlationId === "string" ? problem.correlationId : "",
  });
}

function fileNameFrom(response: Response, fallback: string): string {
  const disposition = response.headers.get("content-disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(disposition);
  return match?.[1] ?? fallback;
}

async function reprintStored(
  renderId: string,
  contentHash: string,
): Promise<ActionResult<null>> {
  const response = await fetch(documentPdfPath(renderId, "reprint"), {
    credentials: "same-origin",
  });
  if (!response.ok) return failedFrom(response);
  await response.arrayBuffer();
  if (response.headers.get("etag") !== `"${contentHash}"`) {
    return actionFailed({
      code: "DOCUMENT_INTEGRITY",
      message:
        "The stored document no longer matches the one shown here, so nothing was printed. Reload the page.",
      correlationId: "",
    });
  }
  return actionSucceeded(null);
}

async function downloadStored(
  renderId: string,
): Promise<ActionResult<DownloadedDocument>> {
  const response = await fetch(documentPdfPath(renderId, "download"), {
    credentials: "same-origin",
  });
  if (!response.ok) return failedFrom(response);
  return actionSucceeded({
    fileName: fileNameFrom(response, `${renderId}.pdf`),
    bytes: await response.blob(),
  });
}

export function RenderViewer({
  renderId,
  metadata,
  pageCount,
  storedContentHash,
  marking,
  stamp,
  embedded = false,
  children,
}: {
  readonly renderId: string;
  readonly metadata: DocumentViewerMetadata;
  readonly pageCount: number | null;
  /** The stored bytes' hash when the render has a file; null when it has none. */
  readonly storedContentHash: string | null;
  /** Printed above the stored pages. */
  readonly marking?: ReactNode;
  /** Laid over every stored page. */
  readonly stamp?: ReactNode;
  readonly embedded?: boolean;
  /** The composed page, for a render with no stored file. */
  readonly children?: ReactNode;
}): ReactElement {
  const stored = storedContentHash !== null;
  return (
    <DocumentViewer
      metadata={metadata}
      pageCount={pageCount}
      embedded={embedded}
      file={
        stored
          ? {
              src: documentPdfPath(renderId),
              ...(stamp === undefined ? {} : { stamp }),
            }
          : null
      }
      marking={marking}
      onPrint={() =>
        storedContentHash !== null
          ? reprintStored(renderId, storedContentHash)
          : recordDocumentPrint({ renderId })
      }
      onDownload={() => downloadStored(renderId)}
    >
      {children}
    </DocumentViewer>
  );
}
