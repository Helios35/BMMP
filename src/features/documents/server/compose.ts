import "server-only";

import type { ReactElement } from "react";
import type { DocumentProps } from "@react-pdf/renderer";

import type {
  ComposedDocument,
  DocumentComposer,
  DocumentRenderIdentity,
} from "@/data/contracts";
import {
  buildContainerLabelPayload,
  type ContainerLabelContent,
} from "@/domain/documents/build-container-label-payload";
import {
  buildShippingPaperDocumentPayload,
  buildShippingPaperDraftPayload,
  type DocumentPayloadBuild,
} from "@/domain/documents/build-shipping-paper-payload";
import {
  documentIdentity,
  type DocumentIdentity,
  type RenderedDocumentType,
} from "@/domain/documents/document-identity";
import { canonicalJson, verificationCodeOf } from "@/domain/documents/snapshot";
import type { RuleOutcome } from "@/domain/rules/outcome";
import type {
  ShippingPaperDraft,
  ShippingPaperPayload,
} from "@/domain/transport/shipping-paper";
import { DocumentRenderError } from "@/lib/errors";
import { sha256HexOfText } from "@/lib/hash/sha256";
import { unprintableCharacters } from "@/lib/pdf/fonts";
import { RENDERER_NAME, RENDERER_VERSION, renderPdf } from "@/lib/pdf/render";
import type { JsonObject, PostalAddress, TimeZone } from "@/types/common";

import {
  CONTAINER_LABEL_TEMPLATE,
  ContainerLabelTemplate,
} from "../templates/container-label-template";
import {
  SHIPPING_PAPER_TEMPLATE,
  ShippingPaperTemplate,
} from "../templates/shipping-paper-template";

/**
 * The document engine — `TECHNICAL_SPEC.md` §8.1–§8.4, in the order they
 * happen.
 *
 * A write hands the adapter one of these composers; the adapter mints the
 * render id and calls it **inside** the write. For that id the composer:
 *
 * 1. stamps the render's identity into the payload and has the domain builder
 *    **validate the whole** — a payload missing the 24-hour number, the
 *    certification or the label wording stops here, by name, before any
 *    renderer runs (§8.1, Rule 5.7);
 * 2. refuses a payload holding a character the embedded fonts cannot print,
 *    rather than printing it as nothing;
 * 3. hashes the canonical snapshot **before** rendering and cuts the
 *    verification code from it (§8.4);
 * 4. renders the template over that payload — and only that payload.
 *
 * It never reads data and never decides anything: what the document says was
 * decided by the builder the write ran first, and what the render is called
 * was minted by the adapter.
 */

const PRODUCER = `BMMP document engine (${RENDERER_NAME} ${RENDERER_VERSION})`;

function refused(missing: readonly string[]): DocumentRenderError {
  return new DocumentRenderError({
    userMessage: `This document cannot be generated: it is missing ${missing.join(", ")}. Nothing was issued.`,
    context: { reason: "payload_refused", missing },
  });
}

async function compose(
  documentType: RenderedDocumentType,
  template: { readonly templateKey: string; readonly templateVersion: string },
  snapshot: JsonObject,
  outcome: Pick<RuleOutcome<unknown>, "ruleVersionsApplied">,
  render: (verificationCode: string) => ReactElement<DocumentProps>,
): Promise<ComposedDocument> {
  const unprintable = unprintableCharacters(snapshot);
  if (unprintable.length > 0) {
    throw new DocumentRenderError({
      userMessage: `This document holds characters its font cannot print (${unprintable
        .map((found) => `${found.character} ${found.codePoint} in ${found.at}`)
        .join("; ")}). Nothing was issued — correct the record and try again.`,
      context: { reason: "unprintable_characters" },
    });
  }
  const inputSnapshotHash = await sha256HexOfText(canonicalJson(snapshot));
  const started = performance.now();
  const { bytes, pageCount } = await renderPdf(
    render(verificationCodeOf(inputSnapshotHash)),
  );
  return {
    documentType,
    inputSnapshot: snapshot,
    inputSnapshotHash,
    templateKey: template.templateKey,
    templateVersion: template.templateVersion,
    rendererName: RENDERER_NAME,
    rendererVersion: RENDERER_VERSION,
    bytes,
    pageCount,
    ruleVersionsApplied: outcome.ruleVersionsApplied,
    renderDurationMs: Math.round(performance.now() - started),
  };
}

function identityFor(
  identity: DocumentRenderIdentity,
  documentType: RenderedDocumentType,
  template: { readonly templateKey: string; readonly templateVersion: string },
  timeZone: TimeZone,
  draftNotice: string,
): DocumentIdentity {
  return documentIdentity({
    documentRenderId: identity.documentRenderId,
    documentType,
    status: identity.status,
    templateKey: template.templateKey,
    templateVersion: template.templateVersion,
    renderedAt: identity.renderedAt,
    timeZone,
    producer: PRODUCER,
    draftNotice,
  });
}

function accepted<T>(build: DocumentPayloadBuild<T>): RuleOutcome<T> {
  if (!build.ok) throw refused(build.missing);
  return build.outcome;
}

/** The issued shipping paper, exactly as the builder's complete outcome says. */
export function composeShippingPaper(input: {
  readonly paper: RuleOutcome<ShippingPaperPayload>;
  readonly shipperName: string;
  /** The site's zone — the issue instant prints in it (Rule 4.29). */
  readonly timeZone: TimeZone;
}): DocumentComposer {
  return async (identity) => {
    const outcome = accepted(
      buildShippingPaperDocumentPayload({
        paper: input.paper,
        shipperName: input.shipperName,
        document: identityFor(
          identity,
          "shipping_paper",
          SHIPPING_PAPER_TEMPLATE,
          input.timeZone,
          "",
        ),
      }),
    );
    const payload = outcome.result;
    return compose(
      "shipping_paper",
      SHIPPING_PAPER_TEMPLATE,
      payload,
      outcome,
      (verificationCode) =>
        ShippingPaperTemplate({ payload, verificationCode }),
    );
  };
}

/** A draft of the shipping paper — watermarked on every page, never a document (Rule 5.28). */
export function composeShippingPaperDraft(input: {
  readonly draft: ShippingPaperDraft;
  readonly origin: PostalAddress | null;
  readonly destinationAddress: PostalAddress | null;
  readonly destinationIdentifier: string | null;
  readonly carrierIdentifier: string | null;
  readonly shipperName: string;
  readonly gap: string;
  readonly draftNotice: string;
  readonly timeZone: TimeZone;
}): DocumentComposer {
  return async (identity) => {
    const build = buildShippingPaperDraftPayload({
      draft: input.draft,
      origin: input.origin,
      destinationAddress: input.destinationAddress,
      destinationIdentifier: input.destinationIdentifier,
      carrierIdentifier: input.carrierIdentifier,
      shipperName: input.shipperName,
      gap: input.gap,
      document: identityFor(
        identity,
        "shipping_paper",
        SHIPPING_PAPER_TEMPLATE,
        input.timeZone,
        input.draftNotice,
      ),
    });
    if (!build.ok) throw refused(build.missing);
    const { payload } = build;
    return compose(
      "shipping_paper",
      SHIPPING_PAPER_TEMPLATE,
      payload,
      { ruleVersionsApplied: [] },
      (verificationCode) =>
        ShippingPaperTemplate({ payload, verificationCode }),
    );
  };
}

/** A container label, exactly as `buildContainerLabelContent` decided it. */
export function composeContainerLabel(input: {
  readonly content: RuleOutcome<ContainerLabelContent>;
}): DocumentComposer {
  return async (identity) => {
    const outcome = accepted(
      buildContainerLabelPayload({
        content: input.content,
        document: identityFor(
          identity,
          "container_label",
          CONTAINER_LABEL_TEMPLATE,
          input.content.result.timeZone,
          "",
        ),
      }),
    );
    const payload = outcome.result;
    return compose(
      "container_label",
      CONTAINER_LABEL_TEMPLATE,
      payload,
      outcome,
      (verificationCode) =>
        ContainerLabelTemplate({ payload, verificationCode }),
    );
  };
}
