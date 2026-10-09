import type { IsoDate, IsoTimestamp, TimeZone } from "@/types/common";
import { type RuleOutcome, ruleOutcome } from "@/domain/rules/outcome";
import type { ResolvedRule } from "@/domain/rules/resolve";
import { civilDateInZone } from "@/domain/storage/clock-display";
import {
  describeContainerContents,
  type ContentsDescriptionItem,
} from "@/domain/storage/contents-description";
import {
  CONTAINER_LABEL_RULE_KEY,
  readContainerLabelRule,
} from "@/domain/storage/label-rule";
import { appliedVersion } from "@/domain/transport/rule-data";

import type { DocumentPayloadBuild } from "./build-shipping-paper-payload";
import type { DocumentIdentity } from "./document-identity";

/**
 * The container label — what it says, and its render payload —
 * `TECHNICAL_SPEC.md` §8.1, §8.3; Rules 4.18–4.22, 5.21.
 *
 * **Every value is read from data**: the phrase from the rule version in force
 * on the print date (Rules 4.18, 5.21), the contents from the confirmed
 * chemistries of what is in the container, the start date from the
 * container's own `accumulation_started_at` read in the site's zone (Rule
 * 4.29), the handler identifier from the organization, and the QR's target
 * from the app's permanent address. Nothing is defaulted: a missing input
 * blocks the label and is named (Rules 3.4, 3.10), because a label that
 * guessed is a wrong label on a real drum.
 *
 * Two steps, as the paper's are: {@link buildContainerLabelContent} decides
 * what the label says before anything is written, and
 * {@link buildContainerLabelPayload} adds the render's own identity once the
 * render id exists.
 */

/** T-24 values a label may no longer be printed for — the contents have left. */
const UNLABELLABLE_STATUSES: readonly string[] = ["shipped", "retired"];

export interface ContainerLabelContentInput {
  readonly container: {
    readonly id: string;
    readonly containerCode: string;
    /** T-24 as stored. */
    readonly status: string;
    readonly accumulationStartedAt: IsoTimestamp | null;
    readonly siteTimeZone: TimeZone;
  };
  readonly contents: readonly (ContentsDescriptionItem & {
    readonly recordId: string;
  })[];
  /** `storage.container_label`, in force on the print date. */
  readonly labelRule: ResolvedRule | null;
  /** `organization.handler_identifier`, where one is held. */
  readonly handlerIdentifier: string | null;
  /** The app's permanent origin — where the QR points. */
  readonly appOrigin: string;
}

export type ContainerLabelContent = {
  readonly containerId: string;
  readonly containerCode: string;
  /** The rule version's phrase, verbatim. */
  readonly labelText: string;
  readonly contentsDescription: string;
  readonly accumulationStartedAt: IsoTimestamp;
  /** `accumulationStartedAt` as a calendar day in the site's zone — what prints. */
  readonly accumulationStartDate: IsoDate;
  readonly timeZone: TimeZone;
  readonly handlerIdentifier: string | null;
  /** Permanent URL to `/containers/[id]`. */
  readonly qrPayloadUrl: string;
  /** Exactly the contents the label describes — sorted. */
  readonly recordIds: readonly string[];
};

export type ContainerLabelContentBuild =
  | { readonly ok: true; readonly outcome: RuleOutcome<ContainerLabelContent> }
  | { readonly ok: false; readonly findings: readonly string[] };

/** A label's render payload — and its render's input snapshot. */
export type ContainerLabelPayload = ContainerLabelContent & {
  readonly document: DocumentIdentity;
};

function readOrigin(appOrigin: string): string | null {
  if (!URL.canParse(appOrigin)) return null;
  const url = new URL(appOrigin);
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  return url.origin;
}

export function buildContainerLabelContent(
  input: ContainerLabelContentInput,
): ContainerLabelContentBuild {
  const { container } = input;
  const findings: string[] = [];

  if (UNLABELLABLE_STATUSES.includes(container.status)) {
    findings.push(
      `${container.containerCode} has left the site or been retired. A label is printed only for a container that still holds its contents.`,
    );
  }

  const contents = describeContainerContents(input.contents);
  if (!contents.ok) findings.push(...contents.findings);

  const startedAt = container.accumulationStartedAt;
  if (startedAt === null && input.contents.length > 0) {
    findings.push(
      `${container.containerCode} has no accumulation start date on record, so no label can state one (Rule 4.18).`,
    );
  }

  const rule =
    input.labelRule === null ? null : readContainerLabelRule(input.labelRule);
  if (input.labelRule === null) {
    findings.push(
      `No container label rule (${CONTAINER_LABEL_RULE_KEY}) is on file for this site's jurisdiction on this date, so the required wording is unknown.`,
    );
  } else if (rule === null) {
    findings.push(
      `The container label rule on file (${CONTAINER_LABEL_RULE_KEY}) is not in a form this version can read.`,
    );
  }

  const origin = readOrigin(input.appOrigin);
  if (origin === null) {
    findings.push(
      "The app's permanent address is not configured, so the label's QR code has nowhere to point.",
    );
  }

  if (
    findings.length > 0 ||
    !contents.ok ||
    startedAt === null ||
    rule === null ||
    input.labelRule === null ||
    origin === null
  ) {
    return { ok: false, findings };
  }

  const recordIds = input.contents.map((item) => item.recordId).sort();
  const content: ContainerLabelContent = {
    containerId: container.id,
    containerCode: container.containerCode,
    labelText: rule.phrase,
    contentsDescription: contents.description,
    accumulationStartedAt: startedAt,
    accumulationStartDate: civilDateInZone(startedAt, container.siteTimeZone),
    timeZone: container.siteTimeZone,
    handlerIdentifier:
      input.handlerIdentifier === null || input.handlerIdentifier.trim() === ""
        ? null
        : input.handlerIdentifier.trim(),
    qrPayloadUrl: `${origin}/containers/${container.id}`,
    recordIds,
  };

  return {
    ok: true,
    outcome: ruleOutcome({
      result: content,
      reasoning:
        `Container label for ${container.containerCode}: the phrase the governing rule version carries, verbatim; ` +
        `the confirmed chemistries of its ${recordIds.length} ${recordIds.length === 1 ? "battery" : "batteries"}; ` +
        `and its accumulation start date in the site's zone.`,
      ruleVersionsApplied: [
        appliedVersion(
          input.labelRule,
          { containerCode: container.containerCode },
          "container_label_phrase",
        ),
      ],
      inputsSnapshot: {
        containerId: container.id,
        accumulationStartedAt: startedAt,
        recordIds,
      },
      context: CONTAINER_LABEL_RULE_KEY,
    }),
  };
}

/** The label's render payload. Refuses, by name, anything an issued label must carry. */
export function buildContainerLabelPayload(input: {
  readonly content: RuleOutcome<ContainerLabelContent>;
  readonly document: DocumentIdentity;
}): DocumentPayloadBuild<ContainerLabelPayload> {
  const { content, document } = input;
  const label = content.result;
  const missing: string[] = [];
  if (label.labelText.trim() === "") missing.push("label_text");
  if (label.contentsDescription.trim() === "") {
    missing.push("contents_description");
  }
  if (label.qrPayloadUrl.trim() === "") missing.push("qr_payload_url");
  if (
    document.status !== "issued" ||
    document.documentType !== "container_label"
  ) {
    missing.push("document.issued_container_label");
  }
  if (missing.length > 0) return { ok: false, missing };
  return {
    ok: true,
    outcome: ruleOutcome({
      result: { ...label, document },
      reasoning: content.reasoning,
      ruleVersionsApplied: content.ruleVersionsApplied,
      inputsSnapshot: content.inputsSnapshot,
      context: "container_label.render_payload",
    }),
  };
}
