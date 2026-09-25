import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AlertCard } from "@/components/alert/alert-card";
import {
  ACTION_BUTTON_CLASS,
  PageHeader,
  PageShell,
  RouteTabs,
  SectionCard,
} from "@/components/page";
import { decodeListQuery } from "@/components/record-table/list-url";
import { StatusBadge } from "@/components/status/status-badge";
import { ContainerFillMeter } from "@/components/storage/container-fill-meter";
import { decimalText } from "@/components/storage/container-fill-meter";
import { Button } from "@/components/ui/button";
import { data } from "@/data";
import { mayTakeContainerAction } from "@/domain/access/container-actions";
import { APP_ROUTE_NAMES } from "@/domain/access/routes";
import { siteWallClock } from "@/domain/storage/clock-display";
import { ACCUMULATION_START_SOURCE_LABELS } from "@/domain/taxonomy/accumulation-start-source";
import {
  ASSESSED_CONDITIONS,
  ASSESSED_CONDITION_LABELS,
} from "@/domain/taxonomy/assessed-condition";
import { CHEMISTRIES, CHEMISTRY_LABELS } from "@/domain/taxonomy/chemistry";
import { CONTAINER_TYPE_LABELS } from "@/domain/taxonomy/container-type";
import { DDR_FLAG_LABELS } from "@/domain/taxonomy/ddr-flag";
import { readTaxonomyValue } from "@/domain/taxonomy/lookup";
import { STORAGE_CLOCK_ALERT_BAND_LABELS } from "@/domain/taxonomy/storage-clock-alert-band";
import { CopyButton } from "@/features/battery-record/copy-button";
import { ContainerActions } from "@/features/containers/components/container-actions";
import { ContentsPanel } from "@/features/containers/components/contents-panel";
import { ClockCell } from "@/features/containers/container-columns";
import {
  CONTAINER_MASS_UNIT,
  NO_LOCATION,
  SHIP_THIS_CONTAINER,
  START_DATE_NOTE,
} from "@/features/containers/container-copy";
import { ContainerFlagsNotice } from "@/features/containers/container-flags";
import {
  activeContainerTab,
  CONTAINER_TAB_SPEC,
  CONTAINER_TABS,
  STORAGE_EVENT_DIALOG,
} from "@/features/containers/container-tabs";
import { HistorySection } from "@/features/containers/history-section";
import { LabelTab } from "@/features/containers/label-tab";
import { readContainer } from "@/features/containers/server/read-container";
import { Breadcrumbs } from "@/features/shell/chrome/breadcrumbs";
import { breadcrumbTrail } from "@/features/shell/navigation/breadcrumb-ancestors";
import { requireRoute } from "@/lib/auth/guard";
import { recordNotFound } from "@/lib/auth/record-denial";
import { nowIso, resolveRequestContext } from "@/lib/auth/session";
import type { BatteryRecord } from "@/types/battery-record";
import type { Container } from "@/types/storage";

/**
 * `/containers/[id]` — `UX_SPEC.md` §3.10.
 *
 * Work one container: contents, clock, volume against threshold, printable
 * label. **P1, P2 and P6 open it, with different write sets** — every control
 * here asks the §5.5 map (`domain/access/container-actions.ts`), and every
 * Server Action behind one asks it again.
 *
 * **There is no re-date control on this screen, for any role.** The
 * accumulation start date is set by the first placement and travels with the
 * batteries; moving, consolidating or splitting never makes it later
 * (Rules 4.4, 4.9–4.12). It does not exist, so there is nothing to disable.
 *
 * **Overdue is a hard state** (Rule 4.15): the clock's own `critical` state,
 * the pinned alert, and a Contents tab whose move targets refuse it with the
 * two ways out stated (Rule 4.16).
 */

export async function generateMetadata({
  params,
}: PageProps<"/containers/[id]">): Promise<Metadata> {
  const fallback: Metadata = { title: APP_ROUTE_NAMES["/containers/[id]"] };
  // The session, not the guard: the page's own guard is the access decision,
  // and a second one would write a second denial for one attempt (Rule 12.6).
  const resolution = await resolveRequestContext();
  if (resolution.kind !== "resolved") return fallback;
  const { id } = await params;
  const container = await data.containers.get(resolution.session.ctx, id);
  return container === null ? fallback : { title: container.containerCode };
}

function civilDateIn(timeZone: string): (instant: string) => string {
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  return (instant) => format.format(new Date(instant));
}

function contentsRow(record: BatteryRecord) {
  const chemistry =
    record.chemistry === null
      ? null
      : readTaxonomyValue(CHEMISTRIES, CHEMISTRY_LABELS, record.chemistry);
  const condition =
    record.assessedCondition === null
      ? null
      : readTaxonomyValue(
          ASSESSED_CONDITIONS,
          ASSESSED_CONDITION_LABELS,
          record.assessedCondition,
        );
  const flags = record.ddrFlags.map((flag) => DDR_FLAG_LABELS[flag]);
  const conditionText =
    condition === null
      ? "Not recorded"
      : condition.recognised
        ? condition.label
        : condition.storedValue;
  return {
    id: record.id,
    recordNumber: record.recordNumber,
    href: `/batteries/${record.id}`,
    description:
      [record.manufacturerName, record.modelName]
        .filter((part): part is string => part !== null && part !== "")
        .join(" ") || "Not recorded",
    chemistryLabel:
      chemistry === null
        ? "Chemistry not confirmed"
        : chemistry.recognised
          ? chemistry.label
          : chemistry.storedValue,
    conditionLabel:
      flags.length === 0
        ? conditionText
        : `${conditionText} · ${flags.join(", ")}`,
    isDamaged: flags.length > 0,
  };
}

function fillText(container: Container): string | null {
  if (container.currentNetMassKg === null) return null;
  return container.capacityKg === null
    ? `${decimalText(container.currentNetMassKg)} ${CONTAINER_MASS_UNIT}`
    : `${decimalText(container.currentNetMassKg)} of ${decimalText(container.capacityKg)} ${CONTAINER_MASS_UNIT}`;
}

export default async function ContainerPage({
  params,
  searchParams,
}: PageProps<"/containers/[id]">) {
  const { ctx } = await requireRoute("/containers/[id]");
  const { id } = await params;

  const container = await data.containers.get(ctx, id);
  if (container === null) {
    // Absent and another tenant's read the same, and the attempt is recorded
    // (Rules 1.2, 1.16).
    await recordNotFound(ctx, "container", id);
    notFound();
  }

  const asOf = nowIso();
  const rawParams = await searchParams;
  const basePath = `/containers/${container.id}`;
  const query = decodeListQuery(rawParams, CONTAINER_TAB_SPEC);
  const tab = activeContainerTab(query);
  const detail = await readContainer(ctx, container);
  const timeZone = detail.clock?.timeZone ?? container.siteTimeZone;
  const formatDate = civilDateIn(timeZone);

  const isOverdue = container.status === "overdue";
  const isEmpty = detail.contents.length === 0;
  const clockClosed = detail.clock === null || detail.clock.stoppedAt !== null;
  const can = (action: Parameters<typeof mayTakeContainerAction>[1]) =>
    mayTakeContainerAction(ctx.role, action);
  const canShip = can("ship_this_container");

  const containerCodes = new Map(
    [container, ...detail.moveTargets.map((target) => target.container)].map(
      (row) => [row.id, row.containerCode],
    ),
  );

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            crumbs={breadcrumbTrail(
              "/containers/[id]",
              ctx.role,
              container.containerCode,
            )}
          />
        }
        title={
          // The ID in the mono face at the title's size — the same treatment
          // `/batteries/[id]` gives a record number (§1.3).
          <span className="font-mono tabular-nums">
            {container.containerCode}
          </span>
        }
        titleAdornment={
          <CopyButton value={container.containerCode} label="container ID" />
        }
        subtitle={`${CONTAINER_TYPE_LABELS[container.containerType]} · ${container.storageLocation ?? NO_LOCATION}`}
        action={
          canShip && !isEmpty ? (
            // P1 and P6. The shipment is unit 05's; this is the link and nothing more.
            <Button asChild size="lg" className={ACTION_BUTTON_CLASS}>
              <Link
                href={`/shipments/new?containers=${container.id}`}
                data-ship-this-container="true"
              >
                {SHIP_THIS_CONTAINER}
              </Link>
            </Button>
          ) : undefined
        }
        meta={
          <StatusBadge system="container_status" value={container.status} />
        }
        notice={
          <div className="flex flex-col gap-3">
            {/* Pinned, and dismissible by no role: there is no dismiss control
                on an alert card at all (E-6). */}
            {detail.openAlerts.map((alert) => (
              <AlertCard key={alert.id} alert={alert} />
            ))}
            <ContainerFlagsNotice
              flags={detail.flags}
              formatDate={formatDate}
            />
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard
          title="Storage clock"
          dataAttributes={{ "data-container-clock": "true" }}
        >
          <ClockCell
            row={{ container, clock: detail.clock }}
            asOf={asOf}
            size="md"
          />
          {container.accumulationStartSource === null ? null : (
            <p data-start-source="true" className="text-caption">
              {`Start set by: ${ACCUMULATION_START_SOURCE_LABELS[container.accumulationStartSource]}`}
            </p>
          )}
          <p className="max-w-[72ch] text-caption text-muted-foreground">
            {START_DATE_NOTE}
          </p>
        </SectionCard>
        <SectionCard
          title="Fill"
          dataAttributes={{ "data-container-fill": "true" }}
        >
          <ContainerFillMeter
            reading={{
              current: container.currentNetMassKg,
              capacity: container.capacityKg,
              unit: CONTAINER_MASS_UNIT,
            }}
            limit={null}
            label={`Fill for container ${container.containerCode}`}
          />
        </SectionCard>
      </div>

      <ContainerActions
        containerId={container.id}
        containerCode={container.containerCode}
        siteTimeZone={container.siteTimeZone}
        siteNow={siteWallClock(asOf, container.siteTimeZone)}
        storageLocation={container.storageLocation}
        capacityKg={container.capacityKg}
        openStorageEvent={rawParams.dialog === STORAGE_EVENT_DIALOG}
        can={{
          recordStorageEvent: can("record_storage_event"),
          recordRemediation: can("record_remediation") && isOverdue,
          markReadyToShip:
            can("mark_ready_to_ship") &&
            !isEmpty &&
            ["open", "full", "overdue"].includes(container.status),
          editDetails: can("edit_capacity_or_location"),
          retire:
            can("retire") &&
            isEmpty &&
            clockClosed &&
            container.status !== "retired",
        }}
      />

      <RouteTabs
        tabs={CONTAINER_TABS}
        basePath={basePath}
        query={query}
        spec={CONTAINER_TAB_SPEC}
        active={tab}
        label="Container sections"
        dataAttribute="data-container-tab"
      />

      {tab === "contents" ? (
        <ContentsPanel
          containerCode={container.containerCode}
          rows={detail.contents.map(contentsRow)}
          canMove={can("add_or_remove_records")}
          canCreate={can("create")}
          source={detail.sourceFacts}
          targets={detail.moveTargets.map((target) => ({
            id: target.container.id,
            code: target.container.containerCode,
            typeLabel: CONTAINER_TYPE_LABELS[target.container.containerType],
            location: target.container.storageLocation,
            status: target.container.status,
            clockTier:
              target.clock === null || target.clock.alertBand === "none"
                ? null
                : STORAGE_CLOCK_ALERT_BAND_LABELS[target.clock.alertBand],
            fillText: fillText(target.container),
            timeZone: target.container.siteTimeZone,
            facts: target.facts,
          }))}
        />
      ) : null}
      {tab === "label" ? (
        <LabelTab
          ctx={ctx}
          labelRender={detail.labelRender}
          needsRelabel={detail.flags.mislabelled !== null}
        />
      ) : null}
      {tab === "history" ? (
        <HistorySection
          storageEvents={detail.storageEvents}
          auditEvents={detail.auditEvents}
          names={detail.names}
          containerCodes={containerCodes}
          timeZone={timeZone}
        />
      ) : null}
    </PageShell>
  );
}
