import { beforeEach, describe, expect, it } from "vitest";

import { mockAdapter, mockStore, resetMockStore } from "@/data/mock";
import * as ID from "@/data/mock/fixtures/ids";
import { buildContainerLabelContent } from "@/domain/documents/build-container-label-payload";
import { canonicalJson, verificationCodeOf } from "@/domain/documents/snapshot";
import { generateContainerLabel } from "@/features/containers/server/label";
import {
  composeContainerLabel,
  composeShippingPaper,
} from "@/features/documents/server/compose";
import { readShippingPaperBuild } from "@/features/shipments/server/paper-build";
import {
  assembleShipment,
  departShipment,
  generateShippingPaper,
  recordShipmentTransport,
  storeShippingPaperDraft,
  voidShippingPaper,
} from "@/features/shipments/server/writes";
import {
  ConflictError,
  DocumentIntegrityError,
  DocumentRenderError,
  PermissionError,
  ValidationError,
} from "@/lib/errors";
import { sha256Hex, sha256HexOfText } from "@/lib/hash/sha256";

import {
  AT,
  auditRows,
  ctx,
  HANDLER,
  LATER,
  MANAGER,
  newContainerHolding,
  NO_ATTRIBUTION,
  pdfText,
  storedBytes,
  transport,
  verifyCascadeNumber,
} from "./document-support";

/**
 * The document engine, end to end against the mock adapter through the same
 * server functions the Server Actions call — `b1a-06-documents`' "Done".
 *
 * **The one hard idea: a reprint never re-renders.** The bytes made at issue
 * are the bytes forever, the same input makes the same bytes, and a
 * correction is a new render that points at the old one. No fixture is
 * edited; no paper is reachable on fixtures (no verified 24-hour number), so
 * each paper here stands on an in-memory verification.
 */

beforeEach(() => {
  resetMockStore();
});

async function labelFor(containerId: string) {
  return generateContainerLabel(HANDLER, containerId, AT, NO_ATTRIBUTION);
}

async function issuedPaper(location: string) {
  verifyCascadeNumber();
  const container = await newContainerHolding(
    [ID.BATTERY.vehicleTraction],
    location,
  );
  await labelFor(container.id);
  const shipment = await assembleShipment(
    HANDLER,
    { containerIds: [container.id], transport: transport() },
    AT,
    NO_ATTRIBUTION,
  );
  const issued = await generateShippingPaper(
    HANDLER,
    shipment.id,
    AT,
    NO_ATTRIBUTION,
  );
  return { container, shipment, issued };
}

// ---------------------------------------------------------------------------------------------

describe("byte-determinism (TECHNICAL_SPEC.md §8.1)", () => {
  it("renders an identical payload to identical bytes, every time", async () => {
    verifyCascadeNumber();
    const container = await newContainerHolding(
      [ID.BATTERY.vehicleTraction],
      "Determinism bay",
    );
    await labelFor(container.id);
    const shipment = await assembleShipment(
      HANDLER,
      { containerIds: [container.id], transport: transport() },
      AT,
      NO_ATTRIBUTION,
    );
    const { build } = await readShippingPaperBuild(HANDLER, shipment, AT);
    if (build.kind !== "complete") throw new Error("expected a complete build");
    const compose = composeShippingPaper({
      paper: build.outcome,
      shipperName: "Cascade Auto Recyclers LLC",
      timeZone: "America/Los_Angeles",
    });
    const identity = {
      documentRenderId: "0a0000ff-0000-4000-8000-0000000000aa",
      renderedAt: AT,
      status: "issued" as const,
    };

    const first = await compose(identity);
    const second = await compose(identity);
    expect(Buffer.from(first.bytes).equals(Buffer.from(second.bytes))).toBe(
      true,
    );
    expect(first.inputSnapshotHash).toBe(second.inputSnapshotHash);
    // The hash is of the canonical snapshot, computed before rendering.
    expect(first.inputSnapshotHash).toBe(
      await sha256HexOfText(canonicalJson(first.inputSnapshot)),
    );

    // Another render of the same paper is another document: its own id in
    // the footer, its own code.
    const other = await compose({
      ...identity,
      documentRenderId: "0a0000ff-0000-4000-8000-0000000000ab",
    });
    expect(other.inputSnapshotHash).not.toBe(first.inputSnapshotHash);
    expect(Buffer.from(other.bytes).equals(Buffer.from(first.bytes))).toBe(
      false,
    );
  });

  it("makes the same bytes whatever was rendered before it, and its text reads what its page shows", async () => {
    // A render must depend on its payload and nothing else — not on which
    // documents this process happened to render first.
    verifyCascadeNumber();
    const container = await newContainerHolding(
      [ID.BATTERY.vehicleTraction],
      "History bay",
    );
    await labelFor(container.id);
    const shipment = await assembleShipment(
      HANDLER,
      {
        containerIds: [container.id],
        transport: transport({ carrierName: "Coleridge Hauling Co." }),
      },
      AT,
      NO_ATTRIBUTION,
    );
    const { build } = await readShippingPaperBuild(HANDLER, shipment, AT);
    if (build.kind !== "complete") throw new Error("expected a complete build");
    const compose = composeShippingPaper({
      paper: build.outcome,
      shipperName: "Cascade Auto Recyclers LLC",
      timeZone: "America/Los_Angeles",
    });
    const identity = {
      documentRenderId: "0a0000ff-0000-4000-8000-0000000000ad",
      renderedAt: AT,
      status: "issued" as const,
    };
    const first = await compose(identity);

    // A working day's documents in between — labels, papers, a void and its
    // correction, a draft — each with other glyphs in other orders.
    await generateContainerLabel(
      HANDLER,
      ID.CONTAINER.quarantineDrum,
      LATER,
      NO_ATTRIBUTION,
    );
    for (const carrierName of [
      "Kettle Falls Freight",
      "Yakima Quick Haul",
      "Fairfax & Sons Trucking",
    ]) {
      await recordShipmentTransport(
        HANDLER,
        { shipmentId: shipment.id, transport: transport({ carrierName }) },
        LATER,
        NO_ATTRIBUTION,
      );
      await storeShippingPaperDraft(
        HANDLER,
        shipment.id,
        LATER,
        NO_ATTRIBUTION,
      );
    }
    const issued = await generateShippingPaper(
      HANDLER,
      shipment.id,
      LATER,
      NO_ATTRIBUTION,
    );
    await voidShippingPaper(
      HANDLER,
      { shipmentId: issued.shipment.id, reason: "History test." },
      LATER,
      NO_ATTRIBUTION,
    );
    await recordShipmentTransport(
      HANDLER,
      {
        shipmentId: shipment.id,
        transport: transport({ carrierName: "Quincy Tanker 24/7 Co." }),
      },
      LATER,
      NO_ATTRIBUTION,
    );
    await generateShippingPaper(HANDLER, shipment.id, LATER, NO_ATTRIBUTION);
    await generateContainerLabel(HANDLER, container.id, LATER, NO_ATTRIBUTION);

    const again = await compose(identity);
    expect(Buffer.from(again.bytes).equals(Buffer.from(first.bytes))).toBe(
      true,
    );
    const text = await pdfText(again.bytes);
    for (const printed of [
      "Coleridge Hauling Co.",
      "UN3480, Lithium ion batteries, 9",
      "+1-800-555-0142",
      "TRANSPORT MODE",
    ]) {
      expect(text).toContain(printed);
    }
  });

  it("renders a label identically twice, and prints the payload it was given", async () => {
    const container = await newContainerHolding(
      [ID.BATTERY.vehicleTraction],
      "Determinism label bay",
    );
    const organization = mockStore()
      .organizations.all()
      .find((org) => org.id === ID.ORG.cascade);
    const rule = await mockAdapter.ruleVersions.resolve(HANDLER, {
      ruleKeys: ["storage.container_label"],
      jurisdictionId: ID.JURISDICTION.washington,
      asOf: "2026-10-09",
    });
    const content = buildContainerLabelContent({
      container: {
        id: container.id,
        containerCode: container.containerCode,
        status: container.status,
        accumulationStartedAt: container.accumulationStartedAt,
        siteTimeZone: container.siteTimeZone,
      },
      contents: [
        {
          recordId: ID.BATTERY.vehicleTraction,
          recordNumber: "BR-0001",
          chemistry: "li_nmc",
          chemistryConfirmed: true,
        },
      ],
      labelRule: rule.ok
        ? (rule.resolved.rules["storage.container_label"] ?? null)
        : null,
      handlerIdentifier: organization?.handlerIdentifier ?? null,
      appOrigin: "https://bmmp.test",
    });
    if (!content.ok) throw new Error(content.findings.join(" "));
    const compose = composeContainerLabel({ content: content.outcome });
    const identity = {
      documentRenderId: "0a0000ff-0000-4000-8000-0000000000ac",
      renderedAt: AT,
      status: "issued" as const,
    };
    const first = await compose(identity);
    const second = await compose(identity);
    expect(Buffer.from(first.bytes).equals(Buffer.from(second.bytes))).toBe(
      true,
    );
    expect(first.pageCount).toBe(1);

    const text = await pdfText(first.bytes);
    expect(text).toContain(content.outcome.result.labelText);
    expect(text).toContain(content.outcome.result.accumulationStartDate);
    expect(text).toContain(container.containerCode);
    expect(text).toContain(identity.documentRenderId);
    expect(text).toContain(verificationCodeOf(first.inputSnapshotHash));
  });
});

describe("a new container is labelled, and then it ships (outcome 4)", () => {
  it("is refused at step 1 until labelled, and admitted once it is", async () => {
    const container = await newContainerHolding(
      [ID.BATTERY.vehicleTraction],
      "New bay",
    );
    await expect(
      assembleShipment(
        HANDLER,
        { containerIds: [container.id], transport: transport() },
        AT,
        NO_ATTRIBUTION,
      ),
    ).rejects.toThrow(/no label in force/);

    const issued = await labelFor(container.id);
    expect(issued.container.currentContainerLabelId).toBe(
      issued.containerLabel.id,
    );
    expect(issued.documentRender).toMatchObject({
      documentType: "container_label",
      status: "issued",
      containerId: container.id,
      storageObjectPath: `org/${ID.ORG.cascade}/container_label/${issued.documentRender.id}.pdf`,
    });
    expect(issued.containerLabel.labelText).toBe("UNIVERSAL WASTE — BATTERIES");
    expect(issued.containerLabel.governingRuleVersionId).toBe(
      ID.RULE_VERSION.waContainerLabel2026,
    );
    expect(issued.containerLabel.qrPayloadUrl).toBe(
      `https://bmmp.test/containers/${container.id}`,
    );
    expect(
      auditRows("document_render.issued", issued.documentRender.id),
    ).toHaveLength(1);

    const shipment = await assembleShipment(
      HANDLER,
      { containerIds: [container.id], transport: transport() },
      AT,
      NO_ATTRIBUTION,
    );
    expect(shipment.status).toBe("draft");

    // And it goes all the way: a verified number, a paper with bytes, departure.
    verifyCascadeNumber();
    const paper = await generateShippingPaper(
      HANDLER,
      shipment.id,
      AT,
      NO_ATTRIBUTION,
    );
    expect(paper.shipment.offeredAt).toBe(AT);
    const departed = await departShipment(
      HANDLER,
      shipment.id,
      LATER,
      NO_ATTRIBUTION,
    );
    expect(departed.shipment.status).toBe("dispatched");
  });

  it("is a Facility Manager's act too (§5.5), and never the auditor's", async () => {
    const container = await newContainerHolding(
      [ID.BATTERY.vehicleTraction],
      "Manager bay",
    );
    const issued = await generateContainerLabel(
      MANAGER,
      container.id,
      AT,
      NO_ATTRIBUTION,
    );
    expect(issued.documentRender.renderedBy).toBe(ID.USER.martaManager);
    await expect(
      generateContainerLabel(
        ctx({ userId: ID.USER.samAuditor, role: "auditor" }),
        container.id,
        AT,
        NO_ATTRIBUTION,
      ),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("supersedes the label it replaces, keeping its bytes and its row (Rules 4.20, 5.15)", async () => {
    const container = await newContainerHolding(
      [ID.BATTERY.vehicleTraction],
      "Relabel bay",
    );
    const first = await labelFor(container.id);
    const second = await generateContainerLabel(
      HANDLER,
      container.id,
      LATER,
      NO_ATTRIBUTION,
    );
    expect(second.supersededDocumentRenderId).toBe(first.documentRender.id);
    expect(second.documentRender.supersedesDocumentRenderId).toBe(
      first.documentRender.id,
    );
    expect(second.containerLabel.supersedesContainerLabelId).toBe(
      first.containerLabel.id,
    );
    expect(second.container.currentContainerLabelId).toBe(
      second.containerLabel.id,
    );
    const old = await mockAdapter.documentRenders.get(
      HANDLER,
      first.documentRender.id,
    );
    expect(old).toMatchObject({ status: "superseded", supersededAt: LATER });
    // Kept in full: the old bytes still read, unchanged.
    const reread = await mockAdapter.documentRenders.readBytes(
      HANDLER,
      first.documentRender.id,
    );
    expect(reread.contentHash).toBe(first.documentRender.contentHash);
    expect(
      auditRows("document_render.superseded", first.documentRender.id),
    ).toHaveLength(1);
  });

  it("marks supersession only for the render that replaces it, and never refuses P1 (b1a-05's landmine)", async () => {
    const container = await newContainerHolding(
      [ID.BATTERY.vehicleTraction],
      "Mark bay",
    );
    const first = await labelFor(container.id);
    const second = await generateContainerLabel(
      HANDLER,
      container.id,
      LATER,
      NO_ATTRIBUTION,
    );
    const marked = await mockAdapter.documentRenders.markSuperseded(
      HANDLER,
      first.documentRender.id,
      second.documentRender.id,
    );
    expect(marked).toMatchObject({ status: "superseded", supersededAt: LATER });
    await expect(
      mockAdapter.documentRenders.markSuperseded(
        HANDLER,
        second.documentRender.id,
        first.documentRender.id,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("supersedes the sound drum's fixture label too, through the definer door, for P1", async () => {
    // b1a-05's landmine: `markSuperseded` used a policy-checked update and
    // refused P1. The supersession is the trigger's, so a handler makes it.
    const issued = await labelFor(ID.CONTAINER.soundDrum);
    expect(issued.supersededDocumentRenderId).toBe(
      ID.DOCUMENT_RENDER.soundDrumLabel,
    );
    const fixture = await mockAdapter.documentRenders.get(
      HANDLER,
      ID.DOCUMENT_RENDER.soundDrumLabel,
    );
    expect(fixture?.status).toBe("superseded");
  });
});

describe("issue is one operation (§8.2)", () => {
  it("stores the paper's bytes where nothing can overwrite them, with every field unit 05 left empty filled", async () => {
    const { issued } = await issuedPaper("Issue bay");
    const render = issued.documentRender;
    expect(render.storageObjectPath).toBe(
      `org/${ID.ORG.cascade}/shipping_paper/${render.id}.pdf`,
    );
    const bytes = storedBytes(render.storageObjectPath);
    expect(render.contentHash).toBe(await sha256Hex(bytes));
    expect(render.byteSize).toBe(bytes.byteLength);
    expect(render.pageCount).toBeGreaterThanOrEqual(1);
    expect(render.inputSnapshotHash).toBe(
      await sha256HexOfText(canonicalJson(render.inputSnapshot)),
    );
    expect(render.verificationCode).toBe(
      verificationCodeOf(render.inputSnapshotHash),
    );
    expect(render.rendererName).toBe("react-pdf");
    expect(render.ruleVersionsApplied.map((v) => v.ruleKey)).toEqual([
      "transport.basic_description",
      "transport.shipper_certification",
    ]);

    // What the paper says is what the payload says — and every line.
    const text = await pdfText(bytes);
    expect(text).toContain(issued.shippingPaper.emergencyResponsePhone);
    expect(text).toContain(issued.shippingPaper.basicDescription);
    expect(text).toContain(render.id);
    expect(text).toContain(render.verificationCode);
    expect(text).not.toContain("NOT VALID");

    await expect(
      mockAdapter.objects.put(HANDLER, {
        bucket: "documents",
        path: render.storageObjectPath,
        bytes: new Uint8Array([1, 2, 3]),
        contentType: "application/pdf",
        immutable: true,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("leaves no row and no bytes when the render fails, and records the failure", async () => {
    verifyCascadeNumber();
    const container = await newContainerHolding(
      [ID.BATTERY.vehicleTraction],
      "Failure bay",
    );
    await labelFor(container.id);
    // A carrier name the embedded fonts cannot print: printing it as nothing
    // would be a wrong document, so the render refuses.
    const shipment = await assembleShipment(
      HANDLER,
      {
        containerIds: [container.id],
        transport: transport({ carrierName: "运输公司 Hauling" }),
      },
      AT,
      NO_ATTRIBUTION,
    );
    const rendersBefore = mockStore().documentRenders.all().length;
    const objectsBefore = mockStore().objects.size;
    await expect(
      generateShippingPaper(HANDLER, shipment.id, AT, NO_ATTRIBUTION),
    ).rejects.toBeInstanceOf(DocumentRenderError);
    expect(mockStore().documentRenders.all()).toHaveLength(rendersBefore);
    expect(mockStore().objects.size).toBe(objectsBefore);
    expect(
      mockStore()
        .shippingPapers.all()
        .filter((paper) => paper.shipmentId === shipment.id),
    ).toHaveLength(0);
    const after = await mockAdapter.shipments.get(HANDLER, shipment.id);
    expect(after?.status).toBe("ready");
    const [failure] = auditRows("document.render_failed", shipment.id);
    expect(failure?.afterState).toMatchObject({
      documentType: "shipping_paper",
      code: "DOCUMENT_RENDER",
      reason: "unprintable_characters",
    });
  });
});

describe("a reprint streams the stored bytes (§8.4)", () => {
  it("reads back the bytes made at issue, byte for byte, every time", async () => {
    const { issued } = await issuedPaper("Reprint bay");
    const render = issued.documentRender;
    const atIssue = new Uint8Array(storedBytes(render.storageObjectPath));
    const first = await mockAdapter.documentRenders.readBytes(
      HANDLER,
      render.id,
    );
    const second = await mockAdapter.documentRenders.readBytes(
      HANDLER,
      render.id,
    );
    expect(Buffer.from(first.bytes).equals(Buffer.from(atIssue))).toBe(true);
    expect(Buffer.from(second.bytes).equals(Buffer.from(atIssue))).toBe(true);
    expect(first.contentHash).toBe(render.contentHash);
    // Nothing was rendered to serve them.
    expect(
      mockStore()
        .documentRenders.all()
        .filter((row) => row.shipmentId === render.shipmentId),
    ).toHaveLength(1);
  });

  it("raises DocumentIntegrityError on one tampered byte, and verify says the bytes no longer match", async () => {
    const { issued } = await issuedPaper("Tamper bay");
    const render = issued.documentRender;
    const stored = mockStore().objects.get(
      `documents:${render.storageObjectPath}`,
    );
    if (stored === undefined) throw new Error("no stored bytes");
    const last = stored.bytes.length - 20;
    stored.bytes[last] = (stored.bytes[last] ?? 0) ^ 0xff;

    await expect(
      mockAdapter.documentRenders.readBytes(HANDLER, render.id),
    ).rejects.toBeInstanceOf(DocumentIntegrityError);
    const verification = await mockAdapter.documentRenders.verify(
      HANDLER,
      render.id,
    );
    expect(verification.bytesMatch).toBe(false);
    expect(verification.inputSnapshotMatches).toBe(true);
  });
});

describe("departure requires an issued paper with bytes (outcome 3)", () => {
  it("refuses a shipment whose paper has no stored bytes", async () => {
    const { shipment, issued } = await issuedPaper("Bytes bay");
    mockStore().objects.delete(
      `documents:${issued.documentRender.storageObjectPath}`,
    );
    await expect(
      departShipment(HANDLER, shipment.id, LATER, NO_ATTRIBUTION),
    ).rejects.toThrow(/no stored file/);
    await expect(
      mockAdapter.shipments.offer(HANDLER, shipment.id, { offeredAt: LATER }),
    ).rejects.toThrow(/no issued shipping paper/);
  });

  it("offers through the same predicate: issuing offered it, and offering again changes nothing", async () => {
    const { shipment } = await issuedPaper("Offer bay");
    const offered = await mockAdapter.shipments.offer(HANDLER, shipment.id, {
      offeredAt: LATER,
    });
    expect(offered.status).toBe("documents_issued");
    expect(offered.offeredAt).toBe(AT);
  });
});

describe("void with a reason (D-58 item 8)", () => {
  it("marks the paper void with its reason and actor, keeps it readable, and reopens the shipment", async () => {
    const { shipment, issued } = await issuedPaper("Void bay");
    await expect(
      voidShippingPaper(
        HANDLER,
        { shipmentId: shipment.id, reason: "  " },
        LATER,
        NO_ATTRIBUTION,
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    const voided = await voidShippingPaper(
      HANDLER,
      { shipmentId: shipment.id, reason: "Carrier name was mistyped." },
      LATER,
      NO_ATTRIBUTION,
    );
    expect(voided.voidedDocumentRenderId).toBe(issued.documentRender.id);
    expect(["draft", "ready"]).toContain(voided.shipment.status);
    const render = await mockAdapter.documentRenders.get(
      HANDLER,
      issued.documentRender.id,
    );
    expect(render?.status).toBe("voided");
    const [audit] = auditRows("document_render.voided", render?.id);
    expect(audit).toMatchObject({
      reason: "Carrier name was mistyped.",
      actorUserId: ID.USER.danaHandler,
    });
    // Still readable, byte for byte.
    const reread = await mockAdapter.documentRenders.readBytes(
      HANDLER,
      issued.documentRender.id,
    );
    expect(reread.contentHash).toBe(issued.documentRender.contentHash);

    // The shipment needs a new paper: it cannot depart, and its transport
    // details are open for the correction.
    await expect(
      departShipment(HANDLER, shipment.id, LATER, NO_ATTRIBUTION),
    ).rejects.toThrow(/no issued shipping paper/);
    await recordShipmentTransport(
      HANDLER,
      {
        shipmentId: shipment.id,
        transport: transport({ carrierName: "Coleridge Hauling Co." }),
      },
      LATER,
      NO_ATTRIBUTION,
    );
    const corrected = await generateShippingPaper(
      HANDLER,
      shipment.id,
      LATER,
      NO_ATTRIBUTION,
    );
    expect(corrected.documentRender.supersedesDocumentRenderId).toBe(
      issued.documentRender.id,
    );
    expect(
      await pdfText(storedBytes(corrected.documentRender.storageObjectPath)),
    ).toContain("Coleridge Hauling Co.");
    // A voided render is terminal: the correction does not re-mark it.
    const still = await mockAdapter.documentRenders.get(
      HANDLER,
      issued.documentRender.id,
    );
    expect(still?.status).toBe("voided");
  });

  it("refuses a void when nothing is issued", async () => {
    const container = await newContainerHolding(
      [ID.BATTERY.vehicleTraction],
      "Nothing to void",
    );
    await labelFor(container.id);
    const shipment = await assembleShipment(
      HANDLER,
      { containerIds: [container.id], transport: transport() },
      AT,
      NO_ATTRIBUTION,
    );
    await expect(
      voidShippingPaper(
        HANDLER,
        { shipmentId: shipment.id, reason: "No paper yet." },
        LATER,
        NO_ATTRIBUTION,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("a draft is never a document (D-58 item 9; Rule 5.28)", () => {
  it("is stored watermarked when printed, and the checklist and the shipment are unchanged", async () => {
    // The fixtures as they stand: no verified number, so the paper is blocked.
    const container = await newContainerHolding(
      [ID.BATTERY.vehicleTraction],
      "Draft bay",
    );
    await labelFor(container.id);
    const shipment = await assembleShipment(
      HANDLER,
      { containerIds: [container.id], transport: transport() },
      AT,
      NO_ATTRIBUTION,
    );
    const before = await readShippingPaperBuild(HANDLER, shipment, AT);

    const draft = await storeShippingPaperDraft(
      HANDLER,
      shipment.id,
      AT,
      NO_ATTRIBUTION,
    );
    expect(draft).toMatchObject({
      status: "draft",
      documentType: "shipping_paper",
      shipmentId: shipment.id,
    });
    expect(draft.inputSnapshot.document).toMatchObject({
      status: "draft",
      watermark: "NOT VALID",
    });
    const text = await pdfText(storedBytes(draft.storageObjectPath));
    expect(text).toContain("NOT VALID");
    expect(text).toContain("Not on file — the paper cannot be generated");

    const after = await readShippingPaperBuild(HANDLER, shipment, AT);
    expect(after.build.checklist).toEqual(before.build.checklist);
    expect(
      mockStore()
        .shippingPapers.all()
        .filter((paper) => paper.shipmentId === shipment.id),
    ).toHaveLength(0);
    const unchanged = await mockAdapter.shipments.get(HANDLER, shipment.id);
    expect(unchanged?.status).toBe(shipment.status);
    // It closes nothing: no departure, no offer.
    await expect(
      departShipment(HANDLER, shipment.id, LATER, NO_ATTRIBUTION),
    ).rejects.toThrow(/no issued shipping paper/);
    await expect(
      mockAdapter.shipments.offer(HANDLER, shipment.id, { offeredAt: LATER }),
    ).rejects.toThrow(/no issued shipping paper/);
  });

  it("is refused once a paper is issued — print the issued paper instead", async () => {
    const { shipment } = await issuedPaper("Drafted late");
    await expect(
      storeShippingPaperDraft(HANDLER, shipment.id, LATER, NO_ATTRIBUTION),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("the authored rule data (D-58 item 2; outcome 9)", () => {
  it("adds the shipper certification as a new version, and leaves the packaging exception not on file", async () => {
    const resolution = await mockAdapter.ruleVersions.resolve(HANDLER, {
      ruleKeys: [
        "transport.shipper_certification",
        "transport.packaging_exception",
      ],
      jurisdictionId: ID.JURISDICTION.washington,
      asOf: "2026-10-09",
    });
    expect(resolution.ok).toBe(false);
    if (resolution.ok) return;
    const certification =
      resolution.partial.rules["transport.shipper_certification"];
    expect(certification?.version).toMatchObject({
      ruleVersionId: ID.RULE_VERSION.federalShipperCertification2026,
      payloadSchemaKey: "transport.shipper_certification.v1",
      citation: "49 CFR 172.204(a)",
    });
    expect(resolution.unresolved).toEqual([
      { ruleKey: "transport.packaging_exception", reason: "no_rule_on_file" },
    ]);
  });
});
