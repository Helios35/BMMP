import Link from "next/link";
import type { ReactElement } from "react";

import { StatusBadge } from "@/components/status/status-badge";
import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import { canReadRoute } from "@/domain/access/route-capability";
import { DOCUMENT_TYPE_LABELS } from "@/domain/taxonomy/document-type";
import { labelFor } from "@/domain/taxonomy/lookup";
import type { RoleCode } from "@/domain/taxonomy/role";
import type { BatteryRecord } from "@/types/battery-record";
import type { TimeZone, Uuid } from "@/types/common";
import type { DocumentRender } from "@/types/documents";
import { absoluteInstant } from "./format-instant";
import { DetailCard, NotRecorded } from "./record-display";
import { resolveUserNames } from "./user-names";

/**
 * `/batteries/[id]` — Documents. `UX_SPEC.md` §3.7.
 *
 * **Every `document_render` touching this record**, which is more than the ones
 * that name it: a container label carries this record's accumulation start date,
 * so it touches the record. Both sets are read, merged by id and ordered newest
 * first.
 *
 * **Voided and superseded renders appear here, marked, and are never filtered
 * out** (Rules 5.14, 5.15). A document that was withdrawn is the one an auditor
 * most wants to find; a list that quietly hides it is worse than no list.
 *
 * Each row links to `/documents/[id]`, which unit 04 builds. The link is
 * rendered now, gated on `ROUTE_ACCESS` like every other cross-route link
 * (§5.3(7)) — **print and download are never disabled for any role, including
 * the auditor** (Rule 5.27).
 */

const NO_DOCUMENTS = "No documents have been generated for this record yet.";

export async function DocumentsTab({
  ctx,
  record,
  timeZone,
}: {
  readonly ctx: RequestContext;
  readonly record: BatteryRecord;
  readonly timeZone: TimeZone;
}): Promise<ReactElement> {
  const [direct, viaContainer] = await Promise.all([
    data.documentRenders.list(ctx, {
      batteryRecordId: record.id,
      limit: 50,
    }),
    record.containerId === null
      ? Promise.resolve({ items: [], total: 0, cursor: null } as const)
      : data.documentRenders.list(ctx, {
          containerId: record.containerId,
          limit: 50,
        }),
  ]);

  const byId = new Map<Uuid, DocumentRender>();
  for (const render of [...direct.items, ...viaContainer.items]) {
    byId.set(render.id, render);
  }
  const renders = [...byId.values()].sort((a, b) =>
    b.renderedAt.localeCompare(a.renderedAt),
  );

  if (renders.length === 0) {
    return (
      <DetailCard title="Documents">
        {/* No action: document generation is not in this unit, and an action
            that cannot be taken is worse than none. */}
        <p role="status" className="max-w-[72ch] text-body">
          {NO_DOCUMENTS}
        </p>
      </DetailCard>
    );
  }

  const names = await resolveUserNames(
    ctx,
    renders.map((render) => render.renderedBy),
  );

  return (
    <DetailCard title="Documents">
      <ul className="grid gap-3">
        {renders.map((render) => (
          <DocumentRow
            key={render.id}
            render={render}
            renderedByName={names.get(render.renderedBy)}
            role={ctx.role}
            timeZone={timeZone}
          />
        ))}
      </ul>
    </DetailCard>
  );
}

function DocumentRow({
  render,
  renderedByName,
  role,
  timeZone,
}: {
  readonly render: DocumentRender;
  readonly renderedByName: string | undefined;
  readonly role: RoleCode;
  readonly timeZone: TimeZone;
}) {
  const typeLabel = labelFor(DOCUMENT_TYPE_LABELS, render.documentType);
  const canOpen = canReadRoute(role, "/documents/[id]");

  return (
    <li
      data-document-render={render.id}
      data-document-status={render.status}
      className="flex flex-col gap-2 rounded-lg border border-border p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        {canOpen ? (
          <Link
            href={`/documents/${render.id}`}
            data-document-link="true"
            className="rounded-md text-body-strong underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
          >
            {typeLabel}
          </Link>
        ) : (
          <span className="text-body-strong">{typeLabel}</span>
        )}
        <StatusBadge
          system="document_render_status"
          value={render.status}
          size="sm"
        />
      </div>

      <dl className="grid gap-1 text-body sm:grid-cols-[minmax(10rem,auto)_1fr]">
        <div className="contents">
          <dt className="text-label">Rendered</dt>
          <dd>{absoluteInstant(render.renderedAt, timeZone)}</dd>
        </div>
        <div className="contents">
          <dt className="text-label">Rendered by</dt>
          <dd>{renderedByName ?? <NotRecorded />}</dd>
        </div>
        <div className="contents">
          <dt className="text-label">Verification code</dt>
          <dd className="text-mono break-all">{render.verificationCode}</dd>
        </div>
        {render.supersededAt === null ? null : (
          <div className="contents">
            <dt className="text-label">Superseded</dt>
            <dd>{absoluteInstant(render.supersededAt, timeZone)}</dd>
          </div>
        )}
      </dl>
    </li>
  );
}
