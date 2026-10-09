import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";

import {
  ACTION_BUTTON_CLASS,
  EmptyState,
  PageHeader,
  PageShell,
  RouteTabs,
  SectionCard,
} from "@/components/page";
import { decodeListQuery } from "@/components/record-table/list-url";
import { INTENT_SURFACE_CLASSES } from "@/components/status/intent-classes";
import { StatusBadge } from "@/components/status/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import {
  controlTreatment,
  controlTreatmentReason,
  showsReadOnlyBanner,
} from "@/domain/access/control-treatment";
import {
  canReadRoute,
  canWriteRoute,
  capabilityFor,
} from "@/domain/access/route-capability";
import { APP_ROUTE_NAMES } from "@/domain/access/routes";
import {
  AUDIT_EVENT_TYPES,
  AUDIT_EVENT_TYPE_LABELS,
} from "@/domain/taxonomy/audit-event-type";
import { CHEMISTRIES, CHEMISTRY_LABELS } from "@/domain/taxonomy/chemistry";
import { CONTAINER_TYPE_LABELS } from "@/domain/taxonomy/container-type";
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
} from "@/domain/taxonomy/document-type";
import { readTaxonomyValue } from "@/domain/taxonomy/lookup";
import { TRANSPORT_MODE_LABELS } from "@/domain/taxonomy/transport-mode";
import { ReadOnlyBanner } from "@/components/access/read-only-banner";
import { absoluteInstant } from "@/features/battery-record/format-instant";
import { CopyButton } from "@/features/battery-record/copy-button";
import { DocumentPanel } from "@/features/documents/document-page";
import { readDocument } from "@/features/documents/server/read-document";
import { ShipmentActions } from "@/features/shipments/components/shipment-actions";
import {
  activeShipmentTab,
  SHIPMENT_TABS,
  SHIPMENT_TAB_SPEC,
} from "@/features/shipments/shipment-tabs";
import {
  BLOCKED_AIR_ATTEMPT,
  CONTENTS_CONTAINERS,
  CONTENTS_RECORDS,
  ddrBody,
  DDR_TITLE,
  HISTORY_AUDIT,
  HISTORY_AUDIT_ROLES,
  HISTORY_RENDERS,
  manifestBody,
  MANIFEST_TITLE,
  NO_AUDIT_ROWS,
  NO_PAPER_BODY,
  NO_PAPER_TITLE,
  NO_RENDERS,
  OPEN_DOCUMENT,
  PAPER_VOIDED_BODY,
  PAPER_VOIDED_TITLE,
  PRIOR_PAPERS,
  RETENTION_LABEL,
  RETENTION_PENDING,
  REVIEW_CHECKLIST,
} from "@/features/shipments/shipment-copy";
import {
  readShipment,
  type ShipmentDetail,
} from "@/features/shipments/server/read-shipment";
import { Breadcrumbs } from "@/features/shell/chrome/breadcrumbs";
import { breadcrumbTrail } from "@/features/shell/navigation/breadcrumb-ancestors";
import { requireRoute } from "@/lib/auth/guard";
import { recordNotFound } from "@/lib/auth/record-denial";
import { resolveRequestContext } from "@/lib/auth/session";
import { cn } from "@/lib/utils";
import { FileText } from "lucide-react";

/**
 * `/shipments/[id]` — `UX_SPEC.md` §3.13. One shipment with its shipping
 * paper, contents and history. All six roles read it; P1 and P6 build,
 * depart and arrive it.
 *
 * **Every paper it ever had stays readable** — a voided one is kept, marked,
 * beside the one that replaced it (Rules 5.14, 5.15). **Departure stops the
 * clocks of what left** (Rules 4.7, 5.17), and the page cannot record a
 * departure without a current issued paper — the server refuses it with the
 * reason. A fully-regulated record keeps the manifest gap stated and the
 * shipment is never shown as fully documented (E-14; D-36).
 */

export async function generateMetadata({
  params,
}: PageProps<"/shipments/[id]">): Promise<Metadata> {
  const fallback: Metadata = { title: APP_ROUTE_NAMES["/shipments/[id]"] };
  // The session, not the guard: the page's own guard is the access decision,
  // and a second one would write a second denial for one attempt (Rule 12.6).
  const resolution = await resolveRequestContext();
  if (resolution.kind !== "resolved") return fallback;
  const { id } = await params;
  const shipment = await data.shipments.get(resolution.session.ctx, id);
  return shipment === null ? fallback : { title: shipment.shipmentNumber };
}

export default async function ShipmentPage({
  params,
  searchParams,
}: PageProps<"/shipments/[id]">) {
  const { ctx } = await requireRoute("/shipments/[id]");
  const { id } = await params;
  const shipment = await data.shipments.get(ctx, id);
  if (shipment === null) {
    // Absent and another tenant's read the same, and the attempt is recorded
    // (Rules 1.2, 1.16).
    await recordNotFound(ctx, "shipment", id);
    notFound();
  }

  const query = decodeListQuery(await searchParams, SHIPMENT_TAB_SPEC);
  const tab = activeShipmentTab(query);
  const detail = await readShipment(ctx, shipment);
  const { current } = detail;
  const manifestOutstanding = detail.fullyRegulated.length > 0;
  const paperVoided = current?.render?.status === "voided";

  const canWrite = canWriteRoute(ctx.role, "/shipments/[id]");
  const treatment = controlTreatment({
    role: ctx.role,
    capability: capabilityFor(ctx.role, "/shipments/[id]"),
    isDestructive: false,
    isExportOrPrint: false,
  });
  const open = ["draft", "ready", "documents_issued"].includes(shipment.status);

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            crumbs={breadcrumbTrail(
              "/shipments/[id]",
              ctx.role,
              shipment.shipmentNumber,
            )}
          />
        }
        title={
          <span className="font-mono tabular-nums">
            {shipment.shipmentNumber}
          </span>
        }
        titleAdornment={
          <CopyButton value={shipment.shipmentNumber} label="shipment number" />
        }
        subtitle={`${shipment.destinationFacilityName} · ${TRANSPORT_MODE_LABELS[shipment.transportMode]}`}
        meta={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge
              system="shipment_status"
              value={shipment.status}
              {...(manifestOutstanding ? { escalateTo: "attention" } : {})}
            />
            <StatusBadge
              system="transport_mode"
              value={shipment.transportMode}
            />
            {detail.damaged.length > 0 ? (
              <StatusBadge system="ddr_flag" value="damaged" />
            ) : null}
          </span>
        }
        notice={
          <div className="flex flex-col gap-3">
            {showsReadOnlyBanner({
              role: ctx.role,
              routeHasMutatingControls: true,
            }) ? (
              <ReadOnlyBanner />
            ) : null}
            {manifestOutstanding ? (
              <Alert
                role="alert"
                data-manifest-obligation="true"
                className={cn(
                  INTENT_SURFACE_CLASSES.attention,
                  "gap-2 px-4 py-4",
                )}
              >
                <AlertTitle className="text-body-strong">
                  {MANIFEST_TITLE}
                </AlertTitle>
                <AlertDescription className="text-body text-current">
                  {manifestBody(detail.fullyRegulated)}
                </AlertDescription>
              </Alert>
            ) : null}
            {detail.damaged.length > 0 && open ? (
              <Alert
                role="alert"
                data-ddr-on-shipment="true"
                className={cn(
                  INTENT_SURFACE_CLASSES.critical,
                  "gap-2 px-4 py-4",
                )}
              >
                <AlertTitle className="text-body-strong">
                  {DDR_TITLE}
                </AlertTitle>
                <AlertDescription className="text-body text-current">
                  {ddrBody(detail.damaged)}
                </AlertDescription>
              </Alert>
            ) : null}
            {paperVoided && open ? (
              <Alert
                role="alert"
                data-paper-voided="true"
                className={cn(
                  INTENT_SURFACE_CLASSES.attention,
                  "gap-2 px-4 py-4",
                )}
              >
                <AlertTitle className="text-body-strong">
                  {PAPER_VOIDED_TITLE}
                </AlertTitle>
                <AlertDescription className="text-body text-current">
                  {PAPER_VOIDED_BODY}
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
        }
      />

      <ShipmentActions
        shipmentId={shipment.id}
        readOnlyReason={controlTreatmentReason(treatment)}
        can={{
          continueBuilding:
            canWrite &&
            (shipment.status === "draft" || shipment.status === "ready"),
          changeContents: canWrite && open,
          depart: canWrite && shipment.status === "documents_issued",
          arrive: canWrite && shipment.status === "dispatched",
          voidPaper:
            canWrite &&
            shipment.status === "documents_issued" &&
            current?.render?.status === "issued",
        }}
      />

      <ShipmentFacts detail={detail} />

      <RouteTabs
        tabs={SHIPMENT_TABS}
        basePath={`/shipments/${shipment.id}`}
        query={query}
        spec={SHIPMENT_TAB_SPEC}
        active={tab}
        label="Shipment sections"
        dataAttribute="data-shipment-tab"
      />

      {tab === "paper" ? <PaperTab ctx={ctx} detail={detail} /> : null}
      {tab === "contents" ? <ContentsTab ctx={ctx} detail={detail} /> : null}
      {tab === "history" ? <HistoryTab detail={detail} /> : null}
    </PageShell>
  );
}

function ShipmentFacts({
  detail,
}: {
  readonly detail: ShipmentDetail;
}): ReactElement {
  const { shipment, timeZone } = detail;
  return (
    <SectionCard dataAttributes={{ "data-shipment-facts": "true" }}>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1">
          <dt className="text-caption text-muted-foreground">Created</dt>
          <dd className="text-body">
            {absoluteInstant(shipment.createdAt, timeZone)}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-caption text-muted-foreground">Departed</dt>
          <dd className="text-body" data-shipment-departed="true">
            {shipment.shippedAt === null
              ? "Not departed"
              : absoluteInstant(shipment.shippedAt, timeZone)}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-caption text-muted-foreground">Carrier</dt>
          <dd className="text-body">
            {shipment.carrierName ?? "Not recorded"}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-caption text-muted-foreground">
            {RETENTION_LABEL}
          </dt>
          <dd className="text-body" data-retention="true">
            {shipment.retentionExpiresOn ?? RETENTION_PENDING}
          </dd>
        </div>
        {shipment.airTransportBlockedReason === null ? null : (
          <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-4">
            <dt className="text-caption text-muted-foreground">
              {BLOCKED_AIR_ATTEMPT}
            </dt>
            <dd className="max-w-[72ch] text-body" data-air-refusal="true">
              {shipment.airTransportBlockedReason}
            </dd>
          </div>
        )}
      </dl>
    </SectionCard>
  );
}

async function PaperTab({
  ctx,
  detail,
}: {
  readonly ctx: RequestContext;
  readonly detail: ShipmentDetail;
}): Promise<ReactElement> {
  const { current, shipment } = detail;
  if (current === null || current.render === null) {
    const canBuild =
      canWriteRoute(ctx.role, "/shipments/new") &&
      (shipment.status === "draft" || shipment.status === "ready");
    return (
      <EmptyState
        icon={FileText}
        title={NO_PAPER_TITLE}
        description={NO_PAPER_BODY}
        {...(canBuild
          ? {
              action: {
                label: REVIEW_CHECKLIST,
                href: `/shipments/new?shipment=${shipment.id}&step=3`,
                dataAttributes: { "data-review-checklist": "true" },
              },
            }
          : {})}
        dataAttributes={{ "data-no-paper": "true" }}
      />
    );
  }
  const view = await readDocument(ctx, current.render);
  const earlier = detail.papers.slice(1);
  return (
    <div className="flex flex-col gap-6" data-paper-tab="true">
      <div>
        <Button
          asChild
          variant="outline"
          size="lg"
          className={ACTION_BUTTON_CLASS}
        >
          <Link href={`/documents/${current.render.id}`} data-open-paper="true">
            {OPEN_DOCUMENT}
          </Link>
        </Button>
      </div>
      <DocumentPanel view={view} embedded />
      {earlier.length === 0 ? null : (
        <SectionCard title={PRIOR_PAPERS}>
          <ul className="grid gap-2" data-prior-papers="true">
            {earlier.map(({ paper, render }) => (
              <li key={paper.id} className="flex flex-wrap items-center gap-3">
                {render === null ? null : (
                  <StatusBadge
                    system="document_render_status"
                    value={render.status}
                    size="sm"
                  />
                )}
                <span className="text-body">
                  {absoluteInstant(paper.generatedAt, detail.timeZone)}
                </span>
                <Link
                  href={`/documents/${paper.documentRenderId}`}
                  className="inline-flex min-h-11 items-center text-label underline underline-offset-4"
                >
                  {OPEN_DOCUMENT}
                </Link>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}

function ContentsTab({
  ctx,
  detail,
}: {
  readonly ctx: RequestContext;
  readonly detail: ShipmentDetail;
}): ReactElement {
  const canOpenContainer = canReadRoute(ctx.role, "/containers/[id]");
  const canOpenRecord = canReadRoute(ctx.role, "/batteries/[id]");
  return (
    <div
      className="grid grid-cols-1 gap-6 lg:grid-cols-2"
      data-contents-tab="true"
    >
      <SectionCard title={CONTENTS_CONTAINERS}>
        <ul className="grid gap-2">
          {detail.scope.map(({ container, records }) => (
            <li
              key={container.id}
              data-shipment-container={container.containerCode}
              className="flex flex-col gap-1"
            >
              {canOpenContainer ? (
                <Link
                  href={`/containers/${container.id}`}
                  className="inline-flex min-h-11 items-center font-mono text-body-strong underline underline-offset-4"
                >
                  {container.containerCode}
                </Link>
              ) : (
                <span className="font-mono text-body-strong">
                  {container.containerCode}
                </span>
              )}
              <span className="text-caption text-muted-foreground">
                {`${CONTAINER_TYPE_LABELS[container.containerType]} · ${records.length} ${records.length === 1 ? "record" : "records"}`}
              </span>
            </li>
          ))}
        </ul>
      </SectionCard>
      <SectionCard title={CONTENTS_RECORDS}>
        <ul className="grid gap-2">
          {detail.scope.flatMap(({ records }) =>
            records.map(({ record, classification }) => {
              const chemistry =
                record.chemistry === null
                  ? CHEMISTRY_LABELS.unknown
                  : (() => {
                      const read = readTaxonomyValue(
                        CHEMISTRIES,
                        CHEMISTRY_LABELS,
                        record.chemistry,
                      );
                      return read.recognised ? read.label : read.storedValue;
                    })();
              return (
                <li
                  key={record.id}
                  data-shipment-record={record.recordNumber}
                  className="flex flex-col gap-1"
                >
                  <span className="inline-flex flex-wrap items-center gap-2">
                    {canOpenRecord ? (
                      <Link
                        href={`/batteries/${record.id}`}
                        className="inline-flex min-h-11 items-center font-mono text-body-strong underline underline-offset-4"
                      >
                        {record.recordNumber}
                      </Link>
                    ) : (
                      <span className="font-mono text-body-strong">
                        {record.recordNumber}
                      </span>
                    )}
                    {classification === null ? null : (
                      <StatusBadge
                        system="waste_classification"
                        value={classification.wasteClassification}
                        size="sm"
                      />
                    )}
                    {record.ddrFlags.map((flag) => (
                      <StatusBadge
                        key={flag}
                        system="ddr_flag"
                        value={flag}
                        size="sm"
                      />
                    ))}
                  </span>
                  <span className="text-caption text-muted-foreground">
                    {chemistry}
                  </span>
                </li>
              );
            }),
          )}
        </ul>
      </SectionCard>
    </div>
  );
}

function HistoryTab({
  detail,
}: {
  readonly detail: ShipmentDetail;
}): ReactElement {
  const { renders, auditEvents, names, timeZone } = detail;
  return (
    <div className="flex flex-col gap-6" data-history-tab="true">
      <section className="flex flex-col gap-4">
        <h3 className="text-h2">{HISTORY_RENDERS}</h3>
        {renders.length === 0 ? (
          <p className="text-body">{NO_RENDERS}</p>
        ) : (
          <ol className="grid gap-3" data-shipment-renders="true">
            {renders.map((render) => {
              const type = readTaxonomyValue(
                DOCUMENT_TYPES,
                DOCUMENT_TYPE_LABELS,
                render.documentType,
              );
              return (
                <li
                  key={render.id}
                  data-shipment-render={render.status}
                  className="flex flex-wrap items-center gap-3"
                >
                  <span className="text-body-strong">
                    {type.recognised ? type.label : type.storedValue}
                  </span>
                  <StatusBadge
                    system="document_render_status"
                    value={render.status}
                    size="sm"
                  />
                  <span className="text-caption text-muted-foreground">
                    {absoluteInstant(render.renderedAt, timeZone)}
                  </span>
                  <span className="text-caption">
                    {names.get(render.renderedBy) ?? ""}
                  </span>
                  <Link
                    href={`/documents/${render.id}`}
                    className="inline-flex min-h-11 items-center text-label underline underline-offset-4"
                  >
                    {OPEN_DOCUMENT}
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </section>
      <section className="flex flex-col gap-4">
        <h3 className="text-h2">{HISTORY_AUDIT}</h3>
        {auditEvents === null ? (
          <p className="text-body">{HISTORY_AUDIT_ROLES}</p>
        ) : auditEvents.length === 0 ? (
          <p className="text-body">{NO_AUDIT_ROWS}</p>
        ) : (
          <ol data-shipment-audit="true" className="grid gap-4">
            {auditEvents.map((event) => {
              const type = readTaxonomyValue(
                AUDIT_EVENT_TYPES,
                AUDIT_EVENT_TYPE_LABELS,
                event.eventType,
              );
              return (
                <li
                  key={event.id}
                  data-audit-event={event.eventType}
                  className="grid gap-1 border-b border-border pb-4 last:border-b-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-body-strong">
                      {type.recognised ? type.label : type.storedValue}
                    </span>
                    <span className="text-caption text-muted-foreground">
                      {absoluteInstant(event.occurredAt, timeZone)}
                    </span>
                    <span className="text-caption">
                      {event.actorUserId === null
                        ? (event.actorLabel ?? "")
                        : (names.get(event.actorUserId) ?? "")}
                    </span>
                  </div>
                  {event.reason === null ? null : (
                    <p className="max-w-[72ch] text-body">{event.reason}</p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
