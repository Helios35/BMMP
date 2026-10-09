import type { ReactElement } from "react";
import {
  StyleSheet,
  Text,
  View,
  type DocumentProps,
} from "@react-pdf/renderer";

import type {
  ShippingPaperDocumentPayload,
  ShippingPaperDraftDocumentPayload,
} from "@/domain/documents/build-shipping-paper-payload";
import type { ShippingPaperAddress } from "@/domain/transport/shipping-paper";

import { Caption, DocumentFrame, PDF_COLOR } from "./document-frame";
import { CAPTIONS } from "./template-copy";

/**
 * The shipping paper — `TECHNICAL_SPEC.md` §8.1, §8.3; Rules 5.5–5.9, 5.28.
 *
 * **It prints the payload and decides nothing.** Every line, every number and
 * every statement is a payload field — the basic description in the rule
 * version's sequence, the verified 24-hour number, the certification the rule
 * version carries, verbatim. **No regulatory string is written in this file.**
 * The issued payload has no gap in it: the builder refused one before this
 * ran. A draft's gaps print as its stated gap sentence, never as a value that
 * looks like one (Rule 5.7), and a draft carries its watermark on every page.
 *
 * A change to this layout changes the bytes a payload produces, so it bumps
 * {@link SHIPPING_PAPER_TEMPLATE}'s version — and a reprint of an issued paper
 * still streams the bytes it was issued with (§8.4).
 */

export const SHIPPING_PAPER_TEMPLATE = {
  templateKey: "shipping_paper",
  templateVersion: "1",
} as const;

export type ShippingPaperRenderPayload =
  ShippingPaperDocumentPayload | ShippingPaperDraftDocumentPayload;

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 1.5,
    borderBottomColor: PDF_COLOR.rule,
    paddingBottom: 8,
    marginBottom: 14,
  },
  title: { fontSize: 18, fontWeight: 700 },
  shipmentNumber: { fontSize: 12, fontWeight: 700, marginTop: 2 },
  headerMeta: { alignItems: "flex-end", fontSize: 9 },
  parties: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 14,
  },
  party: { width: "50%", paddingRight: 12, marginBottom: 10 },
  strong: { fontWeight: 700 },
  gap: { fontWeight: 700 },
  section: { marginBottom: 14 },
  line: {
    borderTopWidth: 0.75,
    borderTopColor: PDF_COLOR.rule,
    paddingVertical: 6,
  },
  basicDescription: { fontSize: 12, fontWeight: 700, marginBottom: 2 },
  lineFacts: { flexDirection: "row", gap: 16 },
  lineFact: { flexDirection: "column" },
  records: { fontSize: 8, color: PDF_COLOR.muted, marginTop: 3 },
  emergency: {
    flexDirection: "row",
    borderWidth: 1.5,
    borderColor: PDF_COLOR.rule,
    padding: 8,
    marginBottom: 14,
  },
  emergencyColumn: { width: "50%", paddingRight: 8 },
  emergencyPhone: { fontSize: 14, fontWeight: 700 },
  certification: { marginBottom: 18 },
  // Room above each rule for a hand to sign on it.
  signatures: { flexDirection: "row", gap: 24, marginTop: 28 },
  signatureLine: {
    flexGrow: 1,
    borderTopWidth: 0.75,
    borderTopColor: PDF_COLOR.rule,
    paddingTop: 2,
    fontSize: 8,
  },
});

function addressLines(address: ShippingPaperAddress): string[] {
  return [
    address.line1,
    ...(address.line2 === null || address.line2 === "" ? [] : [address.line2]),
    `${address.city}, ${address.region} ${address.postalCode}`,
    address.country,
  ];
}

function Value({
  value,
  gap,
  strong = false,
}: {
  readonly value: string | null;
  /** Null on an issued paper, whose builder admits no gap. */
  readonly gap: string | null;
  readonly strong?: boolean;
}): ReactElement | null {
  if (value !== null && value.trim() !== "") {
    return <Text style={strong ? styles.strong : {}}>{value}</Text>;
  }
  return gap === null ? null : <Text style={styles.gap}>{gap}</Text>;
}

function AddressBlock({
  address,
  gap,
}: {
  readonly address: ShippingPaperAddress | null;
  readonly gap: string | null;
}): ReactElement | null {
  if (address === null) {
    return gap === null ? null : <Text style={styles.gap}>{gap}</Text>;
  }
  return (
    <>
      {addressLines(address).map((line, index) => (
        <Text key={`${index}-${line}`}>{line}</Text>
      ))}
    </>
  );
}

export function ShippingPaperTemplate({
  payload,
  verificationCode,
}: {
  readonly payload: ShippingPaperRenderPayload;
  readonly verificationCode: string;
}): ReactElement<DocumentProps> {
  const { document } = payload;
  const gap = "gap" in payload ? payload.gap : null;
  const recordsWithoutLine =
    "recordsWithoutLine" in payload ? payload.recordsWithoutLine : [];
  // Called as a function, so the element handed to the renderer is the
  // `<Document>` itself.
  return DocumentFrame({
    identity: document,
    verificationCode,
    title: `${document.typeLabel} ${payload.shipmentNumber}`,
    children: (
      <>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>{document.typeLabel}</Text>
            <Text style={styles.shipmentNumber}>{payload.shipmentNumber}</Text>
          </View>
          <View style={styles.headerMeta}>
            <Caption>
              {document.status === "draft"
                ? CAPTIONS.draftPreparedAt
                : CAPTIONS.issuedAt}
            </Caption>
            <Text>{document.renderedAtText}</Text>
          </View>
        </View>

        <View style={styles.parties}>
          <View style={styles.party}>
            <Caption>{CAPTIONS.shipper}</Caption>
            <Text style={styles.strong}>{payload.shipper.name}</Text>
            <AddressBlock address={payload.origin} gap={gap} />
          </View>
          <View style={styles.party}>
            <Caption>{CAPTIONS.consignee}</Caption>
            <Value value={payload.destination.facilityName} gap={gap} strong />
            <AddressBlock address={payload.destination.address} gap={gap} />
            {payload.destination.identifier === null ? null : (
              <Text>{payload.destination.identifier}</Text>
            )}
          </View>
          <View style={styles.party}>
            <Caption>{CAPTIONS.carrier}</Caption>
            <Value value={payload.carrier.name} gap={gap} strong />
            {payload.carrier.identifier === null ? null : (
              <Text>{payload.carrier.identifier}</Text>
            )}
          </View>
          <View style={styles.party}>
            <Caption>{CAPTIONS.transportMode}</Caption>
            <Text>{payload.transportModeLabel}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Caption>{CAPTIONS.basicDescription}</Caption>
          {payload.lines.map((line) => (
            <View
              key={`${line.unIdentifier}|${line.properShippingName}|${line.hazardClass}|${line.packingGroup}`}
              style={styles.line}
              wrap={false}
            >
              <View style={styles.basicDescription}>
                <Value value={line.basicDescription} gap={gap} />
              </View>
              <View style={styles.lineFacts}>
                <View style={styles.lineFact}>
                  <Caption>{CAPTIONS.packages}</Caption>
                  <Text>{line.numberAndTypeOfPackages}</Text>
                </View>
                <View style={styles.lineFact}>
                  <Caption>{CAPTIONS.totalQuantity}</Caption>
                  <Value value={line.totalQuantityDescription} gap={gap} />
                </View>
              </View>
              <Text style={styles.records}>
                {`${CAPTIONS.records}: ${line.records.map((record) => record.recordNumber).join(", ")}`}
              </Text>
            </View>
          ))}
          {recordsWithoutLine.map((recordNumber) => (
            <View key={recordNumber} style={styles.line} wrap={false}>
              <Text style={styles.strong}>{recordNumber}</Text>
              {gap === null ? null : <Text style={styles.gap}>{gap}</Text>}
            </View>
          ))}
        </View>

        <View style={styles.emergency} wrap={false}>
          <View style={styles.emergencyColumn}>
            <Caption>{CAPTIONS.emergencyPhone}</Caption>
            <View style={styles.emergencyPhone}>
              <Value value={payload.emergencyResponse.phone} gap={gap} />
            </View>
          </View>
          <View style={styles.emergencyColumn}>
            <Caption>{CAPTIONS.emergencyInformation}</Caption>
            <Value value={payload.emergencyResponse.contractRef} gap={gap} />
          </View>
        </View>

        <View style={styles.certification} wrap={false}>
          <Caption>{CAPTIONS.certification}</Caption>
          <Value value={payload.shipperCertification} gap={gap} />
          <View style={styles.signatures}>
            <Text style={styles.signatureLine}>{CAPTIONS.signature}</Text>
            <Text style={styles.signatureLine}>{CAPTIONS.signedOn}</Text>
          </View>
        </View>
      </>
    ),
  });
}
