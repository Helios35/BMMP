import type { ReactElement } from "react";
import { CircleAlert, TriangleAlert } from "lucide-react";

import { SectionCard } from "@/components/page";
import { INTENT_SURFACE_CLASSES } from "@/components/status/intent-classes";
import { StatusBadge } from "@/components/status/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import type {
  ClassificationMissingInput,
  ClassificationResult,
} from "@/domain/classification/waste-stream";
import type { AppliedRuleVersion } from "@/domain/rules/outcome";
import type { ClassificationBasisCode } from "@/domain/taxonomy/classification-basis-code";
import { CLASSIFICATION_BASIS_CODE_LABELS } from "@/domain/taxonomy/classification-basis-code";
import { labelFor } from "@/domain/taxonomy/lookup";
import { ROLE_LABELS } from "@/domain/taxonomy/role";
import { snapshotEntries } from "@/features/battery-record/json-text";
import { SnapshotList } from "@/features/battery-record/record-display";
import { cn } from "@/lib/utils";
import type { JsonObject } from "@/types/common";
import type { ClassificationDecision } from "@/types/documents";

/**
 * `ClassificationOutcome` — the classification, **with its recorded reasoning
 * shown rather than hidden behind a disclosure** (Rule 3.7; `UX_SPEC.md`
 * §3.7, E-13, E-14).
 *
 * One component, two inputs. `/batteries/[id]` hands it the recorded
 * `classification_decision` rows; `/batteries/new` step 3 hands it the
 * `ClassificationResult` the domain computed for the draft, as a preview.
 * Both render the outcome badge, the basis codes, the reasoning paragraph, the
 * inputs snapshot and every rule version that applied with the citation each
 * carried — the trail that survives an audit. A preview says it is one and
 * that nothing is recorded until the battery is logged.
 *
 * **Blocked is stated, never defaulted.** Where no decision exists, or the
 * preview could not be completed, the card names **what is missing and who can
 * supply it** (Rules 3.4, 3.10; E-13). There is no fallback jurisdiction, no
 * assumed federal baseline, no default threshold and no placeholder citation.
 *
 * Extracted from `overview-tab.tsx`'s private `ClassificationCard` and
 * `ManifestGap`; the recorded-decision markup and its data attributes
 * (`data-classification-state`, `data-manifest-gap`, `data-applied-rule`) are
 * unchanged, because the e2e sweeps read them.
 *
 * Server-safe: no hooks, no client boundary.
 */

export type ClassificationOutcomeProps =
  | { readonly decisions: readonly ClassificationDecision[] }
  | {
      readonly preview: ClassificationResult;
      /** The site's jurisdiction, named — never the organisation's (Rule 3.5). */
      readonly jurisdictionLabel: string;
    };

const TITLE = "Classification outcome";

/** E-13 — who can supply a missing jurisdiction profile or rule version. */
const WHO_CAN_SUPPLY_RULE = `A ${ROLE_LABELS.facility_manager} or a ${ROLE_LABELS.platform_admin} can supply what is missing.`;

/** Rules 3.3, 3.4 — who confirms a chemistry, in the domain's own words. */
const WHO_CAN_CONFIRM_CHEMISTRY = `A ${ROLE_LABELS.compliance_handler} or a ${ROLE_LABELS.facility_manager} must confirm chemistry before this record can be classified.`;

const MISSING_INPUT_TEXT: Readonly<Record<ClassificationMissingInput, string>> =
  {
    jurisdiction_profile:
      "No classification can be made: this site has no jurisdiction profile.",
    rule_version:
      "No classification can be made: no rule version for waste-stream classification is in force for this site's jurisdiction.",
  };

const PREVIEW_NOTE =
  "Preview — nothing is recorded until you confirm and log the battery.";

export function ClassificationOutcome(
  props: ClassificationOutcomeProps,
): ReactElement {
  if ("decisions" in props) {
    return <RecordedDecisions decisions={props.decisions} />;
  }
  return (
    <Preview
      preview={props.preview}
      jurisdictionLabel={props.jurisdictionLabel}
    />
  );
}

/* ------------------------------------------------------------- recorded */

function RecordedDecisions({
  decisions,
}: {
  readonly decisions: readonly ClassificationDecision[];
}): ReactElement {
  if (decisions.length === 0) {
    return (
      <SectionCard title={TITLE}>
        <Alert
          role="status"
          data-classification-state="blocked"
          className={cn(INTENT_SURFACE_CLASSES.attention, "gap-2")}
        >
          <TriangleAlert aria-hidden="true" />
          <AlertTitle className="text-body-strong text-balance">
            No classification has been recorded for this battery.
          </AlertTitle>
          <AlertDescription className="grid gap-2 text-body text-current">
            <p className="max-w-[72ch]">
              Classification runs once identification is confirmed, and it stops
              rather than assuming an answer when an input is missing.
            </p>
            <p className="max-w-[72ch] text-body-strong">
              {WHO_CAN_SUPPLY_RULE}
            </p>
          </AlertDescription>
        </Alert>
      </SectionCard>
    );
  }

  return (
    <SectionCard title={TITLE}>
      {decisions.map((decision) => (
        <OutcomeBody
          key={decision.id}
          wasteClassification={decision.wasteClassification}
          basisCodes={decision.basisCodes}
          reasoning={decision.reasoning}
          inputsSnapshot={decision.inputsSnapshot}
          trace={decision.evaluationTrace}
        />
      ))}
    </SectionCard>
  );
}

/* -------------------------------------------------------------- preview */

function Preview({
  preview,
  jurisdictionLabel,
}: {
  readonly preview: ClassificationResult;
  readonly jurisdictionLabel: string;
}): ReactElement {
  if (preview.kind === "unresolved") {
    return (
      <SectionCard title={TITLE}>
        <div
          data-classification-outcome="preview"
          data-classification-kind="unresolved"
          className="flex flex-col gap-4"
        >
          <JurisdictionLine label={jurisdictionLabel} />
          <Alert
            role="status"
            data-classification-state="blocked"
            data-missing-input={preview.missingInput}
            className={cn(INTENT_SURFACE_CLASSES.attention, "gap-2")}
          >
            <TriangleAlert aria-hidden="true" />
            <AlertTitle className="text-body-strong text-balance">
              {MISSING_INPUT_TEXT[preview.missingInput]}
            </AlertTitle>
            <AlertDescription className="grid gap-2 text-body text-current">
              <p className="max-w-[72ch]">
                Classification stops rather than assuming an answer. No document
                can be generated while this holds.
              </p>
              <p className="max-w-[72ch] text-body-strong">
                {WHO_CAN_SUPPLY_RULE}
              </p>
            </AlertDescription>
          </Alert>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard title={TITLE}>
      <div
        data-classification-outcome="preview"
        data-classification-kind={preview.kind}
        className="flex flex-col gap-4"
      >
        <JurisdictionLine label={jurisdictionLabel} />
        {preview.kind === "blocked" ? (
          <Alert
            role="status"
            data-classification-state="blocked"
            data-missing-input="chemistry"
            className={cn(INTENT_SURFACE_CLASSES.attention, "gap-2")}
          >
            <TriangleAlert aria-hidden="true" />
            <AlertTitle className="text-body-strong text-balance">
              Classification is blocked: chemistry has not been confirmed.
            </AlertTitle>
            <AlertDescription className="grid gap-2 text-body text-current">
              <p className="max-w-[72ch] text-body-strong">
                {WHO_CAN_CONFIRM_CHEMISTRY}
              </p>
            </AlertDescription>
          </Alert>
        ) : null}
        <OutcomeBody
          wasteClassification={preview.outcome.result}
          basisCodes={preview.basisCodes}
          reasoning={preview.outcome.reasoning}
          inputsSnapshot={preview.outcome.inputsSnapshot}
          trace={preview.outcome.ruleVersionsApplied}
        />
        <p
          data-classification-preview-note="true"
          className="text-caption text-muted-foreground"
        >
          {PREVIEW_NOTE}
        </p>
      </div>
    </SectionCard>
  );
}

function JurisdictionLine({ label }: { readonly label: string }): ReactElement {
  return (
    <p data-classification-jurisdiction="true" className="text-body">
      <span className="text-label text-foreground">Jurisdiction</span>{" "}
      <span className="text-body-strong">{label}</span>
    </p>
  );
}

/* ----------------------------------------------------------------- body */

/**
 * The outcome and its reasoning trail. The markup is the recorded card's,
 * unchanged, so the preview and the record read the same way.
 */
function OutcomeBody({
  wasteClassification,
  basisCodes,
  reasoning,
  inputsSnapshot,
  trace,
}: {
  readonly wasteClassification: string;
  readonly basisCodes: readonly ClassificationBasisCode[];
  readonly reasoning: string;
  readonly inputsSnapshot: JsonObject;
  readonly trace: readonly AppliedRuleVersion[];
}): ReactElement {
  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge
          system="waste_classification"
          value={wasteClassification}
        />
        {basisCodes.map((code) => (
          <span key={code} className="text-caption text-muted-foreground">
            {labelFor(CLASSIFICATION_BASIS_CODE_LABELS, code)}
          </span>
        ))}
      </div>

      <p className="max-w-[72ch] text-body">{reasoning}</p>

      {wasteClassification === "fully_regulated" ? <ManifestGap /> : null}

      <div className="flex flex-col gap-2">
        <h3 className="text-label">Inputs the evaluation consumed</h3>
        <SnapshotList entries={snapshotEntries(inputsSnapshot)} />
      </div>

      <Separator />

      <div className="flex flex-col gap-2">
        <h3 className="text-label">Rule versions applied</h3>
        <ul className="grid gap-3">
          {trace.map((applied) => (
            <li
              key={applied.ruleVersionId}
              data-applied-rule={applied.ruleKey}
              className="grid gap-1"
            >
              <span className="text-body-strong">
                <span className="text-mono">{applied.ruleKey}</span>{" "}
                <span className="text-mono">{applied.versionLabel}</span>
              </span>
              {/* The citation is copied from the rule version, never written
                  into logic (Rule 1.23). */}
              <span className="text-body">{applied.citation}</span>
              <span className="text-caption text-muted-foreground">
                {applied.outcome}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * E-14 — a fully-regulated outcome carries a manifest obligation this phase does
 * not satisfy, and **the gap is stated rather than left silent** (Rules 3.11,
 * 3.12).
 *
 * No screen may present this record or a shipment carrying it as fully
 * documented.
 */
export function ManifestGap(): ReactElement {
  return (
    <Alert
      role="status"
      data-manifest-gap="true"
      className={cn(INTENT_SURFACE_CLASSES.attention, "gap-2")}
    >
      <CircleAlert aria-hidden="true" />
      <AlertTitle className="text-body-strong text-balance">
        This outcome carries a hazardous waste manifest obligation.
      </AlertTitle>
      <AlertDescription className="text-body text-current">
        <p className="max-w-[72ch]">
          BMMP does not produce a manifest, so this record is not fully
          documented by anything on this screen.
        </p>
      </AlertDescription>
    </Alert>
  );
}
