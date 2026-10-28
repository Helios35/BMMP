import { ruleOutcome, type RuleOutcome } from "@/domain/rules/outcome";
import type { DdrPacketContent } from "@/domain/transport/ddr-packet";

import type { DocumentPayloadBuild } from "./build-shipping-paper-payload";
import type { DocumentIdentity } from "./document-identity";

/**
 * The damaged/defective packet's render payload — `TECHNICAL_SPEC.md` §8.1;
 * Rules 6.15, 6.16; T-38 `ddr_packet`.
 *
 * The content is `buildDdrPacketContent`'s, decided from the rows and the
 * rule version; this stamps the render's identity into it and **refuses, by
 * name, anything an issued packet must carry** before any renderer runs. A
 * record with no rule on file is not a refusal — the packet says so in words
 * and departure holds on it (D-71) — but a packet listing no record, or a
 * packaging item with no citation, is.
 */

export type DdrPacketPayload = DdrPacketContent & {
  readonly document: DocumentIdentity;
};

export function buildDdrPacketPayload(input: {
  readonly content: RuleOutcome<DdrPacketContent>;
  readonly document: DocumentIdentity;
}): DocumentPayloadBuild<DdrPacketPayload> {
  const { content, document } = input;
  const packet = content.result;
  const missing: string[] = [];
  if (packet.records.length === 0) missing.push("records");
  if (
    packet.packaging.some(
      (item) => item.requirement.trim() === "" || item.citation.trim() === "",
    )
  ) {
    missing.push("packaging_citation");
  }
  if (packet.air.citation.trim() === "") missing.push("air_citation");
  if (packet.markingMinimumHeightCitation.trim() === "") {
    missing.push("marking_citation");
  }
  if (document.status !== "issued" || document.documentType !== "ddr_packet") {
    missing.push("document.issued_ddr_packet");
  }
  if (missing.length > 0) return { ok: false, missing };
  return {
    ok: true,
    outcome: ruleOutcome({
      result: { ...packet, document },
      reasoning: content.reasoning,
      ruleVersionsApplied: content.ruleVersionsApplied,
      inputsSnapshot: content.inputsSnapshot,
      context: "ddr_packet.render_payload",
    }),
  };
}
