import { beforeEach, describe, expect, it } from "vitest";

import { mockAdapter, mockStore, resetMockStore } from "@/data/mock";
import * as ID from "@/data/mock/fixtures/ids";
import { readStoredFilingPacket } from "@/domain/documents/stored-filing-packet";
import { mayOpenDocumentType } from "@/domain/access/document-access";
import { FILING_PACKET_TEMPLATE } from "@/features/documents/templates/filing-packet-template";
import { readObligationsPage } from "@/features/obligations/server/read-obligations";
import {
  issuePacketFor,
  readPacketPreview,
} from "@/features/obligations/server/packets";
import { PermissionError, ValidationError } from "@/lib/errors";

import { ctx, NO_ATTRIBUTION, pdfText, storedBytes } from "./document-support";

/**
 * Filings end to end on the mock — Rules 8.17–8.23; D-81.
 *
 * One sales dataset, corrected by replacing and keeping; a packet built from
 * it as cited rule data, its gaps printed, issued once and superseded by the
 * next; never marking a deadline done; linked as evidence only by Mark done.
 * "Now" is pinned: the seed is 2026-11-16 and dates move.
 */

const NOW = "2026-11-24T18:00:00.000Z";
const LATER = "2026-11-24T19:00:00.000Z";

const PRODUCER = ctx({
  userId: ID.USER.priyaProducer,
  role: "producer_compliance_officer",
});
const MANAGER = ctx({ userId: ID.USER.martaManager, role: "facility_manager" });
const AUDITOR = ctx({ userId: ID.USER.samAuditor, role: "auditor" });

beforeEach(() => {
  resetMockStore();
});

function auditOf(eventType: string) {
  return mockStore()
    .auditEvents.all()
    .filter(
      (row) =>
        row.eventType === eventType && row.organizationId === ID.ORG.cascade,
    );
}

function deadlineOf(state: string, key: string, dueOn?: string) {
  const obligation = mockStore()
    .producerObligations.all()
    .find(
      (row) =>
        row.isCurrent &&
        row.jurisdictionId === state &&
        row.obligationKey === key,
    );
  const deadline = mockStore()
    .obligationDeadlines.all()
    .find(
      (row) =>
        row.producerObligationId === obligation?.id &&
        (dueOn === undefined ? row.status === "open" : row.dueOn === dueOn),
    );
  if (deadline === undefined) throw new Error(`no deadline for ${key}`);
  return deadline;
}

describe("the sales dataset (Rule 8.17)", () => {
  it("records units for a product, state and year, with its audit row", async () => {
    const recorded = await mockAdapter.producerSales.record(PRODUCER, {
      producerProductId: ID.PRODUCER_PRODUCT.kestrelScrubberLfp,
      jurisdictionId: ID.JURISDICTION.connecticut,
      year: 2024,
      units: 70,
      basisNote: "Order ledger, calendar 2024.",
      at: NOW,
      attribution: NO_ATTRIBUTION,
    });
    expect(recorded.replaced).toBeNull();
    expect(recorded.record).toMatchObject({
      units: 70,
      year: 2024,
      supersededById: null,
    });
    expect(auditOf("producer_sales.recorded")).toHaveLength(1);
  });

  it("a correction replaces and keeps — the old entry stays, marked replaced", async () => {
    const page = await mockAdapter.producerSales.list(PRODUCER, {
      year: 2025,
      jurisdictionId: ID.JURISDICTION.washington,
      producerProductId: ID.PRODUCER_PRODUCT.tidewaterAlkalineAa,
      limit: 50,
    });
    const first = page.items[0];
    expect(first?.units).toBe(48_000);
    const corrected = await mockAdapter.producerSales.record(PRODUCER, {
      producerProductId: ID.PRODUCER_PRODUCT.tidewaterAlkalineAa,
      jurisdictionId: ID.JURISDICTION.washington,
      year: 2025,
      units: 48_250,
      basisNote: "Corrected: a late return was double-counted.",
      at: NOW,
      attribution: NO_ATTRIBUTION,
    });
    expect(corrected.replaced).toMatchObject({
      id: first?.id,
      units: 48_000,
      supersededById: corrected.record.id,
    });
    const all = await mockAdapter.producerSales.list(PRODUCER, {
      year: 2025,
      jurisdictionId: ID.JURISDICTION.washington,
      producerProductId: ID.PRODUCER_PRODUCT.tidewaterAlkalineAa,
      includeReplaced: true,
      limit: 50,
    });
    expect(all.items.map((row) => row.units).sort()).toEqual([48_000, 48_250]);
    const [event] = auditOf("producer_sales.corrected");
    expect(event?.beforeState).toMatchObject({ units: 48_000 });
    expect(event?.afterState).toMatchObject({
      units: 48_250,
      replacedEntryId: first?.id,
    });
  });

  it("keeps the seeded correction: Tidewater in Illinois, 2025", () => {
    const rows = mockStore()
      .producerSalesRecords.all()
      .filter(
        (row) =>
          row.producerProductId === ID.PRODUCER_PRODUCT.tidewaterAlkalineAa &&
          row.jurisdictionId === ID.JURISDICTION.illinois,
      );
    expect(rows.map((row) => [row.id, row.units, row.supersededById])).toEqual([
      [
        ID.PRODUCER_SALES.tidewaterIllinois2025,
        36_500,
        ID.PRODUCER_SALES.tidewaterIllinois2025Corrected,
      ],
      [ID.PRODUCER_SALES.tidewaterIllinois2025Corrected, 37_250, null],
    ]);
  });

  it("takes a whole number, zero allowed, for a full year in a state it is sold in", async () => {
    const base = {
      producerProductId: ID.PRODUCER_PRODUCT.kestrelScrubberLfp,
      jurisdictionId: ID.JURISDICTION.connecticut,
      year: 2024,
      basisNote: "note",
      at: NOW,
      attribution: NO_ATTRIBUTION,
    };
    await expect(
      mockAdapter.producerSales.record(PRODUCER, { ...base, units: 0 }),
    ).resolves.toBeDefined();
    await expect(
      mockAdapter.producerSales.record(PRODUCER, { ...base, units: -1 }),
    ).rejects.toThrow(ValidationError);
    await expect(
      mockAdapter.producerSales.record(PRODUCER, { ...base, units: 1.5 }),
    ).rejects.toThrow(ValidationError);
    // 2026 is still running in Cascade's zone on 24 Nov 2026.
    await expect(
      mockAdapter.producerSales.record(PRODUCER, {
        ...base,
        units: 3,
        year: 2026,
      }),
    ).rejects.toThrow(ValidationError);
    await expect(
      mockAdapter.producerSales.record(PRODUCER, {
        ...base,
        units: 3,
        jurisdictionId: ID.JURISDICTION.vermont,
      }),
    ).rejects.toThrow(ValidationError);
    await expect(
      mockAdapter.producerSales.record(PRODUCER, {
        ...base,
        units: 3,
        basisNote: "  ",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("is P3's and P6's: P2 and P5 read it and can't change it (Rule 8.22)", async () => {
    const input = {
      producerProductId: ID.PRODUCER_PRODUCT.kestrelScrubberLfp,
      jurisdictionId: ID.JURISDICTION.connecticut,
      year: 2024,
      units: 5,
      basisNote: "note",
      at: NOW,
      attribution: NO_ATTRIBUTION,
    };
    await expect(
      mockAdapter.producerSales.record(MANAGER, input),
    ).rejects.toThrow(PermissionError);
    await expect(
      mockAdapter.producerSales.record(AUDITOR, input),
    ).rejects.toThrow(PermissionError);
    await expect(
      mockAdapter.producerSales.list(AUDITOR, { year: 2025, limit: 50 }),
    ).resolves.toMatchObject({
      // Every declared pair for 2025, the Illinois correction counted once.
      total: 17,
    });
  });
});

describe("making a packet (Rules 8.19–8.21)", () => {
  it("previews every item as filled or a gap, and Maine's UPC reads Not on file", async () => {
    const maine = deadlineOf(ID.JURISDICTION.maine, "embedded_info");
    const preview = await readPacketPreview(PRODUCER, maine.id, NOW, null);
    expect(preview.kind).toBe("ready");
    if (preview.kind !== "ready") return;
    expect(preview.heading).toMatchObject({
      title: "Embedded battery information for your stewardship program",
      documentType: "filing_packet",
    });
    const products = preview.content.items.find(
      (item) => item.source === "products",
    );
    expect(products?.lines).toContainEqual({
      kind: "gap",
      what: "Halden HM-L58: GTIN",
      fixer: "An Admin can add the missing value to the catalog entry.",
    });
  });

  it("asks for a year where the law names none (NJ), and never picks one", async () => {
    const nj = deadlineOf(ID.JURISDICTION.newJersey, "ev_annual_report");
    const unpicked = await readPacketPreview(PRODUCER, nj.id, NOW, null);
    expect(unpicked).toMatchObject({
      kind: "needs_year",
      years: [2025, 2024, 2023, 2022, 2021],
    });
    await expect(
      issuePacketFor(PRODUCER, nj.id, NOW, null, NO_ATTRIBUTION),
    ).rejects.toThrow(ValidationError);
    const picked = await readPacketPreview(PRODUCER, nj.id, NOW, 2025);
    if (picked.kind !== "ready") throw new Error("expected a packet");
    expect(picked.content.period.words).toBe(
      "Calendar year 2025, picked by Priya Narang when making this packet. The law doesn't state a period.",
    );
    expect(
      picked.content.items.find((item) => item.source === "units")?.lines,
    ).toContainEqual({
      kind: "value",
      text: "Northvale NV-TP400, 2025: 14 units",
    });
    await expect(readPacketPreview(PRODUCER, nj.id, NOW, 2026)).rejects.toThrow(
      ValidationError,
    );
  });

  it("VT's three-year weight says one entry is missing", async () => {
    const vt = deadlineOf(ID.JURISDICTION.vermont, "annual_report");
    const preview = await readPacketPreview(PRODUCER, vt.id, NOW, null);
    if (preview.kind !== "ready") throw new Error("expected a packet");
    const weight = preview.content.items.find(
      (item) => item.source === "weight",
    );
    expect(weight?.lines.find((line) => line.kind === "total")).toMatchObject({
      kind: "total",
      missing: 1,
    });
  });

  it("issues a stored packet that says it is not the filing, and never marks the deadline done", async () => {
    const ca = deadlineOf(
      ID.JURISDICTION.california,
      "sb1215_notice",
      "2027-07-01",
    );
    const issued = await issuePacketFor(
      PRODUCER,
      ca.id,
      NOW,
      null,
      NO_ATTRIBUTION,
    );
    const render = issued.documentRender;
    expect(render).toMatchObject({
      documentType: "filing_packet",
      obligationDeadlineId: ca.id,
      status: "issued",
      templateKey: FILING_PACKET_TEMPLATE.templateKey,
      supersedesDocumentRenderId: null,
    });
    expect(
      mockStore()
        .obligationDeadlines.all()
        .find((row) => row.id === ca.id)?.status,
    ).toBe("open");
    const text = await pdfText(storedBytes(render.storageObjectPath));
    expect(text).toContain("A packet is not the filing.");
    expect(text).toContain(
      "Send it to: every retailer selling these products in California",
    );
    expect(text).toContain(
      "The covered battery-embedded products in this notice are subject to",
    );
    expect(
      auditOf("document_render.issued").map((row) => row.entityId),
    ).toContain(render.id);
  });

  it("prints a gap as Not on file on the packet itself", async () => {
    const maine = deadlineOf(ID.JURISDICTION.maine, "embedded_info");
    const issued = await issuePacketFor(
      PRODUCER,
      maine.id,
      NOW,
      null,
      NO_ATTRIBUTION,
    );
    const text = await pdfText(
      storedBytes(issued.documentRender.storageObjectPath),
    );
    expect(text).toContain("Not on file");
  });

  it("a new packet supersedes the last one when an input changes (Rules 5.15, 8.19)", async () => {
    const ca = deadlineOf(
      ID.JURISDICTION.california,
      "sb1215_notice",
      "2027-07-01",
    );
    const first = await issuePacketFor(
      PRODUCER,
      ca.id,
      NOW,
      null,
      NO_ATTRIBUTION,
    );
    await mockAdapter.producerSales.record(PRODUCER, {
      producerProductId: ID.PRODUCER_PRODUCT.haldenLaptop,
      jurisdictionId: ID.JURISDICTION.california,
      year: 2025,
      units: 2_410,
      basisNote: "Corrected.",
      at: NOW,
      attribution: NO_ATTRIBUTION,
    });
    const second = await issuePacketFor(
      PRODUCER,
      ca.id,
      LATER,
      null,
      NO_ATTRIBUTION,
    );
    expect(second.supersededDocumentRenderId).toBe(first.documentRender.id);
    expect(second.documentRender.supersedesDocumentRenderId).toBe(
      first.documentRender.id,
    );
    const old = mockStore()
      .documentRenders.all()
      .find((row) => row.id === first.documentRender.id);
    expect(old).toMatchObject({ status: "superseded", supersededAt: LATER });
    expect(
      auditOf("document_render.superseded").map((row) => row.entityId),
    ).toContain(first.documentRender.id);
  });

  it("is P3's and P6's alone (Rule 8.22)", async () => {
    const ca = deadlineOf(
      ID.JURISDICTION.california,
      "sb1215_notice",
      "2027-07-01",
    );
    await expect(readPacketPreview(MANAGER, ca.id, NOW, null)).rejects.toThrow(
      PermissionError,
    );
    await expect(
      issuePacketFor(AUDITOR, ca.id, NOW, null, NO_ATTRIBUTION),
    ).rejects.toThrow(PermissionError);
  });

  it("refuses a deadline whose obligation has no filing in the rule data", async () => {
    const wa = deadlineOf(ID.JURISDICTION.washington, "participate_portable");
    const preview = await readPacketPreview(PRODUCER, wa.id, NOW, null);
    expect(preview).toEqual({
      kind: "refused",
      words:
        "The rule data names no filing for this obligation, so there is no packet to make.",
    });
  });
});

describe("evidence on Mark done (Rule 8.19)", () => {
  it("links an issued packet of the deadline, and reopening unlinks it", async () => {
    const ct = deadlineOf(ID.JURISDICTION.connecticut, "notify_deep");
    const issued = await issuePacketFor(
      PRODUCER,
      ct.id,
      NOW,
      null,
      NO_ATTRIBUTION,
    );
    const done = await mockAdapter.obligationDeadlines.complete(
      PRODUCER,
      ct.id,
      {
        completedOn: "2026-11-24",
        note: "Sent DEEP the notice.",
        reference: null,
        evidenceDocumentRenderId: issued.documentRender.id,
        at: NOW,
        attribution: NO_ATTRIBUTION,
      },
    );
    expect(done.evidenceDocumentRenderId).toBe(issued.documentRender.id);
    const reopened = await mockAdapter.obligationDeadlines.reopen(
      PRODUCER,
      ct.id,
      {
        reason: "Sent the wrong form.",
        at: LATER,
        attribution: NO_ATTRIBUTION,
      },
    );
    expect(reopened.evidenceDocumentRenderId).toBeNull();
  });

  it("refuses another deadline's packet, or a superseded one", async () => {
    const ct = deadlineOf(ID.JURISDICTION.connecticut, "notify_deep");
    const maine = deadlineOf(ID.JURISDICTION.maine, "embedded_info");
    const maines = await issuePacketFor(
      PRODUCER,
      maine.id,
      NOW,
      null,
      NO_ATTRIBUTION,
    );
    await expect(
      mockAdapter.obligationDeadlines.complete(PRODUCER, ct.id, {
        completedOn: "2026-11-24",
        note: "x",
        reference: null,
        evidenceDocumentRenderId: maines.documentRender.id,
        at: NOW,
        attribution: NO_ATTRIBUTION,
      }),
    ).rejects.toThrow(ValidationError);
    const first = await issuePacketFor(
      PRODUCER,
      ct.id,
      NOW,
      null,
      NO_ATTRIBUTION,
    );
    await issuePacketFor(PRODUCER, ct.id, LATER, null, NO_ATTRIBUTION);
    await expect(
      mockAdapter.obligationDeadlines.complete(PRODUCER, ct.id, {
        completedOn: "2026-11-24",
        note: "x",
        reference: null,
        evidenceDocumentRenderId: first.documentRender.id,
        at: NOW,
        attribution: NO_ATTRIBUTION,
      }),
    ).rejects.toThrow(ValidationError);
  });
});

describe("California's seeded notice (spec §6)", () => {
  it("was issued for the 2026-07-01 deadline and is that deadline's evidence", () => {
    const deadline = deadlineOf(
      ID.JURISDICTION.california,
      "sb1215_notice",
      "2026-07-01",
    );
    expect(deadline).toMatchObject({
      status: "completed",
      completedOn: "2026-06-25",
      completedBy: ID.USER.priyaProducer,
      evidenceDocumentRenderId: ID.DOCUMENT_RENDER.caNoticePacket,
    });
    const render = mockStore()
      .documentRenders.all()
      .find((row) => row.id === ID.DOCUMENT_RENDER.caNoticePacket);
    expect(render).toMatchObject({
      documentType: "filing_packet",
      obligationDeadlineId: deadline.id,
      renderedAt: "2026-06-20T17:30:00.000Z",
      renderedBy: ID.USER.priyaProducer,
      templateKey: FILING_PACKET_TEMPLATE.templateKey,
      templateVersion: FILING_PACKET_TEMPLATE.templateVersion,
    });
    const stored =
      render === undefined
        ? null
        : readStoredFilingPacket(render.inputSnapshot);
    expect(stored?.title).toBe("Notice to retailers and CalRecycle");
    expect(
      stored?.items.find((item) => item.source === "products_outside")?.lines,
    ).toEqual([{ kind: "value", text: "None" }]);
    expect(
      mockStore()
        .alerts.all()
        .filter(
          (alert) =>
            alert.obligationDeadlineId === deadline.id &&
            alert.resolvedAt === null,
        ),
    ).toEqual([]);
  });

  it("lists under its deadline on the page, with the filing that Make packet would use", async () => {
    const page = await readObligationsPage(PRODUCER, NOW);
    const deadline = deadlineOf(
      ID.JURISDICTION.california,
      "sb1215_notice",
      "2026-07-01",
    );
    expect(page.packets.get(deadline.id)?.map((link) => link.id)).toEqual([
      ID.DOCUMENT_RENDER.caNoticePacket,
    ]);
    expect(page.filings.get(deadline.producerObligationId)).toEqual({
      title: "Notice to retailers and CalRecycle",
      typeLabel: "Filing packet",
    });
  });
});

describe("who opens a packet (Rule 8.22)", () => {
  it("P2, P3, P5 and P6 open one; P1 and P4 can't", () => {
    expect(mayOpenDocumentType("facility_manager", "filing_packet")).toBe(true);
    expect(
      mayOpenDocumentType("producer_compliance_officer", "annual_report"),
    ).toBe(true);
    expect(mayOpenDocumentType("auditor", "filing_packet")).toBe(true);
    expect(mayOpenDocumentType("platform_admin", "annual_report")).toBe(true);
    expect(mayOpenDocumentType("compliance_handler", "filing_packet")).toBe(
      false,
    );
    expect(
      mayOpenDocumentType("mobility_supplier_technician", "annual_report"),
    ).toBe(false);
    expect(mayOpenDocumentType("compliance_handler", "shipping_paper")).toBe(
      true,
    );
  });
});
