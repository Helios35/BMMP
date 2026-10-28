import type { ReactElement } from "react";
import {
  StyleSheet,
  Text,
  View,
  type DocumentProps,
} from "@react-pdf/renderer";

import type { DdrPacketPayload } from "@/domain/documents/build-ddr-packet-payload";
import { NO_PACKAGING_RULE_STATEMENT } from "@/domain/transport/ddr-packet";

import { Caption, DocumentFrame, PDF_COLOR } from "./document-frame";
import { CAPTIONS } from "./template-copy";

/**
 * The damaged/defective packet — Rules 6.15–6.17; T-38 `ddr_packet`;
 * `SPEC_ddr-packaging-rule-data_2026-10-22.md`.
 *
 * **It prints the payload and decides nothing.** Every packaging item, the
 * marking text, its minimum height and every citation are the rule version's,
 * verbatim, each printed beside its citation (Rule 12.15). **No requirement,
 * size or citation is written in this file.** A record whose chemistry has no
 * rule on file says so in the spec's words, in place of a marking — never a
 * guessed one (D-71).
 */

export const DDR_PACKET_TEMPLATE = {
  templateKey: "ddr_packet",
  templateVersion: "1",
} as const;

const styles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: 700, marginBottom: 4 },
  shipment: { fontSize: 11, fontWeight: 700, marginBottom: 16 },
  section: { marginBottom: 16 },
  record: {
    borderWidth: 0.75,
    borderColor: PDF_COLOR.rule,
    padding: 8,
    marginBottom: 8,
  },
  recordNumber: { fontSize: 11, fontWeight: 700, marginBottom: 4 },
  row: { flexDirection: "row", gap: 8, marginBottom: 2 },
  term: { width: 130, fontSize: 9, color: PDF_COLOR.muted },
  value: { flex: 1, fontSize: 9, lineHeight: 1.3 },
  marking: { flex: 1, fontSize: 10, fontWeight: 700 },
  gap: {
    flex: 1,
    fontSize: 10,
    fontWeight: 700,
    borderWidth: 1.5,
    borderColor: PDF_COLOR.rule,
    padding: 4,
  },
  citation: { fontSize: 8, color: PDF_COLOR.muted },
  item: { marginBottom: 6 },
  itemName: { fontSize: 9, fontWeight: 700 },
});

function Row({
  term,
  children,
}: {
  readonly term: string;
  readonly children: ReactElement | string;
}): ReactElement {
  return (
    <View style={styles.row}>
      <Text style={styles.term}>{term}</Text>
      {typeof children === "string" ? (
        <Text style={styles.value}>{children}</Text>
      ) : (
        children
      )}
    </View>
  );
}

export function DdrPacketTemplate({
  payload,
  verificationCode,
}: {
  readonly payload: DdrPacketPayload;
  readonly verificationCode: string;
}): ReactElement<DocumentProps> {
  return DocumentFrame({
    identity: payload.document,
    verificationCode,
    title: `${payload.document.typeLabel} ${payload.shipmentNumber}`,
    children: (
      <>
        <Text style={styles.title}>{payload.document.typeLabel}</Text>
        <Text style={styles.shipment}>
          {`${CAPTIONS.ddrShipment} ${payload.shipmentNumber}`}
        </Text>

        <View style={styles.section}>
          <Caption>{CAPTIONS.ddrRecords}</Caption>
          {payload.records.map((record) => (
            <View key={record.recordId} style={styles.record} wrap={false}>
              <Text style={styles.recordNumber}>{record.recordNumber}</Text>
              <Row term={CAPTIONS.ddrChemistry}>{record.chemistryLabel}</Row>
              <Row term={CAPTIONS.ddrFlags}>
                {record.flagLabels.length === 0
                  ? CAPTIONS.ddrNone
                  : record.flagLabels.join(", ")}
              </Row>
              <Row term={CAPTIONS.ddrFindings}>
                {record.findingLabels.length === 0
                  ? CAPTIONS.ddrNone
                  : record.findingLabels.join(", ")}
              </Row>
              <Row term={CAPTIONS.ddrAssessedBy}>
                {`${record.assessedBy} — ${record.assessedAtText}`}
              </Row>
              <Row term={CAPTIONS.ddrContainer}>
                {`${record.containerCode} — ${record.containerTypeLabel}`}
              </Row>
              <Row term={CAPTIONS.ddrMarking}>
                {record.marking === null ? (
                  <Text style={styles.gap}>{NO_PACKAGING_RULE_STATEMENT}</Text>
                ) : (
                  <View style={{ flex: 1 }}>
                    <Text style={styles.marking}>{record.marking.text}</Text>
                    <Text style={styles.citation}>
                      {record.marking.citation}
                    </Text>
                  </View>
                )}
              </Row>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Caption>{CAPTIONS.ddrPackaging}</Caption>
          {payload.packaging.map((item) => (
            <View key={item.item} style={styles.item} wrap={false}>
              <Text style={styles.itemName}>{item.item}</Text>
              <Text style={styles.value}>{item.requirement}</Text>
              <Text style={styles.citation}>{item.citation}</Text>
            </View>
          ))}
          <View style={styles.item} wrap={false}>
            <Text style={styles.itemName}>{CAPTIONS.ddrPackingLevel}</Text>
            <Text style={styles.value}>{payload.packingLevelText}</Text>
          </View>
          <View style={styles.item} wrap={false}>
            <Text style={styles.itemName}>{CAPTIONS.ddrMarkingHeight}</Text>
            <Text style={styles.value}>{payload.markingMinimumHeight}</Text>
            <Text style={styles.citation}>
              {payload.markingMinimumHeightCitation}
            </Text>
          </View>
          <View style={styles.item} wrap={false}>
            <Text style={styles.itemName}>{CAPTIONS.ddrAir}</Text>
            <Text style={styles.value}>{payload.air.requirement}</Text>
            <Text style={styles.citation}>{payload.air.citation}</Text>
          </View>
        </View>
      </>
    ),
  });
}
