import type { ReactElement, ReactNode } from "react";
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  type DocumentProps,
} from "@react-pdf/renderer";

import type { DocumentIdentity } from "@/domain/documents/document-identity";
import { DOCUMENT_FONT_FAMILY } from "@/lib/pdf/fonts";

import { CAPTIONS } from "./template-copy";

/**
 * The page every generated document is set on — `TECHNICAL_SPEC.md` §8.1,
 * §8.4; Rule 5.28.
 *
 * - **PDF metadata from the snapshot**: `creationDate`, `modificationDate`
 *   and `producer` are the render's own identity, never the clock — the
 *   same snapshot makes the same bytes.
 * - **The footer on every page** prints the render id and the verification
 *   code, so a paper copy can be checked against the system (§8.4).
 * - **A draft is watermarked on every page**, over the content, so no page of
 *   it can be mistaken for a document (Rule 5.28).
 *
 * Letter, black on white, the repository's own fonts.
 */

export const PDF_COLOR = {
  ink: "#000000",
  rule: "#000000",
  muted: "#3f3f3f",
  watermark: "#9a9a9a",
} as const;

export const pdfStyles = StyleSheet.create({
  page: {
    fontFamily: DOCUMENT_FONT_FAMILY,
    fontSize: 10,
    color: PDF_COLOR.ink,
    paddingTop: 40,
    paddingBottom: 64,
    paddingHorizontal: 44,
    // No page-level `lineHeight`: react-pdf then drops every absolutely
    // positioned fixed element — the footer that carries the render id and
    // the verification code with it. Line height is set where text needs it.
  },
  caption: {
    fontSize: 8,
    fontWeight: 700,
    color: PDF_COLOR.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  footer: {
    position: "absolute",
    left: 44,
    right: 44,
    bottom: 28,
    paddingTop: 6,
    borderTopWidth: 0.75,
    borderTopColor: PDF_COLOR.rule,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
  },
  footerColumn: {
    flexDirection: "column",
    gap: 2,
  },
  watermark: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  watermarkText: {
    fontSize: 110,
    fontWeight: 700,
    color: PDF_COLOR.watermark,
    opacity: 0.35,
    transform: "rotate(-35deg)",
  },
  draftNotice: {
    borderWidth: 1.5,
    borderColor: PDF_COLOR.rule,
    padding: 8,
    marginBottom: 16,
    fontWeight: 700,
  },
});

export function Caption({ children }: { readonly children: string }) {
  return <Text style={pdfStyles.caption}>{children}</Text>;
}

export function DocumentFrame({
  identity,
  verificationCode,
  title,
  children,
}: {
  readonly identity: DocumentIdentity;
  /** Cut from the snapshot's hash — printed, never part of the snapshot itself. */
  readonly verificationCode: string;
  readonly title: string;
  readonly children: ReactNode;
}): ReactElement<DocumentProps> {
  const renderedAt = new Date(identity.renderedAt);
  return (
    <Document
      title={title}
      creator={identity.producer}
      producer={identity.producer}
      creationDate={renderedAt}
      modificationDate={renderedAt}
      language="en-US"
    >
      <Page size="LETTER" style={pdfStyles.page} wrap>
        {identity.draftNotice === null ? null : (
          <Text style={pdfStyles.draftNotice}>{identity.draftNotice}</Text>
        )}
        {children}
        <View style={pdfStyles.footer} fixed>
          <View style={pdfStyles.footerColumn}>
            <Text>{identity.typeLabel}</Text>
            <Text>{`${CAPTIONS.documentId} ${identity.documentRenderId}`}</Text>
          </View>
          <View style={[pdfStyles.footerColumn, { alignItems: "flex-end" }]}>
            <Text>{`${CAPTIONS.verificationCode} ${verificationCode}`}</Text>
            <Text
              render={({ pageNumber, totalPages }) =>
                `${CAPTIONS.page} ${pageNumber} ${CAPTIONS.pageOf} ${totalPages}`
              }
            />
          </View>
        </View>
        {identity.watermark === null ? null : (
          <View style={pdfStyles.watermark} fixed>
            <Text style={pdfStyles.watermarkText}>{identity.watermark}</Text>
          </View>
        )}
      </Page>
    </Document>
  );
}
