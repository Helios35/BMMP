import type { RequestContext } from "@/data/contracts/context";
import type {
  FilingPacketIssue,
  FilingPacketRepository,
  FilingPacketSource,
  IssuedFilingPacket,
  ProducerSalesQuery,
  ProducerSalesRecorded,
  ProducerSalesRepository,
  RecordProducerSales,
} from "@/data/contracts/producer";
import type { Page } from "@/data/contracts/repository";
import {
  mayTakeProducerAction,
  rolesForProducerAction,
  type ProducerAction,
} from "@/domain/access/producer-actions";
import {
  FILINGS_RULE_KEY,
  isFilingDocumentType,
  latestFullCalendarYear,
} from "@/domain/producer";
import { civilDateInZone } from "@/domain/storage/clock-display";
import { ROLE_LABELS } from "@/domain/taxonomy/role";
import { ConflictError, PermissionError, ValidationError } from "@/lib/errors";
import type { IsoTimestamp, JsonObject, Uuid } from "@/types/common";
import type { DocumentRender } from "@/types/documents";
import type { ProducerSalesRecord } from "@/types/producer";

import { writeTriggerAudit as audit } from "./audit-row";
import { renderingAtomically, writeRender } from "./document-writes";
import { now } from "./factory";
import { nextId } from "./ids";
import { activeProducts } from "./producer-inputs";
import { ruleVersionCandidate } from "./rule-candidate";
import { mockStore } from "./store";

/**
 * The sales dataset and filing packets, read and written —
 * `ProducerSalesRepository`, `FilingPacketRepository`; Rules 8.17–8.22; T-43;
 * D-81.
 *
 * **Nothing here decides what a packet says.** The domain built it; this
 * re-checks that what it was built from is still true — the deadline still
 * open to a packet, its obligation still applying, the sales it read still
 * the current ones — and then issues it through `writeRender`, the one door,
 * superseding the deadline's previous packet in the same operation (Rules
 * 5.12, 5.15). **A packet never marks a deadline done.** Every entry and
 * every packet writes an `audit_event`; a denial is the Server Action's,
 * through the guard (Rule 8.22).
 */

const store = () => mockStore();

function refuse(ctx: RequestContext, action: ProducerAction): never {
  const who = rolesForProducerAction(action)
    .map((role) => ROLE_LABELS[role])
    .join(" or ");
  throw new PermissionError({
    userMessage: `Your role cannot record sales or make filing packets. ${who} can.`,
    correlationId: ctx.correlationId,
    context: { action, role: ctx.role, rule: "8.22" },
  });
}

function guard(ctx: RequestContext, action: ProducerAction): void {
  if (!mayTakeProducerAction(ctx.role, action)) refuse(ctx, action);
}

function invalid(ctx: RequestContext, message: string, field?: string): never {
  throw new ValidationError({
    userMessage: message,
    correlationId: ctx.correlationId,
    ...(field === undefined ? {} : { field }),
    context: { rule: "8.17" },
  });
}

function organizationOf(ctx: RequestContext) {
  return store()
    .organizations.all()
    .find((row) => row.id === ctx.organizationId);
}

function organizationToday(ctx: RequestContext, at: IsoTimestamp): string {
  return civilDateInZone(at, organizationOf(ctx)?.timeZone ?? "UTC");
}

// --- producer_sales_record ------------------------------------------------------------------

function salesSnapshot(row: ProducerSalesRecord): JsonObject {
  return {
    entryId: row.id,
    producerProductId: row.producerProductId,
    jurisdictionId: row.jurisdictionId,
    year: row.year,
    units: row.units,
    basisNote: row.basisNote,
  };
}

function currentEntry(
  ctx: RequestContext,
  productId: Uuid,
  jurisdictionId: Uuid,
  year: number,
): ProducerSalesRecord | undefined {
  return store()
    .producerSalesRecords.all()
    .find(
      (row) =>
        row.organizationId === ctx.organizationId &&
        row.producerProductId === productId &&
        row.jurisdictionId === jurisdictionId &&
        row.year === year &&
        row.supersededById === null,
    );
}

async function salesAtomically<T>(write: () => Promise<T>): Promise<T> {
  const s = store();
  const saved = {
    sales: [...s.producerSalesRecords.all()],
    audit: [...s.auditEvents.all()],
  };
  try {
    return await write();
  } catch (cause) {
    s.producerSalesRecords.replaceAll(saved.sales);
    s.auditEvents.replaceAll(saved.audit);
    throw cause;
  }
}

export const mockProducerSales: ProducerSalesRepository = {
  async list(
    ctx,
    query: ProducerSalesQuery,
  ): Promise<Page<ProducerSalesRecord>> {
    return store().producerSalesRecords.list(
      ctx,
      query,
      (row) =>
        (query.includeReplaced === true || row.supersededById === null) &&
        (query.year === undefined || row.year === query.year) &&
        (query.producerProductId === undefined ||
          row.producerProductId === query.producerProductId) &&
        (query.jurisdictionId === undefined ||
          row.jurisdictionId === query.jurisdictionId),
      (a, b) =>
        a.year - b.year ||
        a.producerProductId.localeCompare(b.producerProductId) ||
        a.jurisdictionId.localeCompare(b.jurisdictionId) ||
        a.recordedAt.localeCompare(b.recordedAt),
    );
  },

  async record(
    ctx,
    input: RecordProducerSales,
  ): Promise<ProducerSalesRecorded> {
    guard(ctx, "record_sales");
    if (!Number.isInteger(input.units) || input.units < 0) {
      invalid(ctx, "Units are a whole number, zero or more.", "units");
    }
    const latest = latestFullCalendarYear(organizationToday(ctx, input.at));
    if (!Number.isInteger(input.year) || input.year > latest) {
      invalid(
        ctx,
        `Sales are recorded for a full calendar year — ${String(latest)} or earlier.`,
        "year",
      );
    }
    const basisNote = input.basisNote.trim();
    if (basisNote === "") {
      invalid(
        ctx,
        "Say where the number came from — the note is required.",
        "basisNote",
      );
    }
    const s = store();
    const product = await s.producerProducts.getOrThrow(
      ctx,
      input.producerProductId,
    );
    if (product.removedAt !== null) {
      invalid(
        ctx,
        "That product was removed. Add it again to record its sales.",
      );
    }
    if (!product.jurisdictionIds.includes(input.jurisdictionId)) {
      invalid(
        ctx,
        "That product isn't declared as sold in that state. Edit its states first.",
        "jurisdictionId",
      );
    }
    const replaced =
      currentEntry(ctx, product.id, input.jurisdictionId, input.year) ?? null;

    return salesAtomically(async () => {
      const row: ProducerSalesRecord = {
        id: nextId(),
        organizationId: ctx.organizationId,
        producerProductId: product.id,
        jurisdictionId: input.jurisdictionId,
        year: input.year,
        units: input.units,
        basisNote,
        recordedAt: input.at,
        recordedBy: ctx.userId,
        supersededById: null,
        supersededAt: null,
        createdAt: now(),
      };
      const record = await s.producerSalesRecords.insert(ctx, row);
      if (replaced === null) {
        await audit(ctx, input.at, input.attribution, {
          eventType: "producer_sales.recorded",
          entityTable: "producer_sales_record",
          entityId: record.id,
          beforeState: null,
          afterState: salesSnapshot(record),
          changedFields: ["units", "basisNote"],
        });
        return { record, replaced: null };
      }
      // The supersede trigger's one update on the old entry: kept, marked
      // replaced, pointing at its correction (Rule 8.17; TECH §9.5).
      const old = await s.producerSalesRecords.updateAsDefiner(
        ctx,
        replaced.id,
        {
          supersededById: record.id,
          supersededAt: input.at,
        },
      );
      await audit(ctx, input.at, input.attribution, {
        eventType: "producer_sales.corrected",
        entityTable: "producer_sales_record",
        entityId: record.id,
        beforeState: salesSnapshot(replaced),
        afterState: { ...salesSnapshot(record), replacedEntryId: replaced.id },
        changedFields: ["units", "basisNote"],
      });
      return { record, replaced: old };
    });
  },
};

// --- filing packets -------------------------------------------------------------------------

function deadlinePackets(
  ctx: RequestContext,
  deadlineId: Uuid,
): readonly DocumentRender[] {
  return store()
    .documentRenders.all()
    .filter(
      (row) =>
        row.organizationId === ctx.organizationId &&
        row.obligationDeadlineId === deadlineId,
    )
    .sort((a, b) => b.renderedAt.localeCompare(a.renderedAt));
}

async function readSource(
  ctx: RequestContext,
  deadlineId: Uuid,
): Promise<FilingPacketSource> {
  const s = store();
  const deadline = await s.obligationDeadlines.getOrThrow(ctx, deadlineId);
  const obligation = await s.producerObligations.getOrThrow(
    ctx,
    deadline.producerObligationId,
  );
  const jurisdiction = s.jurisdictions
    .all()
    .find((row) => row.id === obligation.jurisdictionId);
  const organization = organizationOf(ctx);
  const user = s.users.all().find((row) => row.id === ctx.userId);
  if (
    jurisdiction === undefined ||
    organization === undefined ||
    user === undefined
  ) {
    throw new ConflictError({
      userMessage: "This deadline's state or organization is not on file.",
      correlationId: ctx.correlationId,
      context: { deadlineId },
    });
  }
  const filingRules = new Map(
    s.jurisdictionRules
      .all()
      .filter(
        (rule) =>
          rule.ruleKey === FILINGS_RULE_KEY &&
          rule.jurisdictionId === jurisdiction.id,
      )
      .map((rule) => [rule.id, rule]),
  );
  const entries = new Map(s.catalogEntries.all().map((row) => [row.id, row]));
  return {
    timeZone: organization.timeZone,
    deadline,
    obligation,
    state: {
      jurisdictionId: jurisdiction.id,
      code: jurisdiction.code,
      name: jurisdiction.name,
    },
    filingCandidates: s.ruleVersions.all().flatMap((version) => {
      const rule = filingRules.get(version.jurisdictionRuleId);
      return rule === undefined ? [] : [ruleVersionCandidate(rule, version)];
    }),
    organization: {
      id: organization.id,
      name: organization.name,
      legalName: organization.legalName,
      primaryAddress: organization.primaryAddress,
      mailingAddress: organization.mailingAddress,
    },
    contact: { userId: user.id, name: user.fullName, email: user.email },
    products: activeProducts(
      { producerProducts: s.producerProducts.all() },
      ctx.organizationId,
    )
      .filter((product) => product.jurisdictionIds.includes(jurisdiction.id))
      .flatMap((product) => {
        const entry = entries.get(product.catalogEntryId);
        return entry === undefined ? [] : [{ product, entry }];
      }),
    sales: s.producerSalesRecords
      .all()
      .filter(
        (row) =>
          row.organizationId === ctx.organizationId &&
          row.jurisdictionId === jurisdiction.id &&
          row.supersededById === null,
      ),
    packets: deadlinePackets(ctx, deadline.id),
  };
}

function changed(
  ctx: RequestContext,
  message: string,
  context: JsonObject,
): never {
  throw new ConflictError({
    userMessage: message,
    correlationId: ctx.correlationId,
    context: { rule: "8.19", ...context },
  });
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedB = [...b].sort();
  return [...a].sort().every((id, index) => id === sortedB[index]);
}

export const mockFilingPackets: FilingPacketRepository = {
  async source(ctx, deadlineId) {
    guard(ctx, "make_packets");
    // A read like any other: latency, seeded failure and tenant scope apply
    // through the table it is anchored on.
    await store().obligationDeadlines.list(ctx, { limit: 1 }, () => false);
    return readSource(ctx, deadlineId);
  },

  async issue(ctx, input: FilingPacketIssue): Promise<IssuedFilingPacket> {
    guard(ctx, "make_packets");
    const source = await readSource(ctx, input.deadlineId);
    const { deadline, obligation } = source;
    const packet = input.packet.result;

    if (deadline.status === "withdrawn") {
      changed(
        ctx,
        "This deadline was withdrawn — its obligation no longer applies, so it has no packet.",
        { deadlineId: deadline.id, status: deadline.status },
      );
    }
    if (!obligation.isCurrent || obligation.status !== "applies") {
      changed(
        ctx,
        "This obligation no longer reads Applies, so no packet was issued. Open the States tab to see why.",
        { obligationId: obligation.id, status: obligation.status },
      );
    }
    if (
      packet.deadline.id !== deadline.id ||
      packet.obligation.id !== obligation.id ||
      !isFilingDocumentType(packet.documentType)
    ) {
      changed(
        ctx,
        "The deadline changed while the packet was being prepared. Nothing was issued — make it again.",
        { deadlineId: deadline.id },
      );
    }
    // The sales it read are still the current ones for its period — a
    // correction in between makes a different packet (Rule 8.19).
    const years: readonly number[] = packet.period.years;
    const current = source.sales
      .filter((row) => years.includes(row.year))
      .map((row) => row.id);
    if (!sameIds(current, packet.inputs.salesEntryIds)) {
      changed(
        ctx,
        "The sales changed while the packet was being prepared. Nothing was issued — make it again.",
        { deadlineId: deadline.id },
      );
    }

    const previous = source.packets.find(
      (row) =>
        row.status === "issued" && row.documentType === packet.documentType,
    );
    const s = store();
    return renderingAtomically(
      ctx,
      input.at,
      input.attribution,
      {
        documentType: packet.documentType,
        subject: { entityTable: "obligation_deadline", entityId: deadline.id },
        inputs: {
          obligationKey: packet.obligation.key,
          period: [...years],
          salesEntryIds: [...packet.inputs.salesEntryIds],
        },
      },
      async () => {
        const render = await writeRender(ctx, {
          compose: input.compose,
          status: "issued",
          at: input.at,
          documentType: packet.documentType,
          subject: { obligationDeadlineId: deadline.id },
          supersedesDocumentRenderId: previous?.id ?? null,
        });
        let supersededDocumentRenderId: Uuid | null = null;
        if (previous !== undefined) {
          // Rule 5.15 — the trigger's one update on the old render: kept in
          // full, readable, marked, and pointed at by its replacement.
          await s.documentRenders.updateAsDefiner(ctx, previous.id, {
            status: "superseded",
            supersededAt: input.at,
          });
          supersededDocumentRenderId = previous.id;
          await audit(ctx, input.at, input.attribution, {
            eventType: "document_render.superseded",
            entityTable: "document_render",
            entityId: previous.id,
            beforeState: { status: previous.status },
            afterState: {
              status: "superseded",
              supersededByDocumentRenderId: render.id,
              obligationDeadlineId: deadline.id,
            },
            changedFields: ["status", "supersededAt"],
          });
        }
        await audit(ctx, input.at, input.attribution, {
          eventType: "document_render.issued",
          entityTable: "document_render",
          entityId: render.id,
          beforeState: null,
          afterState: {
            documentType: render.documentType,
            obligationDeadlineId: deadline.id,
            obligationKey: packet.obligation.key,
            period: [...years],
            gapsNotOnFile: packet.gaps.notOnFile,
            contentHash: render.contentHash,
            verificationCode: render.verificationCode,
            supersedesDocumentRenderId: render.supersedesDocumentRenderId,
          },
          governingRuleVersionId:
            render.ruleVersionsApplied[0]?.ruleVersionId ?? null,
          ruleVersionsApplied: render.ruleVersionsApplied,
        });
        return { documentRender: render, supersededDocumentRenderId };
      },
    );
  },
};

/** A deadline's issued packet, if `id` is one — the only evidence Mark done accepts (Rule 8.19). */
export function issuedPacketOf(
  ctx: RequestContext,
  deadlineId: Uuid,
  id: Uuid,
): DocumentRender | null {
  return (
    deadlinePackets(ctx, deadlineId).find(
      (row) =>
        row.id === id &&
        row.status === "issued" &&
        isFilingDocumentType(row.documentType),
    ) ?? null
  );
}
