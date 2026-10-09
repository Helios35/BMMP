import "server-only";

import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import { canReadRoute } from "@/domain/access/route-capability";
import { resolveUserNames } from "@/features/battery-record/user-names";
import type { AuditEvent } from "@/types/audit";
import type { TimeZone, Uuid } from "@/types/common";
import type {
  DocumentRender,
  Shipment,
  ShippingPaper,
} from "@/types/documents";
import type { Organization } from "@/types/tenancy";

import { activeOrganization, shipmentContainers } from "./paper-build";
import { readContainerScope, type ScopeContainer } from "./scope";

/**
 * The `/shipments/[id]` read — `UX_SPEC.md` §3.13: one shipment, its papers,
 * contents and history.
 *
 * **Every paper is kept and listed** — the current one and every one voided
 * or superseded before it, each still readable (Rules 5.14, 5.15). The
 * manifest obligation and the damaged records are read from the contents'
 * own rows, so the page states the gap whether or not a paper is issued
 * (E-14).
 */

const PAPER_LIMIT = 50;
const AUDIT_LIMIT = 100;

export interface ShipmentPaper {
  readonly paper: ShippingPaper;
  readonly render: DocumentRender | null;
}

export interface ShipmentDetail {
  readonly shipment: Shipment;
  readonly organization: Organization;
  readonly scope: readonly ScopeContainer[];
  /** Newest first. */
  readonly papers: readonly ShipmentPaper[];
  /** The newest paper, voided or not. */
  readonly current: ShipmentPaper | null;
  /** Every render for the shipment, newest first. */
  readonly renders: readonly DocumentRender[];
  /** Null for a role that does not read the audit log (Rule 12.8). */
  readonly auditEvents: readonly AuditEvent[] | null;
  readonly names: ReadonlyMap<Uuid, string>;
  /** D-36 — the fully-regulated records, by number. */
  readonly fullyRegulated: readonly string[];
  /** Records on the damaged, defective or recalled path. */
  readonly damaged: readonly string[];
  readonly timeZone: TimeZone;
}

export async function readShipment(
  ctx: RequestContext,
  shipment: Shipment,
): Promise<ShipmentDetail> {
  const canReadAudit = canReadRoute(ctx.role, "/audit");
  const [organization, containers, papersPage, rendersPage] = await Promise.all(
    [
      activeOrganization(ctx),
      shipmentContainers(ctx, shipment.id),
      data.shippingPapers.list(ctx, {
        shipmentId: shipment.id,
        limit: PAPER_LIMIT,
      }),
      data.documentRenders.list(ctx, {
        shipmentId: shipment.id,
        limit: PAPER_LIMIT,
      }),
    ],
  );
  const scope = await readContainerScope(ctx, containers);
  const renderById = new Map(
    rendersPage.items.map((render) => [render.id, render]),
  );
  const papers = papersPage.items.map((paper) => ({
    paper,
    render: renderById.get(paper.documentRenderId) ?? null,
  }));

  let auditEvents: AuditEvent[] | null = null;
  if (canReadAudit) {
    const subjects = [
      shipment.id,
      ...rendersPage.items.map((render) => render.id),
    ];
    const rows: AuditEvent[] = [];
    for (const entityId of subjects) {
      const page = await data.auditEvents.list(ctx, {
        entityId,
        limit: AUDIT_LIMIT,
      });
      rows.push(...page.items);
    }
    auditEvents = rows.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }

  const records = scope.flatMap((entry) => entry.records);
  const names = await resolveUserNames(ctx, [
    ...rendersPage.items.map((render) => render.renderedBy),
    ...(auditEvents ?? []).map((event) => event.actorUserId),
  ]);

  return {
    shipment,
    organization,
    scope,
    papers,
    current: papers[0] ?? null,
    renders: rendersPage.items,
    auditEvents,
    names,
    fullyRegulated: records
      .filter(
        ({ classification }) =>
          classification?.status === "active" &&
          classification.wasteClassification === "fully_regulated",
      )
      .map(({ record }) => record.recordNumber),
    damaged: records
      .filter(
        ({ record }) =>
          record.ddrFlags.length > 0 || record.isAirTransportProhibited,
      )
      .map(({ record }) => record.recordNumber),
    timeZone: containers[0]?.siteTimeZone ?? organization.timeZone,
  };
}
