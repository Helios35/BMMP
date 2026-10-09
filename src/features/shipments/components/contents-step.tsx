"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useState, type ReactElement } from "react";

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
  CONTENTS_DESCRIPTION,
  CONTENTS_TITLE,
  CONTINUE,
  SAVE_CONTENTS,
  SAVING,
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
import type { ShipmentCandidate } from "../server/candidates";

/**
 * Step 1, **Contents** — `UX_SPEC.md` §3.12; Flow B1; Rules 5.2, 5.24, 5.25.
 *
 * Every container is listed with the reason it would refuse — the domain's
 * admission, computed on the server — and a refused one cannot be chosen.
 * **Mixing sites, putting a record on a second open shipment, an unlabeled or
 * mislabeled container, and a damaged record onto an air shipment are blocked
 * here**, at assembly, and the adapter refuses each again at commit.
 *
 * The live summary adds up only what the rows carry — record count,
 * chemistries, mass and energy where known — and **names every damaged,
 * defective or recalled record**.
 *
 * On an issued shipment, changing the contents **voids the paper** (Rule
 * 5.13), so the change needs a stated reason (Rule 5.14) before it is sent.
 */

export interface ContentsStepProps {
  readonly candidates: readonly ShipmentCandidate[];
  readonly initialSelection: readonly string[];
  /** Null while the shipment is not yet written — a new shipment's step 1. */
  readonly shipment: {
    readonly id: string;
    readonly paperIssued: boolean;
  } | null;
}

const SITE_MISMATCH =
  "These containers are at different sites. A shipment leaves from one site (Rule 5.2).";

export function ContentsStep({
  candidates,
  initialSelection,
  shipment,
}: ContentsStepProps): ReactElement {
  const router = useRouter();
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(initialSelection),
  );
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reasonId = useId();

  const chosen = candidates.filter((candidate) => selected.has(candidate.id));
  const summary = useMemo(
    () =>
      summarizeShipmentContents(
        candidates
          .filter((candidate) => selected.has(candidate.id))
          .flatMap((candidate) => candidate.records),
      ),
    [candidates, selected],
  );
  const sites = new Set(chosen.map((candidate) => candidate.siteKey));
  const changed =
    chosen.length !== initialSelection.length ||
    chosen.some((candidate) => !initialSelection.includes(candidate.id));
  const voids = shipment !== null && shipment.paperIssued && changed;

  const gatedReason =
    chosen.length === 0 && shipment === null
      ? STEP_LOCKED_SELECT
      : sites.size > 1
        ? SITE_MISMATCH
        : voids && reason.trim() === ""
          ? VOID_REASON_REQUIRED
          : null;

  function toggle(candidate: ShipmentCandidate): void {
    const isSelected = selected.has(candidate.id);
    // A refused container may be taken off, never put on.
    if (!isSelected && !candidate.admission.ok) return;
    const next = new Set(selected);
    if (isSelected) next.delete(candidate.id);
    else next.add(candidate.id);
    setSelected(next);
    setError(null);
  }

  async function proceed(): Promise<void> {
    if (pending || gatedReason !== null) return;
    const ids = chosen.map((candidate) => candidate.id);
    if (shipment === null) {
      router.push(
        `/shipments/new?step=2&containers=${encodeURIComponent(ids.join(","))}`,
      );
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
        containerIds: ids,
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
      <SectionCard
        title={CONTENTS_TITLE}
        description={CONTENTS_DESCRIPTION}
        dataAttributes={{
          "data-shipment-candidates": String(candidates.length),
        }}
      >
        <ul className="grid gap-2">
          {candidates.map((candidate) => {
            const isSelected = selected.has(candidate.id);
            const refused = !candidate.admission.ok;
            const inert = refused && !isSelected;
            const checkboxId = `candidate-${candidate.id}`;
            return (
              <li
                key={candidate.id}
                data-candidate={candidate.id}
                data-candidate-code={candidate.code}
                data-admission={
                  candidate.admission.ok ? "ok" : candidate.admission.reason
                }
                data-selected={isSelected ? "true" : "false"}
                className={cn(
                  "flex gap-3 rounded-md border border-border p-3",
                  isSelected && "border-primary",
                )}
              >
                <div className="flex min-h-11 items-start pt-1">
                  <Checkbox
                    id={checkboxId}
                    checked={isSelected}
                    aria-disabled={inert ? "true" : undefined}
                    aria-describedby={
                      refused ? `${checkboxId}-reason` : undefined
                    }
                    onCheckedChange={() => toggle(candidate)}
                    className={cn(inert && "opacity-60")}
                  />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <Label
                    htmlFor={checkboxId}
                    className="flex flex-wrap items-baseline gap-x-2 text-body"
                  >
                    <span className="font-mono text-body-strong">
                      {candidate.code}
                    </span>
                    <span>{candidate.typeLabel}</span>
                  </Label>
                  <p className="text-caption text-muted-foreground">
                    {[
                      ...new Set(
                        [
                          candidate.location,
                          `${candidate.records.length} ${candidate.records.length === 1 ? "record" : "records"}`,
                          candidate.fillText,
                          candidate.clockTier,
                          candidate.statusLabel,
                        ].filter((part): part is string => part !== null),
                      ),
                    ].join(" · ")}
                  </p>
                  {candidate.admission.ok ? null : (
                    <p
                      id={`${checkboxId}-reason`}
                      data-admission-reason="true"
                      className={cn(
                        "max-w-[72ch] text-body",
                        INTENT_TEXT_CLASSES.critical,
                      )}
                    >
                      {candidate.admission.message}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </SectionCard>

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
