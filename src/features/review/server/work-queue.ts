import type { ExtractionReviewCardProps } from "@/components/extraction-review";
import type { ContainerPickerRow } from "@/components/storage/container-picker";
import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import type {
  CommitGateInput,
  CommitFieldState,
} from "@/domain/intake/commit-gate";
import { commitFieldStates } from "@/domain/intake/draft";
import { flaggedFieldCount } from "@/domain/review/queue";
import { CHEMISTRIES, CHEMISTRY_LABELS } from "@/domain/taxonomy/chemistry";
import {
  CHEMISTRY_SOURCE_LABELS,
  CHEMISTRY_SOURCES,
} from "@/domain/taxonomy/chemistry-source";
import { readTaxonomyValue } from "@/domain/taxonomy/lookup";
import {
  REVIEW_REASON_CODE_LABELS,
  REVIEW_REASON_CODES,
} from "@/domain/taxonomy/review-reason-code";
import { resolveUserNames } from "@/features/battery-record/user-names";
import type {
  ReviewCardView,
  ReviewPlaceholderImage,
} from "@/features/intake/components/extraction-review-step";
import { formatInstant } from "@/components/extraction-review";
import {
  draftForSession,
  readIntakeStepView,
} from "@/features/intake/server/read-intake";
import {
  catalogProposal,
  catalogQuery,
  commitGateInput,
  containerRows,
  requiredTypeLabel,
  reviewCardView,
  reviewPlaceholders,
  WHO_CAN_CREATE_CONTAINER,
} from "@/features/intake/server/step-views";
import { relativeTimeLabel } from "@/features/shell/chrome/relative-time";
import type { BatteryRecord } from "@/types/battery-record";
import type { CatalogEntry } from "@/types/catalog";
import type { IsoTimestamp, Uuid } from "@/types/common";
import type { DamageFindingType } from "@/domain/taxonomy/damage-finding-type";
import type { Chemistry } from "@/domain/taxonomy/chemistry";
import type { ApplicationClass } from "@/domain/taxonomy/application-class";

import {
  CONDITION_CONFIRMED_BELOW,
  REMATCH_REASON,
  chemistryWillChange,
} from "../review-copy";
import { readReviewQueue } from "./queue";
import { loadOpenRematch } from "./rematch";

/**
 * P1's and P6's work queue, read for the screen — `UX_SPEC.md` §3.8a.
 *
 * The membership comes from `./queue.ts`, the one derivation; this module
 * only describes each item — why it is here, how long it has waited, where
 * it is keyed, how many fields are flagged — and, for the item open in the
 * pane, composes the same props `/batteries/new` composes for the same card
 * (`features/intake/server/step-views.ts`). **Nothing here decides a rule:**
 * the gate, the checklist, the admissions and the clock arrive decided.
 *
 * Every value returned is plain serialisable data, so a Server Component can
 * hand it to the client pane in one prop.
 */

export interface QueueReason {
  /** T-52 as stored, or the Flow F reason. */
  readonly storedValue: string;
  /** `null` where the stored code is not one this build knows — render the code, in mono (§5.8). */
  readonly label: string | null;
}

export interface WorkQueueEntry {
  readonly kind: "intake" | "rematch";
  /** The session's id, or the raise's — what `?item=` carries. */
  readonly id: Uuid;
  readonly recordId: Uuid;
  readonly recordNumber: string;
  /** Manufacturer and model where the record or its draft has them. */
  readonly title: string | null;
  readonly queuedSince: IsoTimestamp;
  readonly ageLabel: string;
  readonly reasons: readonly QueueReason[];
  /** `null` for a re-match, which has no read of its own. */
  readonly flaggedFieldCount: number | null;
  readonly containerCode: string | null;
}

function titleOf(parts: readonly (string | null | undefined)[]): string | null {
  const present = parts.filter(
    (part): part is string => typeof part === "string" && part.trim() !== "",
  );
  return present.length === 0 ? null : present.join(" ");
}

function reasonsOf(codes: readonly string[] | null): readonly QueueReason[] {
  return (codes ?? []).map((code) => {
    const read = readTaxonomyValue(
      REVIEW_REASON_CODES,
      REVIEW_REASON_CODE_LABELS,
      code,
    );
    return {
      storedValue: read.storedValue,
      label: read.recognised ? read.label : null,
    };
  });
}

const CONTAINER_LIMIT = 100;

/** The queue, oldest first, each item described for the list. */
export async function readWorkQueue(
  ctx: RequestContext,
  asOf: IsoTimestamp,
): Promise<readonly WorkQueueEntry[]> {
  const [membership, containersPage] = await Promise.all([
    readReviewQueue(ctx),
    data.containers.list(ctx, { limit: CONTAINER_LIMIT }),
  ]);
  const codeOf = new Map(
    containersPage.items.map((container) => [
      container.id,
      container.containerCode,
    ]),
  );

  const entries: WorkQueueEntry[] = [];
  for (const session of membership.sessions) {
    const record =
      session.batteryRecordId === null
        ? null
        : await data.batteryRecords.get(ctx, session.batteryRecordId);
    if (record === null) continue;
    const { draft } = await draftForSession(ctx, session);
    const value = (code: string) =>
      draft.fields.find((field) => field.fieldCode === code)?.value ?? null;
    entries.push({
      kind: "intake",
      id: session.id,
      recordId: record.id,
      recordNumber: record.recordNumber,
      title: titleOf([
        record.manufacturerName ?? value("manufacturer"),
        record.modelName ?? value("model"),
      ]),
      queuedSince: session.startedAt,
      ageLabel: relativeTimeLabel(session.startedAt, asOf),
      reasons: reasonsOf(session.reviewReasonCodes),
      flaggedFieldCount: flaggedFieldCount(draft.fields),
      containerCode:
        draft.containerId === null
          ? null
          : (codeOf.get(draft.containerId) ?? null),
    });
  }

  for (const raise of membership.rematches) {
    if (raise.batteryRecordId === null) continue;
    const record = await data.batteryRecords.get(ctx, raise.batteryRecordId);
    if (record === null) continue;
    entries.push({
      kind: "rematch",
      id: raise.id,
      recordId: record.id,
      recordNumber: record.recordNumber,
      title: titleOf([record.manufacturerName, record.modelName]),
      queuedSince: raise.raisedAt,
      ageLabel: relativeTimeLabel(raise.raisedAt, asOf),
      reasons: [{ storedValue: "catalog_rematch", label: REMATCH_REASON }],
      flaggedFieldCount: null,
      containerCode:
        record.containerId === null
          ? null
          : (codeOf.get(record.containerId) ?? null),
    });
  }

  // One list, oldest first, whichever kind (§3.8a).
  return [...entries].sort(
    (a, b) =>
      a.queuedSince.localeCompare(b.queuedSince) || a.id.localeCompare(b.id),
  );
}

// --- the open item: an intake ------------------------------------------------------

export interface ConditionPaneView {
  readonly findings: readonly DamageFindingType[];
  readonly isDefective: boolean;
  readonly confirmed: { readonly byName: string; readonly at: string } | null;
}

export interface PlacementPaneView {
  readonly containers: readonly ContainerPickerRow[];
  readonly selectedId: string | null;
  readonly requiredTypeLabel: string | null;
  readonly whoCanCreate: string;
}

export interface IntakeItemView {
  readonly kind: "intake";
  readonly sessionId: Uuid;
  readonly recordId: Uuid;
  readonly recordNumber: string;
  readonly correlationId: string;
  readonly labelPhotoId: Uuid | null;
  readonly card: ReviewCardView;
  readonly images: {
    readonly crop: ReviewPlaceholderImage | null;
    readonly original: ReviewPlaceholderImage | null;
  };
  readonly proposal: {
    readonly manufacturerName: string;
    readonly modelName: string | null;
    readonly partNumber: string | null;
    readonly chemistry: Exclude<Chemistry, "unknown">;
    readonly applicationClass: ApplicationClass;
  } | null;
  readonly catalogQuery: string | null;
  readonly fieldStates: readonly CommitFieldState[];
  readonly commitGate: Omit<CommitGateInput, "isOffline">;
  readonly condition: ConditionPaneView;
  readonly placement: PlacementPaneView;
}

/**
 * The card's condition row says where condition is confirmed. On
 * `/batteries/new` that is step 3; here it is the section below the card.
 */
function withConditionNote(
  fields: ExtractionReviewCardProps["fields"],
): ExtractionReviewCardProps["fields"] {
  return fields.map((field) =>
    field.fieldCode === "assessed_condition" && field.input.kind === "readonly"
      ? {
          ...field,
          input: { kind: "readonly", note: CONDITION_CONFIRMED_BELOW },
        }
      : field,
  );
}

/** The item open in the pane, or `null` where the session is absent or another tenant's. */
export async function readIntakeItemView(
  ctx: RequestContext,
  sessionId: Uuid,
): Promise<IntakeItemView | null> {
  const view = await readIntakeStepView(ctx, sessionId);
  if (view === null) return null;

  const confirmedBy = view.draft.condition?.confirmedBy ?? null;
  const confirmedAt = view.draft.condition?.confirmedAt ?? null;
  const names = await resolveUserNames(ctx, [confirmedBy]);
  const card = reviewCardView(view);

  return {
    kind: "intake",
    sessionId: view.session.id,
    recordId: view.record.id,
    recordNumber: view.record.recordNumber,
    correlationId: view.session.correlationId,
    labelPhotoId: view.labelPhoto?.id ?? null,
    card: { ...card, fields: withConditionNote(card.fields) },
    images: reviewPlaceholders(view),
    proposal: catalogProposal(view),
    catalogQuery: catalogQuery(view),
    fieldStates: commitFieldStates(view.draft),
    commitGate: commitGateInput(view),
    condition: {
      findings: view.draft.condition?.findingTypes ?? [],
      isDefective: view.draft.condition?.isDefective ?? false,
      confirmed:
        confirmedBy === null || confirmedAt === null
          ? null
          : {
              byName:
                names.get(confirmedBy) ??
                (confirmedBy === ctx.userId
                  ? (view.viewer.fullName ?? "you")
                  : "a colleague"),
              at: formatInstant(confirmedAt, view.site.timeZone),
            },
    },
    placement: {
      containers: containerRows(view),
      selectedId: view.draft.containerId,
      requiredTypeLabel: requiredTypeLabel(view),
      whoCanCreate: WHO_CAN_CREATE_CONTAINER,
    },
  };
}

// --- the open item: a Flow F raise ------------------------------------------------------

export interface RematchItemView {
  readonly kind: "rematch";
  readonly raiseId: Uuid;
  readonly recordId: Uuid;
  readonly recordNumber: string;
  readonly current: {
    readonly title: string | null;
    readonly chemistryLabel: string | null;
    /** T-11's label — how the record's chemistry was established. */
    readonly chemistrySourceLabel: string | null;
    readonly confirmedByName: string | null;
    readonly confirmedAtLabel: string | null;
  };
  /** `null` where the entry is no longer visible to this organisation. */
  readonly entry: {
    readonly id: Uuid;
    readonly title: string;
    readonly chemistryLabel: string;
    readonly specs: readonly string[];
  } | null;
  readonly matchedOn: readonly string[];
  /** Said before the person confirms, never after (EC-13). `null` where nothing changes. */
  readonly chemistryChange: string | null;
}

function chemistryLabel(value: string | null): string | null {
  if (value === null) return null;
  const read = readTaxonomyValue(CHEMISTRIES, CHEMISTRY_LABELS, value);
  return read.recognised ? read.label : read.storedValue;
}

function entrySpecs(entry: CatalogEntry): readonly string[] {
  const specs: string[] = [];
  if (entry.partNumber !== null) specs.push(`Part number ${entry.partNumber}`);
  if (entry.nominalVoltageV !== null)
    specs.push(`Nominal voltage ${entry.nominalVoltageV} V`);
  if (entry.ratedCapacityAh !== null)
    specs.push(`Rated capacity ${entry.ratedCapacityAh} Ah`);
  if (entry.ratedEnergyWh !== null)
    specs.push(`Rated energy ${entry.ratedEnergyWh} Wh`);
  return specs;
}

const MATCHED_ON_LABELS: Readonly<Record<string, string>> = {
  manufacturer: "manufacturer",
  model: "model",
  part_number: "part number",
};

export async function readRematchItemView(
  ctx: RequestContext,
  raiseId: Uuid,
  timeZone: string,
): Promise<RematchItemView | null> {
  let loaded: Awaited<ReturnType<typeof loadOpenRematch>>;
  try {
    loaded = await loadOpenRematch(ctx, raiseId);
  } catch {
    // Absent, closed or another tenant's all read the same (Rule 1.2); the
    // page states that the item is no longer on the queue.
    return null;
  }
  const { record, entry, trigger } = loaded;
  const names = await resolveUserNames(ctx, [record.chemistryConfirmedBy]);
  const current = currentIdentification(record, names, timeZone);
  const proposedChemistry =
    entry === null ? null : chemistryLabel(entry.chemistry);

  return {
    kind: "rematch",
    raiseId: loaded.raise.id,
    recordId: record.id,
    recordNumber: record.recordNumber,
    current,
    entry:
      entry === null
        ? null
        : {
            id: entry.id,
            title:
              titleOf([
                entry.manufacturerName,
                entry.modelName ?? entry.partNumber,
              ]) ?? entry.manufacturerName,
            chemistryLabel: proposedChemistry ?? entry.chemistry,
            specs: entrySpecs(entry),
          },
    matchedOn: trigger.matchedOn.map((key) => MATCHED_ON_LABELS[key] ?? key),
    chemistryChange:
      proposedChemistry === null
        ? null
        : chemistryWillChange(current.chemistryLabel, proposedChemistry),
  };
}

function currentIdentification(
  record: BatteryRecord,
  names: ReadonlyMap<Uuid, string>,
  timeZone: string,
): RematchItemView["current"] {
  const source =
    record.chemistrySource === null
      ? null
      : readTaxonomyValue(
          CHEMISTRY_SOURCES,
          CHEMISTRY_SOURCE_LABELS,
          record.chemistrySource,
        );
  return {
    title: titleOf([record.manufacturerName, record.modelName]),
    chemistryLabel: chemistryLabel(record.chemistry),
    chemistrySourceLabel:
      source === null
        ? null
        : source.recognised
          ? source.label
          : source.storedValue,
    confirmedByName:
      record.chemistryConfirmedBy === null
        ? null
        : (names.get(record.chemistryConfirmedBy) ?? null),
    confirmedAtLabel:
      record.chemistryConfirmedAt === null
        ? null
        : formatInstant(record.chemistryConfirmedAt, timeZone),
  };
}
