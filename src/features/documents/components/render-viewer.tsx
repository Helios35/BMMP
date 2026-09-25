"use client";

import type { ReactElement, ReactNode } from "react";

import {
  DocumentViewer,
  type DocumentViewerMetadata,
} from "@/components/documents/document-viewer";

import { downloadDocument, recordDocumentPrint } from "../actions";

/**
 * `DocumentViewer`, bound to one `document_render` — the print is recorded
 * against it and the download streams its stored bytes. Used by
 * `/documents/[id]` and by the Label tab's embedded preview, so both print and
 * download the same way and both are audited the same way.
 */
export function RenderViewer({
  renderId,
  metadata,
  pageCount,
  embedded = false,
  children,
}: {
  readonly renderId: string;
  readonly metadata: DocumentViewerMetadata;
  readonly pageCount: number | null;
  readonly embedded?: boolean;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <DocumentViewer
      metadata={metadata}
      pageCount={pageCount}
      embedded={embedded}
      onPrint={() => recordDocumentPrint({ renderId })}
      onDownload={() => downloadDocument({ renderId })}
    >
      {children}
    </DocumentViewer>
  );
}
