import { describe, expect, it } from "vitest";

import {
  buildContainerLabelContent,
  buildContainerLabelPayload,
  type ContainerLabelContentInput,
} from "@/domain/documents/build-container-label-payload";
import { documentIdentity } from "@/domain/documents/document-identity";
import { describeContainerContents } from "@/domain/storage/contents-description";
import { CHEMISTRY_LABELS } from "@/domain/taxonomy/chemistry";

import { resolvedRule } from "../transport/rule-fixtures";

/**
 * The container label — Rules 4.18–4.22, 5.21; the owner's calls in b1a-06:
 * the wording is a rule version's payload, and the contents description is
 * the confirmed chemistries by their taxonomy labels. **Every input comes
 * from data, and a missing one blocks the label by name.**
 */

const PHRASE = "TEST LABEL PHRASE — test data, not regulatory text";

const LABEL_RULE = resolvedRule({
  ruleKey: "storage.container_label",
  payloadSchemaKey: "storage.container_label.v1",
  payload: { phrase: PHRASE },
  domain: "labeling_marking",
});

function input(
  overrides: Partial<ContainerLabelContentInput> = {},
): ContainerLabelContentInput {
  return {
    container: {
      id: "container-1",
      containerCode: "C-0009",
      status: "open",
      // 03:00 UTC is still the previous day at a Pacific site.
      accumulationStartedAt: "2026-07-28T03:00:00.000Z",
      siteTimeZone: "America/Los_Angeles",
    },
    contents: [
      {
        recordId: "r-2",
        recordNumber: "BR-0102",
        chemistry: "lead_acid_sealed",
        chemistryConfirmed: true,
      },
      {
        recordId: "r-1",
        recordNumber: "BR-0101",
        chemistry: "li_nmc",
        chemistryConfirmed: true,
      },
      {
        recordId: "r-3",
        recordNumber: "BR-0103",
        chemistry: "li_nmc",
        chemistryConfirmed: true,
      },
    ],
    labelRule: LABEL_RULE,
    handlerIdentifier: " WA-HANDLER-0001 ",
    appOrigin: "https://bmmp.test",
    ...overrides,
  };
}

describe("what a label says", () => {
  it("prints the rule version's phrase verbatim, the confirmed chemistries and the start as a day in the site's zone", () => {
    const build = buildContainerLabelContent(input());
    expect(build.ok).toBe(true);
    if (!build.ok) return;
    expect(build.outcome.result).toEqual({
      containerId: "container-1",
      containerCode: "C-0009",
      labelText: PHRASE,
      contentsDescription: `${CHEMISTRY_LABELS.li_nmc}; ${CHEMISTRY_LABELS.lead_acid_sealed}`,
      accumulationStartedAt: "2026-07-28T03:00:00.000Z",
      accumulationStartDate: "2026-07-27",
      timeZone: "America/Los_Angeles",
      handlerIdentifier: "WA-HANDLER-0001",
      qrPayloadUrl: "https://bmmp.test/containers/container-1",
      recordIds: ["r-1", "r-2", "r-3"],
    });
    expect(build.outcome.ruleVersionsApplied).toHaveLength(1);
    expect(build.outcome.ruleVersionsApplied[0]).toMatchObject({
      ruleKey: "storage.container_label",
      citation: LABEL_RULE.version.citation,
    });
  });

  it("blocks with no rule on file, and with a rule it cannot read — never a default phrase", () => {
    const none = buildContainerLabelContent(input({ labelRule: null }));
    expect(none.ok).toBe(false);
    if (!none.ok) {
      expect(none.findings.join(" ")).toContain("storage.container_label");
    }
    const unreadable = buildContainerLabelContent(
      input({
        labelRule: resolvedRule({
          ruleKey: "storage.container_label",
          payloadSchemaKey: "storage.container_label.v2",
          payload: { phrase: PHRASE },
        }),
      }),
    );
    expect(unreadable.ok).toBe(false);
  });

  it("blocks a battery whose chemistry no person has confirmed — chemistry is never inferred", () => {
    const build = buildContainerLabelContent(
      input({
        contents: [
          {
            recordId: "r-1",
            recordNumber: "BR-0101",
            chemistry: "li_nmc",
            chemistryConfirmed: false,
          },
        ],
      }),
    );
    expect(build.ok).toBe(false);
    if (!build.ok) expect(build.findings[0]).toContain("BR-0101");
  });

  it("blocks an empty container, a shipped one, and a missing app address", () => {
    expect(buildContainerLabelContent(input({ contents: [] })).ok).toBe(false);
    expect(
      buildContainerLabelContent(
        input({
          container: { ...input().container, status: "shipped" },
        }),
      ).ok,
    ).toBe(false);
    const noOrigin = buildContainerLabelContent(input({ appOrigin: "" }));
    expect(noOrigin.ok).toBe(false);
    if (!noOrigin.ok) {
      expect(noOrigin.findings.join(" ")).toContain("not configured");
    }
  });
});

describe("the label's render payload", () => {
  function identity(status: "issued" | "draft") {
    return documentIdentity({
      documentRenderId: "render-9",
      documentType: "container_label",
      status,
      templateKey: "container_label",
      templateVersion: "1",
      renderedAt: "2026-10-09T17:00:00.000Z",
      timeZone: "America/Los_Angeles",
      producer: "test producer",
      draftNotice: "",
    });
  }

  it("adds the render's identity to what the label says", () => {
    const content = buildContainerLabelContent(input());
    if (!content.ok) throw new Error("expected a label");
    const build = buildContainerLabelPayload({
      content: content.outcome,
      document: identity("issued"),
    });
    expect(build.ok).toBe(true);
    if (build.ok) {
      expect(build.outcome.result.document.documentRenderId).toBe("render-9");
      expect(build.outcome.result.labelText).toBe(PHRASE);
    }
  });

  it("refuses anything but an issued container label", () => {
    const content = buildContainerLabelContent(input());
    if (!content.ok) throw new Error("expected a label");
    expect(
      buildContainerLabelPayload({
        content: content.outcome,
        document: identity("draft"),
      }).ok,
    ).toBe(false);
  });
});

describe("describeContainerContents", () => {
  it("names each confirmed chemistry once, in the taxonomy's order", () => {
    const described = describeContainerContents([
      { recordNumber: "BR-2", chemistry: "nimh", chemistryConfirmed: true },
      { recordNumber: "BR-1", chemistry: "li_lfp", chemistryConfirmed: true },
      { recordNumber: "BR-3", chemistry: "nimh", chemistryConfirmed: true },
    ]);
    expect(described).toEqual({
      ok: true,
      description: `${CHEMISTRY_LABELS.li_lfp}; ${CHEMISTRY_LABELS.nimh}`,
    });
  });

  it("refuses a chemistry outside the authored set rather than printing it", () => {
    const described = describeContainerContents([
      {
        recordNumber: "BR-1",
        chemistry: "plutonium",
        chemistryConfirmed: true,
      },
    ]);
    expect(described.ok).toBe(false);
  });
});
