import type { ReactElement } from "react";
import {
  Path,
  StyleSheet,
  Svg,
  Text,
  View,
  type DocumentProps,
} from "@react-pdf/renderer";

import type { ContainerLabelPayload } from "@/domain/documents/build-container-label-payload";
import { qrSymbol } from "@/lib/pdf/qr";

import { Caption, DocumentFrame, PDF_COLOR } from "./document-frame";
import { CAPTIONS } from "./template-copy";

/**
 * The container label — `TECHNICAL_SPEC.md` §8.3; Rules 4.18–4.22, 5.21.
 *
 * **It prints the payload and decides nothing.** The phrase is the rule
 * version's, verbatim, in its own casing; the contents are the confirmed
 * chemistries; the start date is the container's own, as a calendar day in
 * the site's zone; the QR encodes the payload's permanent URL to
 * `/containers/[id]`. **No phrase, artwork or citation is written in this
 * file**, and no mark is drawn: artwork is a versioned rule (Rule 5.21) and
 * none is on file.
 *
 * Letter, so any office printer prints it; the phrase and the date are set
 * large enough to read across a storage bay.
 */

export const CONTAINER_LABEL_TEMPLATE = {
  templateKey: "container_label",
  templateVersion: "1",
} as const;

const QR_SIZE = 150;

const styles = StyleSheet.create({
  phrase: {
    fontSize: 40,
    fontWeight: 700,
    lineHeight: 1.15,
    borderWidth: 3,
    borderColor: PDF_COLOR.rule,
    padding: 16,
    marginBottom: 24,
    textAlign: "center",
  },
  startBlock: { marginBottom: 20 },
  startDate: { fontSize: 34, fontWeight: 700 },
  zone: { fontSize: 9, color: PDF_COLOR.muted },
  contents: { fontSize: 16, fontWeight: 700, marginBottom: 20 },
  facts: { flexDirection: "row", gap: 32, marginBottom: 24 },
  fact: { fontSize: 13, fontWeight: 700 },
  qrRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  qrCaption: { flexShrink: 1, fontSize: 9 },
  url: { fontSize: 8, color: PDF_COLOR.muted, marginTop: 4 },
});

export function ContainerLabelTemplate({
  payload,
  verificationCode,
}: {
  readonly payload: ContainerLabelPayload;
  readonly verificationCode: string;
}): ReactElement<DocumentProps> {
  const qr = qrSymbol(payload.qrPayloadUrl);
  // Called as a function, so the element handed to the renderer is the
  // `<Document>` itself.
  return DocumentFrame({
    identity: payload.document,
    verificationCode,
    title: `${payload.document.typeLabel} ${payload.containerCode}`,
    children: (
      <>
        <Text style={styles.phrase}>{payload.labelText}</Text>

        <View style={styles.startBlock}>
          <Caption>{CAPTIONS.accumulationStart}</Caption>
          <Text style={styles.startDate}>{payload.accumulationStartDate}</Text>
          <Text style={styles.zone}>
            {`${CAPTIONS.siteTime}, ${payload.timeZone}`}
          </Text>
        </View>

        <Caption>{CAPTIONS.contents}</Caption>
        <Text style={styles.contents}>{payload.contentsDescription}</Text>

        <View style={styles.facts}>
          <View>
            <Caption>{CAPTIONS.container}</Caption>
            <Text style={styles.fact}>{payload.containerCode}</Text>
          </View>
          {payload.handlerIdentifier === null ? null : (
            <View>
              <Caption>{CAPTIONS.handler}</Caption>
              <Text style={styles.fact}>{payload.handlerIdentifier}</Text>
            </View>
          )}
        </View>

        <View style={styles.qrRow} wrap={false}>
          <Svg
            width={QR_SIZE}
            height={QR_SIZE}
            viewBox={`0 0 ${qr.extent} ${qr.extent}`}
          >
            <Path d={qr.path} fill={PDF_COLOR.ink} />
          </Svg>
          <View style={styles.qrCaption}>
            <Text>{CAPTIONS.scanToOpen}</Text>
            <Text style={styles.url}>{payload.qrPayloadUrl}</Text>
          </View>
        </View>
      </>
    ),
  });
}
