import "server-only";

import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import { canReadRoute } from "@/domain/access/route-capability";
import type { MoveContainerFacts } from "@/domain/storage/accumulation";
import { resolveUserNames } from "@/features/battery-record/user-names";
import type { AuditEvent } from "@/types/audit";
import type { BatteryRecord } from "@/types/battery-record";
import type { Uuid } from "@/types/common";
import type { ContainerLabel, DocumentRender } from "@/types/documents";
import type {
  Alert,
  Container,
  StorageClock,
  StorageEvent,
} from "@/types/storage";

import { clocksByContainer, currentClock } from "./read-containers";

/**
 * The `/containers/[id]` read — `UX_SPEC.md` §3.10.
 *
 * **Everything a container screen shows is a stored row**: the clock's status
 * the alert job wrote, the alerts raised against it, the label that was
 * printed. The two compliance flags are comparisons of stored rows — the label
 * in force against the container's current start (Rule 4.19), contents against
 * the absence of a label (Rule 4.22) — never a condition invented on render.
 *
 * The contents' move targets are read here too, each with the domain's own
 * admission for each operation, so a picker shows every container with the
 * reason it would refuse — never a hidden row.
 */

const CONTENTS_LIMIT = 500;
const CONTAINER_LIMIT = 200;
const CLOCK_LIMIT = 500;
const HISTORY_LIMIT = 100;

/**
 * A container the contents could move into, with the facts the domain's
 * admission reads. **The admission is computed where the selection is made**
 * — it depends on how many batteries are chosen and which operation — by the
 * same pure `admitContentsMove` the adapter runs, so the picker's stated
 * reason is the adapter's refusal, word for word.
 */
export interface MoveTarget {
  readonly container: Container;
  readonly clock: StorageClock | null;
  readonly facts: MoveContainerFacts;
}

export interface ContainerFlags {
  /** Holds contents with no label in force (Rule 4.22). */
  readonly noCurrentLabel: boolean;
  /** The printed start differs from the container's current start (Rule 4.19). */
  readonly mislabelled: {
    readonly printed: string;
    readonly current: string;
  } | null;
  /** Any content carries a DDR flag (Flow D3). */
  readonly damagedContents: boolean;
}

export interface ContainerDetail {
  readonly container: Container;
  readonly clock: StorageClock | null;
  readonly contents: readonly BatteryRecord[];
  readonly openAlerts: readonly Alert[];
  readonly label: ContainerLabel | null;
  readonly labelRender: DocumentRender | null;
  readonly flags: ContainerFlags;
  readonly moveTargets: readonly MoveTarget[];
  /** This container, as the admission reads it — the source of any move. */
  readonly sourceFacts: MoveContainerFacts;
  readonly storageEvents: readonly StorageEvent[];
  /** Null for a role that does not read the audit log (Rule 12.8). */
  readonly auditEvents: readonly AuditEvent[] | null;
  readonly names: ReadonlyMap<Uuid, string>;
}

export async function readContainer(
  ctx: RequestContext,
  container: Container,
): Promise<ContainerDetail> {
  const canReadAudit = canReadRoute(ctx.role, "/audit");

  const [
    clocks,
    contentsPage,
    alertsPage,
    containersPage,
    labelsPage,
    eventsPage,
    auditPage,
  ] = await Promise.all([
    data.storageClocks.list(ctx, { limit: CLOCK_LIMIT }),
    data.batteryRecords.list(ctx, {
      containerId: container.id,
      excludeVoided: true,
      excludeDrafts: true,
      limit: CONTENTS_LIMIT,
    }),
    data.alerts.list(ctx, {
      containerId: container.id,
      isOpen: true,
      limit: HISTORY_LIMIT,
    }),
    data.containers.list(ctx, { limit: CONTAINER_LIMIT }),
    data.containerLabels.list(ctx, {
      containerId: container.id,
      limit: HISTORY_LIMIT,
    }),
    data.storageEvents.list(ctx, {
      containerId: container.id,
      limit: HISTORY_LIMIT,
    }),
    // P1 cannot read the audit log (Rule 12.8): the branch reads the map, and
    // never a role literal. P1's history is the storage events themselves.
    canReadAudit
      ? data.auditEvents.list(ctx, {
          entityId: container.id,
          limit: HISTORY_LIMIT,
        })
      : Promise.resolve(null),
  ]);

  const clockOf = clocksByContainer(clocks.items);
  const clock = currentClock(
    clocks.items.filter((row) => row.containerId === container.id),
  );

  // The label in force is the one the container names; failing that, the
  // newest printed for it. Superseded labels stay readable on their own render.
  const label =
    labelsPage.items.find(
      (row) => row.id === container.currentContainerLabelId,
    ) ??
    labelsPage.items[0] ??
    null;
  const labelRender =
    label === null
      ? null
      : await data.documentRenders.get(ctx, label.documentRenderId);

  const contents = contentsPage.items;
  const flags: ContainerFlags = {
    noCurrentLabel:
      contents.length > 0 && container.currentContainerLabelId === null,
    mislabelled:
      label !== null &&
      container.accumulationStartedAt !== null &&
      Date.parse(label.accumulationStartedAt) !==
        Date.parse(container.accumulationStartedAt)
        ? {
            printed: label.accumulationStartedAt,
            current: container.accumulationStartedAt,
          }
        : null,
    damagedContents: contents.some((record) => record.ddrFlags.length > 0),
  };

  // Contents per container, for the move targets' counts — one read.
  const others = containersPage.items.filter((row) => row.id !== container.id);
  const othersContents =
    others.length === 0
      ? []
      : (
          await data.batteryRecords.list(ctx, {
            containerIds: others.map((row) => row.id),
            excludeVoided: true,
            excludeDrafts: true,
            limit: CONTENTS_LIMIT,
          })
        ).items;
  const countOf = new Map<Uuid, number>();
  for (const record of othersContents) {
    if (record.containerId === null) continue;
    countOf.set(record.containerId, (countOf.get(record.containerId) ?? 0) + 1);
  }

  const facts = (
    row: Container,
    rowClock: StorageClock | null,
    count: number,
  ): MoveContainerFacts => ({
    id: row.id,
    status: row.status,
    containerType: row.containerType,
    siteTimeZone: row.siteTimeZone,
    siteAddress: row.siteAddress,
    accumulationStartedAt: row.accumulationStartedAt,
    clockStatus: rowClock?.status ?? null,
    contentCount: count,
  });
  const sourceFacts = facts(container, clock, contents.length);

  const moveTargets: MoveTarget[] = others
    .filter((row) => row.status !== "retired" && row.status !== "shipped")
    .map((row) => {
      const rowClock = clockOf.get(row.id) ?? null;
      return {
        container: row,
        clock: rowClock,
        facts: facts(row, rowClock, countOf.get(row.id) ?? 0),
      };
    });

  const auditEvents = auditPage?.items ?? null;
  const names = await resolveUserNames(ctx, [
    ...eventsPage.items.map((event) => event.recordedBy),
    ...(auditEvents ?? []).map((event) => event.actorUserId),
    label?.generatedBy ?? null,
  ]);

  return {
    container,
    clock,
    contents,
    openAlerts: alertsPage.items,
    label,
    labelRender,
    flags,
    moveTargets,
    sourceFacts,
    storageEvents: eventsPage.items,
    auditEvents,
    names,
  };
}
