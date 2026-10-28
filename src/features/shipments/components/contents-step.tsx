"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type ReactElement } from "react";

import {
  InlineActionError,
  ReviewButton,
} from "@/components/extraction-review/review-controls";
import { SectionCard } from "@/components/page";
import { INTENT_TEXT_CLASSES } from "@/components/status/intent-classes";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { summarizeShipmentContents } from "@/domain/transport/contents-summary";
import { cn } from "@/lib/utils";

import { changeContents } from "../actions";
import {
  BATTERIES_DESCRIPTION,
  BATTERIES_TITLE,
  CONTENTS_DESCRIPTION,
  CONTENTS_TITLE,
  CONTINUE,
  LOT_EARLIEST_START,
  LOT_MEMBERS,
  LOT_NO_START,
  LOT_OVERDUE,
  LOTS_DESCRIPTION,
  LOTS_TITLE,
  OPEN_ITS_CONTAINER,
  SAVE_CONTENTS,
  SAVING,
  SHIPS_AS_CONTAINER,
  SUMMARY_CHEMISTRIES,
  SUMMARY_DAMAGED,
  SUMMARY_ENERGY,
  SUMMARY_MASS,
  SUMMARY_NO_DAMAGED,
  SUMMARY_NOTHING,
  SUMMARY_RECORDS,
  SUMMARY_TITLE,
  SUMMARY_UNKNOWN_PART,
  STEP_LOCKED_SELECT,
  VOID_REASON_LABEL,
  VOID_REASON_REQUIRED,
  VOIDS_PAPER_NOTICE,
} from "../shipment-copy";
import type {
  BatteryCandidate,
  LotCandidate,
  ShipmentCandidate,
} from "../server/candidates";

/**
 * Step 1, **Contents** — `UX_SPEC.md` §3.12; Flow B1; Rules 5.1, 5.2, 5.24,
 * 5.25.
 *
 * **Lots, containers and single batteries, mixed** (Rule 5.1). Every row is
 * listed with the reason it would refuse — the domain's admission, computed
 * on the server — and a refused one cannot be chosen. A lot ships as its
 * containers, and a single battery ships as its own labelled container, so
 * choosing a battery chooses that container: the selection is two sets, lots
 * and containers, and the summary adds up each container once. **Mixing
 * sites, putting a record on a second open shipment, an unlabelled or
 * mislabelled container, and a damaged record onto an air shipment are
 * blocked here**, at assembly, and the adapter refuses each again at commit.
 *
 * The live summary adds up only what the rows carry — record count,
 * chemistries, mass and energy where known — and **names every damaged,
 * defective or recalled record**.
 *
 * On an issued shipment, changing the contents **voids the paper** (Rule
 * 5.13), so the change needs a stated reason (Rule 5.14) before it is sent.
 */

export interface ContentsStepProps {
  readonly lots: readonly LotCandidate[];
  readonly candidates: readonly ShipmentCandidate[];
  readonly batteries: readonly BatteryCandidate[];
  readonly initialSelection: {
    readonly containers: readonly string[];
    readonly lots: readonly string[];
  };
  /** Null while the shipment is not yet written — a new shipment's step 1. */
  readonly shipment: {
    readonly id: string;
    readonly paperIssued: boolean;
  } | null;
  /** The organization's zone, for a lot's earliest start date. */
  readonly timeZone: string;
}

const SITE_MISMATCH =
  "These containers are at different sites. A shipment leaves from one site (Rule 5.2).";

function sameSet(a: ReadonlySet<string>, b: readonly string[]): boolean {
  return a.size === b.length && b.every((value) => a.has(value));
}

function dateText(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(instant));
}

export function ContentsStep({
  lots,
  candidates,
  batteries,
  initialSelection,
  shipment,
  timeZone,
}: ContentsStepProps): ReactElement {
  const router = useRouter();
  const [selectedContainers, setSelectedContainers] = useState<
    ReadonlySet<string>
  >(() => new Set(initialSelection.containers));
  const [selectedLots, setSelectedLots] = useState<ReadonlySet<string>>(
    () => new Set(initialSelection.lots),
  );
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reasonId = useId();

  const chosenLots = lots.filter((lot) => selectedLots.has(lot.id));
  const chosenContainers = candidates.filter((candidate) =>
    selectedContainers.has(candidate.id),
  );
  // Each container once: one chosen alone and also inside a chosen lot is
  // counted with its lot.
  const lotMemberIds = new Set(chosenLots.flatMap((lot) => lot.memberIds));
  const summary = summarizeShipmentContents([
    ...chosenLots.flatMap((lot) => lot.records),
    ...chosenContainers
      .filter((candidate) => !lotMemberIds.has(candidate.id))
      .flatMap((candidate) => candidate.records),
  ]);
  const sites = new Set([
    ...chosenContainers.map((candidate) => candidate.siteKey),
    ...chosenLots.flatMap((lot) => (lot.siteKey === null ? [] : [lot.siteKey])),
  ]);
  const changed =
    !sameSet(selectedContainers, initialSelection.containers) ||
    !sameSet(selectedLots, initialSelection.lots);
  const voids = shipment !== null && shipment.paperIssued && changed;
  const nothingChosen =
    chosenContainers.length === 0 && chosenLots.length === 0;

  const gatedReason =
    nothingChosen && shipment === null
      ? STEP_LOCKED_SELECT
      : sites.size > 1
        ? SITE_MISMATCH
        : voids && reason.trim() === ""
          ? VOID_REASON_REQUIRED
          : null;

  function toggleContainer(id: string, admitted: boolean): void {
    const isSelected = selectedContainers.has(id);
    // A refused row may be taken off, never put on.
    if (!isSelected && !admitted) return;
    const next = new Set(selectedContainers);
    if (isSelected) next.delete(id);
    else next.add(id);
    setSelectedContainers(next);
    setError(null);
  }

  function toggleLot(lot: LotCandidate): void {
    const isSelected = selectedLots.has(lot.id);
    if (!isSelected && !lot.admission.ok) return;
    const next = new Set(selectedLots);
    if (isSelected) next.delete(lot.id);
    else next.add(lot.id);
    setSelectedLots(next);
    setError(null);
  }

  async function proceed(): Promise<void> {
    if (pending || gatedReason !== null) return;
    const containerIds = chosenContainers.map((candidate) => candidate.id);
    const lotIds = chosenLots.map((lot) => lot.id);
    if (shipment === null) {
      const query = [
        "step=2",
        ...(containerIds.length === 0
          ? []
          : [`containers=${encodeURIComponent(containerIds.join(","))}`]),
        ...(lotIds.length === 0
          ? []
          : [`lots=${encodeURIComponent(lotIds.join(","))}`]),
      ].join("&");
      router.push(`/shipments/new?${query}`);
      return;
    }
    if (!changed) {
      router.push(`/shipments/new?shipment=${shipment.id}&step=2`);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await changeContents({
        shipmentId: shipment.id,
        containerIds,
        lotIds,
        reason: voids ? reason.trim() : null,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.push(`/shipments/new?shipment=${shipment.id}&step=2`);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      data-contents-step="true"
      className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]"
    >
      <div className="flex min-w-0 flex-col gap-6">
        {lots.length === 0 ? null : (
          <SectionCard
            title={LOTS_TITLE}
            description={LOTS_DESCRIPTION}
            dataAttributes={{ "data-shipment-lots": String(lots.length) }}
          >
            <ul className="grid gap-2">
              {lots.map((lot) => (
                <SourceRow
                  key={lot.id}
                  id={`lot-${lot.id}`}
                  code={lot.code}
                  heading={lot.description ?? lot.statusLabel}
                  detail={[
                    lot.statusLabel,
                    `${LOT_MEMBERS}: ${lot.memberCodes.length === 0 ? "none" : lot.memberCodes.join(", ")}`,
                    `${LOT_EARLIEST_START}: ${lot.earliestStart === null ? LOT_NO_START : dateText(lot.earliestStart, timeZone)}`,
                    ...(lot.isOverdue ? [LOT_OVERDUE] : []),
                  ]}
                  admission={lot.admission}
                  isSelected={selectedLots.has(lot.id)}
                  onToggle={() => toggleLot(lot)}
                  dataAttributes={{
                    "data-lot-candidate": lot.id,
                    "data-lot-code": lot.code,
                    "data-lot-overdue": lot.isOverdue ? "true" : "false",
                  }}
                />
              ))}
            </ul>
          </SectionCard>
        )}

        <SectionCard
          title={CONTENTS_TITLE}
          description={CONTENTS_DESCRIPTION}
          dataAttributes={{
            "data-shipment-candidates": String(candidates.length),
          }}
        >
          <ul className="grid gap-2">
            {candidates.map((candidate) => (
              <SourceRow
                key={candidate.id}
                id={`candidate-${candidate.id}`}
                code={candidate.code}
                heading={candidate.typeLabel}
                detail={[
                  ...new Set(
                    [
                      candidate.location,
                      `${candidate.records.length} ${candidate.records.length === 1 ? "record" : "records"}`,
                      candidate.fillText,
                      candidate.clockTier,
                      candidate.statusLabel,
                    ].filter((part): part is string => part !== null),
                  ),
                ]}
                admission={candidate.admission}
                isSelected={selectedContainers.has(candidate.id)}
                onToggle={() =>
                  toggleContainer(candidate.id, candidate.admission.ok)
                }
                dataAttributes={{
                  "data-candidate": candidate.id,
                  "data-candidate-code": candidate.code,
                }}
              />
            ))}
          </ul>
        </SectionCard>

        {batteries.length === 0 ? null : (
          <SectionCard
            title={BATTERIES_TITLE}
            description={BATTERIES_DESCRIPTION}
            dataAttributes={{
              "data-shipment-batteries": String(batteries.length),
            }}
          >
            <ul className="grid gap-2">
              {batteries.map((battery) => (
                <SourceRow
                  key={battery.recordId}
                  id={`battery-${battery.recordId}`}
                  code={battery.recordNumber}
                  heading={`${SHIPS_AS_CONTAINER} ${battery.containerCode}`}
                  detail={[]}
                  admission={battery.admission}
                  isSelected={selectedContainers.has(battery.containerId)}
                  onToggle={() =>
                    toggleContainer(battery.containerId, battery.admission.ok)
                  }
                  extra={
                    battery.admission.ok ? null : (
                      <Link
                        href={battery.containerHref}
                        data-battery-split-link="true"
                        className="text-body underline underline-offset-4"
                      >
                        {OPEN_ITS_CONTAINER}
                      </Link>
                    )
                  }
                  dataAttributes={{
                    "data-battery-candidate": battery.recordId,
                    "data-battery-number": battery.recordNumber,
                  }}
                />
              ))}
            </ul>
          </SectionCard>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <SectionCard
          title={SUMMARY_TITLE}
          dataAttributes={{ "data-contents-summary": "true" }}
        >
          {summary.recordCount === 0 ? (
            <p className="text-body text-muted-foreground">{SUMMARY_NOTHING}</p>
          ) : (
            <dl className="grid gap-3">
              <div className="flex flex-col gap-1">
                <dt className="text-label">{SUMMARY_RECORDS}</dt>
                <dd data-summary-records="true" className="tabular text-body">
                  {String(summary.recordCount)}
                </dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-label">{SUMMARY_CHEMISTRIES}</dt>
                <dd className="text-body">{summary.chemistries.join(", ")}</dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-label">{SUMMARY_MASS}</dt>
                <dd data-summary-mass="true" className="tabular text-body">
                  {`${summary.massKg} kg${summary.massComplete ? "" : ` — ${SUMMARY_UNKNOWN_PART}`}`}
                </dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-label">{SUMMARY_ENERGY}</dt>
                <dd className="tabular text-body">
                  {`${summary.energyWh} Wh${summary.energyComplete ? "" : ` — ${SUMMARY_UNKNOWN_PART}`}`}
                </dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-label">{SUMMARY_DAMAGED}</dt>
                <dd
                  data-summary-damaged={summary.damagedRecordNumbers.join(",")}
                  className={cn(
                    "text-body",
                    summary.damagedRecordNumbers.length > 0 &&
                      INTENT_TEXT_CLASSES.critical,
                  )}
                >
                  {summary.damagedRecordNumbers.length === 0
                    ? SUMMARY_NO_DAMAGED
                    : summary.damagedRecordNumbers.join(", ")}
                </dd>
              </div>
            </dl>
          )}
        </SectionCard>

        {voids ? (
          <div className="flex flex-col gap-2" data-void-reason-field="true">
            <p className="max-w-[72ch] text-body-strong">
              {VOIDS_PAPER_NOTICE}
            </p>
            <Label htmlFor={reasonId} className="text-label">
              {VOID_REASON_LABEL}
            </Label>
            <Textarea
              id={reasonId}
              value={reason}
              aria-required="true"
              onChange={(event) => setReason(event.target.value)}
              className="min-h-16 rounded-md text-body"
              data-void-reason="true"
            />
          </div>
        ) : null}

        {error === null ? null : (
          <InlineActionError
            message={error}
            dataAttribute="data-contents-error"
          />
        )}

        <ReviewButton
          pending={pending}
          pendingLabel={SAVING}
          gatedReason={gatedReason}
          onPress={() => void proceed()}
          data-contents-continue="true"
        >
          {shipment === null ? CONTINUE : SAVE_CONTENTS}
        </ReviewButton>
      </div>
    </div>
  );
}

/**
 * One source row — a lot, a container or a battery — with its checkbox and,
 * where it would refuse, the reason. A refused row is readable and
 * `aria-disabled`, never `disabled`, so the reason stays reachable.
 */
function SourceRow({
  id,
  code,
  heading,
  detail,
  admission,
  isSelected,
  onToggle,
  extra = null,
  dataAttributes,
}: {
  readonly id: string;
  readonly code: string;
  readonly heading: string;
  readonly detail: readonly string[];
  readonly admission:
    | { readonly ok: true }
    | { readonly ok: false; readonly reason: string; readonly message: string };
  readonly isSelected: boolean;
  readonly onToggle: () => void;
  readonly extra?: ReactElement | null;
  readonly dataAttributes: Readonly<Record<`data-${string}`, string>>;
}): ReactElement {
  const refused = !admission.ok;
  const inert = refused && !isSelected;
  return (
    <li
      {...dataAttributes}
      data-admission={admission.ok ? "ok" : admission.reason}
      data-selected={isSelected ? "true" : "false"}
      className={cn(
        "flex gap-3 rounded-md border border-border p-3",
        isSelected && "border-primary",
      )}
    >
      <div className="flex min-h-11 items-start pt-1">
        <Checkbox
          id={id}
          checked={isSelected}
          aria-disabled={inert ? "true" : undefined}
          aria-describedby={refused ? `${id}-reason` : undefined}
          onCheckedChange={onToggle}
          className={cn(inert && "opacity-60")}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Label
          htmlFor={id}
          className="flex flex-wrap items-baseline gap-x-2 text-body"
        >
          <span className="font-mono text-body-strong">{code}</span>
          <span>{heading}</span>
        </Label>
        {detail.length === 0 ? null : (
          <p className="text-caption text-muted-foreground">
            {detail.join(" · ")}
          </p>
        )}
        {admission.ok ? null : (
          <p
            id={`${id}-reason`}
            data-admission-reason="true"
            className={cn(
              "max-w-[72ch] text-body",
              INTENT_TEXT_CLASSES.critical,
            )}
          >
            {admission.message}
          </p>
        )}
        {extra}
      </div>
    </li>
  );
}
