import type { FieldSource } from "@/components/provenance/field-source-badge";
import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import {
  flaggedFieldCount,
  groupByContainer,
  type InventoryGroup,
} from "@/domain/review/queue";
import {
  CONTAINER_TYPE_LABELS,
  CONTAINER_TYPES,
} from "@/domain/taxonomy/container-type";
import type { ConfidenceBand } from "@/domain/taxonomy/confidence-band";
import { INTAKE_PHOTO_TYPE_LABELS } from "@/domain/taxonomy/intake-photo-type";
import {
  HARD_GATED_LABEL_FIELD_CODES,
  type LabelFieldCode,
} from "@/domain/taxonomy/label-field-code";
import { readTaxonomyValue } from "@/domain/taxonomy/lookup";
import {
  STORAGE_CLOCK_ALERT_BAND_LABELS,
  STORAGE_CLOCK_ALERT_BANDS,
  type StorageClockAlertBand,
} from "@/domain/taxonomy/storage-clock-alert-band";
import {
  draftForSession,
  readIntakeStepView,
} from "@/features/intake/server/read-intake";
import { formatAddressLine } from "@/features/settings/sites";
import { relativeTimeLabel } from "@/features/shell/chrome/relative-time";
import type { IsoTimestamp, Uuid } from "@/types/common";
import type { Container, StorageClock } from "@/types/storage";

import { unconfirmedStatement } from "../review-copy";
import { readReviewQueue } from "./queue";

/**
 * P2's view of the queue — `UX_SPEC.md` §3.8b, E-8b;
 * `SITE_ARCHITECTURE.md` Flow C step C5, CL-1.
 *
 * **Her question, not P1's:** which batteries sitting in her containers are
 * still unidentified, and which containers are they in? So the items are
 * keyed on containers, carry the container's storage-clock tier and
 * segregation class, and roll up per container. The membership is the same
 * one derivation (`./queue.ts`); what differs is the composition.
 *
 * **Read-only by construction.** Nothing here — and nothing the screen built
 * from it renders — writes anything. There is no action to fail, so there is
 * no failed-write path (§3.8b).
 *
 * ## Where an unidentified battery "sits"
 *
 * An unconfirmed record has no `container_id`: placement is written only by
 * the commit (`commitConfirmation` is the one placement writer). The item is
 * therefore keyed on the container its intake names on its draft — the drum
 * the handler started beside, or chose on step 3 — and an item that names
 * none is grouped under its own heading, never dropped. That the schema holds
 * no physical location for an unidentified battery is an ERD finding.
 */

const CONTAINER_LIMIT = 100;
const CLOCK_LIMIT = 100;

/**
 * The age filter's three spans. **Presentation, not a rule** — they bucket how
 * long an item has waited so a person can find the old ones; no item moves,
 * expires or changes because of them (Rule 2.23, D-33).
 */
export const AGE_FILTERS = [
  "under_a_day",
  "under_a_week",
  "a_week_or_more",
] as const;

export type AgeFilter = (typeof AGE_FILTERS)[number];

export const AGE_FILTER_LABELS: Readonly<Record<AgeFilter, string>> = {
  under_a_day: "Less than a day",
  under_a_week: "Less than a week",
  a_week_or_more: "A week or more",
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

function ageBucket(since: IsoTimestamp, asOf: IsoTimestamp): AgeFilter {
  const waited = Date.parse(asOf) - Date.parse(since);
  if (waited < DAY_MS) return "under_a_day";
  if (waited < WEEK_MS) return "under_a_week";
  return "a_week_or_more";
}

export interface InventoryFilters {
  readonly site?: string;
  readonly container?: string;
  readonly tier?: string;
  readonly age?: string;
}

export interface InventoryRow {
  /** The session's id — what `?item=` carries. */
  readonly id: Uuid;
  readonly recordId: Uuid;
  readonly recordNumber: string;
  readonly containerId: Uuid | null;
  readonly site: string;
  readonly queuedSince: IsoTimestamp;
  readonly ageLabel: string;
  readonly flaggedFieldCount: number;
}

export interface InventoryContainer {
  readonly id: Uuid;
  readonly code: string;
  readonly site: string;
  readonly classLabel: string;
  /** Recognised T-23 or not — an unrecognised class renders as stored, in mono. */
  readonly classRecognised: boolean;
  readonly clock: StorageClock | null;
  readonly clockTierLabel: string | null;
  /** Records placed in the container now, voided excluded. */
  readonly placedCount: number;
}

export interface InventoryGroupView {
  readonly container: InventoryContainer | null;
  readonly rows: readonly InventoryRow[];
}

export interface FilterOption {
  readonly value: string;
  readonly label: string;
}

export interface UnidentifiedInventory {
  /** Every unidentified item, before filters — the headline counts these. */
  readonly total: number;
  readonly groups: readonly InventoryGroupView[];
  readonly options: {
    readonly site: readonly FilterOption[];
    readonly container: readonly FilterOption[];
    readonly tier: readonly FilterOption[];
    readonly age: readonly FilterOption[];
  };
}

function classOf(container: Container): {
  readonly label: string;
  readonly recognised: boolean;
} {
  const read = readTaxonomyValue(
    CONTAINER_TYPES,
    CONTAINER_TYPE_LABELS,
    container.containerType,
  );
  return read.recognised
    ? { label: read.label, recognised: true }
    : { label: read.storedValue, recognised: false };
}

export async function readUnidentifiedInventory(
  ctx: RequestContext,
  asOf: IsoTimestamp,
  filters: InventoryFilters,
): Promise<UnidentifiedInventory> {
  const [membership, organization, containersPage, clocksPage] =
    await Promise.all([
      readReviewQueue(ctx),
      data.organizations.get(ctx, ctx.organizationId),
      data.containers.list(ctx, { limit: CONTAINER_LIMIT }),
      data.storageClocks.list(ctx, { isRunning: true, limit: CLOCK_LIMIT }),
    ]);
  const orgSite =
    organization === null ? "" : formatAddressLine(organization.primaryAddress);
  const siteOf = (container: Container | null): string =>
    container !== null && container.siteAddress !== null
      ? formatAddressLine(container.siteAddress)
      : orgSite;

  const containers = new Map(
    containersPage.items.map((container) => [container.id, container]),
  );
  const clockOf = new Map(
    clocksPage.items
      .filter((clock) => clock.containerId !== null)
      .map((clock) => [clock.containerId as Uuid, clock]),
  );

  const rows: InventoryRow[] = [];
  const tierOf = new Map<Uuid, StorageClockAlertBand | null>();
  for (const session of membership.sessions) {
    const record =
      session.batteryRecordId === null
        ? null
        : await data.batteryRecords.get(ctx, session.batteryRecordId);
    if (record === null) continue;
    const { draft } = await draftForSession(ctx, session);
    const container =
      draft.containerId === null
        ? null
        : (containers.get(draft.containerId) ?? null);
    const clock =
      container === null ? null : (clockOf.get(container.id) ?? null);
    rows.push({
      id: session.id,
      recordId: record.id,
      recordNumber: record.recordNumber,
      containerId: container?.id ?? null,
      site: siteOf(container),
      queuedSince: session.startedAt,
      ageLabel: relativeTimeLabel(session.startedAt, asOf),
      flaggedFieldCount: flaggedFieldCount(draft.fields),
    });
    tierOf.set(session.id, clock?.alertBand ?? null);
  }

  const narrowed = rows.filter(
    (row) =>
      (filters.site === undefined || row.site === filters.site) &&
      (filters.container === undefined ||
        row.containerId === filters.container) &&
      (filters.tier === undefined || tierOf.get(row.id) === filters.tier) &&
      (filters.age === undefined ||
        ageBucket(row.queuedSince, asOf) === filters.age),
  );

  // Site, then container code — §3.8b's "container, then site", read as the
  // order a person walks the floor.
  const containerOrder = [...containersPage.items]
    .sort(
      (a, b) =>
        siteOf(a).localeCompare(siteOf(b)) ||
        a.containerCode.localeCompare(b.containerCode),
    )
    .map((container) => container.id);

  const grouped: readonly InventoryGroup<InventoryRow>[] = groupByContainer(
    narrowed,
    containerOrder,
  );

  const groups: InventoryGroupView[] = [];
  for (const group of grouped) {
    const container =
      group.containerId === null ? null : containers.get(group.containerId);
    if (container === undefined || container === null) {
      groups.push({ container: null, rows: group.items });
      continue;
    }
    const placed = await data.batteryRecords.list(ctx, {
      containerId: container.id,
      excludeVoided: true,
      limit: 1,
    });
    const clock = clockOf.get(container.id) ?? null;
    const containerClass = classOf(container);
    groups.push({
      container: {
        id: container.id,
        code: container.containerCode,
        site: siteOf(container),
        classLabel: containerClass.label,
        classRecognised: containerClass.recognised,
        clock,
        clockTierLabel:
          clock === null
            ? null
            : STORAGE_CLOCK_ALERT_BAND_LABELS[clock.alertBand],
        placedCount: placed.total,
      },
      rows: group.items,
    });
  }

  const sites = [...new Set([orgSite, ...containersPage.items.map(siteOf)])]
    .filter((site) => site !== "")
    .sort();

  return {
    total: rows.length,
    groups,
    options: {
      site: sites.map((site) => ({ value: site, label: site })),
      container: [...containersPage.items]
        .sort((a, b) => a.containerCode.localeCompare(b.containerCode))
        .map((container) => ({
          value: container.id,
          label: container.containerCode,
        })),
      tier: STORAGE_CLOCK_ALERT_BANDS.map((band) => ({
        value: band,
        label: STORAGE_CLOCK_ALERT_BAND_LABELS[band],
      })),
      age: AGE_FILTERS.map((age) => ({
        value: age,
        label: AGE_FILTER_LABELS[age],
      })),
    },
  };
}

// --- the read-only summary panel (§3.8b) ------------------------------------------------

export interface SummaryField {
  readonly fieldCode: LabelFieldCode;
  readonly label: string;
  readonly value: string | null;
  readonly source: FieldSource;
  readonly confidenceBand: ConfidenceBand | null;
  readonly status: "pending" | "confirmed" | "rejected";
}

export interface InventorySummary {
  readonly sessionId: Uuid;
  readonly recordId: Uuid;
  readonly recordNumber: string;
  readonly containerId: Uuid | null;
  readonly crop: {
    readonly label: string;
    readonly width: number;
    readonly height: number;
  } | null;
  readonly fields: readonly SummaryField[];
  /** §3.8b's plain statement — *"Chemistry, model and condition are not yet confirmed."* */
  readonly unconfirmed: string;
}

/**
 * The label crop, the fields as read with their bands and sources, and what
 * is still unconfirmed. **Not `ExtractionReviewCard`** — nothing on it acts
 * (§3.8b, E-8b).
 */
export async function readInventorySummary(
  ctx: RequestContext,
  sessionId: Uuid,
): Promise<InventorySummary | null> {
  const view = await readIntakeStepView(ctx, sessionId);
  if (view === null) return null;
  const conditionConfirmed =
    view.draft.condition !== null && view.draft.condition.confirmedBy !== null;
  const unconfirmed = HARD_GATED_LABEL_FIELD_CODES.filter((code) =>
    code === "assessed_condition"
      ? !conditionConfirmed
      : view.draft.fields.find((field) => field.fieldCode === code)?.status !==
        "confirmed",
  );
  return {
    sessionId: view.session.id,
    recordId: view.record.id,
    recordNumber: view.record.recordNumber,
    containerId: view.draft.containerId,
    crop:
      view.crop === null
        ? null
        : {
            label: INTAKE_PHOTO_TYPE_LABELS.label_crop,
            width: view.crop.widthPx,
            height: view.crop.heightPx,
          },
    fields: view.fields
      .filter((field) => field.fieldCode !== "assessed_condition")
      .map((field) => ({
        fieldCode: field.fieldCode,
        label: field.label,
        value: field.value,
        source: field.source,
        confidenceBand: field.confidenceBand,
        status: field.status,
      })),
    unconfirmed: unconfirmedStatement(unconfirmed),
  };
}
