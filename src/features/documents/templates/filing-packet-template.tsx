import type { ReactElement } from "react";
import {
  StyleSheet,
  Text,
  View,
  type DocumentProps,
} from "@react-pdf/renderer";

import {
  gapLineText,
  totalLineText,
  type FilingLine,
  type FilingPacketPayload,
} from "@/domain/documents/build-filing-packet-payload";

import { Caption, DocumentFrame, PDF_COLOR } from "./document-frame";
import { CAPTIONS } from "./template-copy";

/**
 * The filing packet and the annual report — one template for both; Rules
 * 8.19–8.21; T-38's two filing types; `TECHNICAL_SPEC.md` §8.5.
 *
 * **It prints the payload and decides nothing.** The title, where it is sent,
 * the period, each item's label, every citation and every statement are the
 * rule data's, verbatim (Rule 1.23). **A gap is printed where it falls** —
 * "Not on file" with who can fix it, "Not held here" by name, and a total with
 * a gap says how many entries are missing (Rule 8.20). It says, before
 * anything else, that **a packet is not the filing**, and where to send it
 * (Rule 8.19). Every date on the page comes from the snapshot.
 */

export const FILING_PACKET_TEMPLATE = {
  templateKey: "producer_filing",
  templateVersion: "1",
} as const;

const styles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: 700, marginBottom: 4 },
  subtitle: { fontSize: 10, marginBottom: 12, lineHeight: 1.3 },
  notice: {
    borderWidth: 1.5,
    borderColor: PDF_COLOR.rule,
    padding: 8,
    marginBottom: 14,
  },
  noticeLead: { fontSize: 11, fontWeight: 700, marginBottom: 4 },
  noticeText: { fontSize: 9, lineHeight: 1.35 },
  section: { marginBottom: 12 },
  row: { flexDirection: "row", gap: 8, marginBottom: 2 },
  term: { width: 110, fontSize: 9, color: PDF_COLOR.muted },
  value: { flex: 1, fontSize: 9, lineHeight: 1.3 },
  item: {
    borderTopWidth: 0.75,
    borderTopColor: PDF_COLOR.rule,
    paddingTop: 6,
    marginBottom: 8,
  },
  itemLabel: { fontSize: 10, fontWeight: 700, marginBottom: 1 },
  citation: { fontSize: 8, color: PDF_COLOR.muted, marginBottom: 3 },
  line: { fontSize: 9, lineHeight: 1.3, marginBottom: 1 },
  gap: {
    fontSize: 9,
    fontWeight: 700,
    borderWidth: 1,
    borderColor: PDF_COLOR.rule,
    padding: 3,
    marginBottom: 2,
  },
  total: { fontSize: 9, fontWeight: 700, marginTop: 1, marginBottom: 2 },
});

function Row({
  term,
  children,
}: {
  readonly term: string;
  readonly children: string;
}): ReactElement {
  return (
    <View style={styles.row}>
      <Text style={styles.term}>{term}</Text>
      <Text style={styles.value}>{children}</Text>
    </View>
  );
}

function Line({ line }: { readonly line: FilingLine }): ReactElement {
  switch (line.kind) {
    case "value":
      return <Text style={styles.line}>{line.text}</Text>;
    case "gap":
      return <Text style={styles.gap}>{gapLineText(line)}</Text>;
    case "not_held":
      return <Text style={styles.gap}>{line.text}</Text>;
    case "total":
      return <Text style={styles.total}>{totalLineText(line)}</Text>;
  }
}

export function FilingPacketTemplate({
  payload,
  verificationCode,
}: {
  readonly payload: FilingPacketPayload;
  readonly verificationCode: string;
}): ReactElement<DocumentProps> {
  return DocumentFrame({
    identity: payload.document,
    verificationCode,
    title: `${payload.title} — ${payload.state.name}`,
    children: (
      <>
        <Text style={styles.title}>{payload.title}</Text>
        <Text style={styles.subtitle}>
          {`${payload.state.name} · ${payload.obligation.duty}`}
        </Text>

        <View style={styles.notice} wrap={false}>
          <Text style={styles.noticeLead}>{payload.notTheFiling}</Text>
          <Text style={styles.noticeText}>{payload.sendToWords}</Text>
        </View>

        <View style={styles.section}>
          <Row term={CAPTIONS.filingDeadline}>
            {`${payload.deadline.dueOnText} — ${payload.obligation.citation}`}
          </Row>
          <Row term={CAPTIONS.filingPeriod}>{payload.period.words}</Row>
          <Row term={CAPTIONS.filingCitation}>
            {payload.citationUrl === null
              ? payload.citation
              : `${payload.citation} (${payload.citationUrl})`}
          </Row>
          <Row term={CAPTIONS.filingLaw}>
            {`${payload.law} — version ${payload.filingsVersionLabel}`}
          </Row>
          <Row term={CAPTIONS.filingGaps}>{payload.gaps.words}</Row>
          <Row term={CAPTIONS.issuedAt}>{payload.document.renderedAtText}</Row>
        </View>

        <View style={styles.section}>
          <Caption>{CAPTIONS.filingItems}</Caption>
          {payload.items.map((item, index) => (
            <View key={`${item.source}-${String(index)}`} style={styles.item}>
              <Text style={styles.itemLabel}>{item.label}</Text>
              <Text style={styles.citation}>
                {`${item.sourceLabel} · ${item.citation}`}
              </Text>
              {item.lines.map((line, lineIndex) => (
                <Line key={String(lineIndex)} line={line} />
              ))}
            </View>
          ))}
        </View>
      </>
    ),
  });
}
