import Link from "next/link";
import type { ReactElement } from "react";
import { CircleAlert, TriangleAlert } from "lucide-react";

import { FieldList } from "@/components/page";
import { FieldSourceBadge } from "@/components/provenance/field-source-badge";
import { INTENT_SURFACE_CLASSES } from "@/components/status/intent-classes";
import { StatusBadge } from "@/components/status/status-badge";
import { StorageClockMeter } from "@/components/storage/storage-clock-meter";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import { canReadRoute } from "@/domain/access/route-capability";
import { APPLICATION_CLASS_LABELS } from "@/domain/taxonomy/application-class";
import { ASSEMBLY_LEVEL_LABELS } from "@/domain/taxonomy/assembly-level";
import {
  CELL_FORM_FACTORS,
  CELL_FORM_FACTOR_LABELS,
} from "@/domain/taxonomy/cell-form-factor";
import { CHEMISTRIES, CHEMISTRY_LABELS } from "@/domain/taxonomy/chemistry";
import { CLASSIFICATION_BASIS_CODE_LABELS } from "@/domain/taxonomy/classification-basis-code";
import { DATE_CODE_PRECISION_LABELS } from "@/domain/taxonomy/date-code-precision";
import { labelFor, readTaxonomyValue } from "@/domain/taxonomy/lookup";
import { ROLE_LABELS } from "@/domain/taxonomy/role";
import type { BatteryRecord } from "@/types/battery-record";
import type { IsoTimestamp } from "@/types/common";
import type { ClassificationDecision } from "@/types/documents";
import type { DateCodeDecode } from "@/types/intake";
import { cn } from "@/lib/utils";
import {
  chemistryFieldSource,
  fieldSourceFor,
  FORM_FACTOR_SOURCE,
  manufactureDateSource,
  type FieldSourceInput,
} from "./field-source";
import { absoluteInstant, civilDateLabel } from "./format-instant";
import { jsonText, snapshotEntries } from "./json-text";
import {
  DetailCard,
  FieldRow,
  NotRecorded,
  SnapshotList,
  TaxonomyText,
} from "./record-display";
import { resolveUserNames } from "./user-names";

/**
 * `/batteries/[id]` — Overview. `UX_SPEC.md` §3.7.
 *
 * **Every value shows where it came from, and the source is retained and
 * visible** — never behind a disclosure. On an audit this is the column that
 * answers *"how do you know that"*, and a provenance a reader has to open is a
 * provenance nobody reads.
 *
 * ## Two things this tab deliberately does not render
 *
 * **No `[B2]` hazard surface.** The slot is reserved and renders literally
 * nothing — no heading, no placeholder, no empty card, no "coming soon". A
 * reserved slot that renders a placeholder is a surface, and when the ranking
 * does arrive it is a relative ranking with a stated basis per factor and never
 * a probability, percentage, likelihood or chance of anything (Rule 1.25,
 * `_ANCHORS.md` §7.1).
 *
 * **No format band, and no single organisation-wide size or format value.**
 * `BATTERY.mobilityScooter` is `medium_format` under Washington and
 * `not_covered` under federal scope — the same battery, two answers — so any
 * single value rendered here would be false for one of them
 * (`SITE_ARCHITECTURE.md` §7.6b). `formatClassifications` is not called from
 * this route.
 */

export async function OverviewTab({
  ctx,
  record,
  asOf,
}: {
  readonly ctx: RequestContext;
  readonly record: BatteryRecord;
  readonly asOf: IsoTimestamp;
}): Promise<ReactElement> {
  const [catalog, decisions, decodes, container, extractions] =
    await Promise.all([
      record.catalogEntryId === null
        ? Promise.resolve(null)
        : data.catalogEntries.get(ctx, record.catalogEntryId),
      data.classificationDecisions.list(ctx, {
        batteryRecordId: record.id,
        status: "active",
        limit: 5,
      }),
      record.dateCodeDecodeId === null
        ? Promise.resolve([])
        : data.dateCodeDecodes
            .list(ctx, { batteryRecordId: record.id, limit: 5 })
            .then((page) => page.items),
      record.containerId === null
        ? Promise.resolve(null)
        : data.containers.get(ctx, record.containerId),
      // The field sources need to know which label fields were actually read.
      record.intakeSessionId === null
        ? Promise.resolve([])
        : data.labelExtractions
            .list(ctx, {
              intakeSessionId: record.intakeSessionId,
              limit: 100,
            })
            .then((page) => page.items),
    ]);

  const clock =
    container === null
      ? undefined
      : (
          await data.storageClocks.list(ctx, {
            containerId: container.id,
            limit: 1,
          })
        ).items[0];

  const names = await resolveUserNames(ctx, [record.conditionConfirmedBy]);

  const sourceInput: FieldSourceInput = {
    extractedFieldCodes: new Set(
      extractions
        .filter((row) => row.fieldValue !== null)
        .map((row) => row.fieldCode),
    ),
    hasCatalogMatch: catalog !== null,
  };

  const decode = decodes.find((row) => row.id === record.dateCodeDecodeId);

  return (
    <div className="flex flex-col gap-6">
      <DetailCard title="Identity">
        <FieldList>
          <FieldRow
            label="Manufacturer"
            source={
              <FieldSourceBadge
                source={fieldSourceFor("manufacturerName", sourceInput)}
              />
            }
          >
            {record.manufacturerName ?? <NotRecorded />}
          </FieldRow>

          <FieldRow
            label="Model"
            source={
              <FieldSourceBadge
                source={fieldSourceFor("modelName", sourceInput)}
              />
            }
          >
            {record.modelName ?? <NotRecorded />}
          </FieldRow>

          <FieldRow
            label="Part number"
            source={
              <FieldSourceBadge
                source={fieldSourceFor("partNumber", sourceInput)}
              />
            }
          >
            {record.partNumber === null ? (
              <NotRecorded />
            ) : (
              <span className="text-mono">{record.partNumber}</span>
            )}
          </FieldRow>

          <FieldRow
            label="Serial number"
            source={
              <FieldSourceBadge
                source={fieldSourceFor("serialNumber", sourceInput)}
              />
            }
          >
            {record.serialNumber === null ? (
              <NotRecorded />
            ) : (
              <span className="text-mono break-all">{record.serialNumber}</span>
            )}
          </FieldRow>

          <ChemistryRow record={record} />

          <FieldRow
            label="Form factor"
            source={<FieldSourceBadge source={FORM_FACTOR_SOURCE} />}
          >
            <TaxonomyText
              system="cell_form_factor"
              read={readTaxonomyValue(
                CELL_FORM_FACTORS,
                CELL_FORM_FACTOR_LABELS,
                record.cellFormFactor,
              )}
            />
          </FieldRow>

          <ManufactureDateRow record={record} decode={decode} />

          <FieldRow
            label="Assessed condition"
            source={
              <FieldSourceBadge
                source="entered_by"
                enteredByName={
                  record.conditionConfirmedBy === null
                    ? undefined
                    : names.get(record.conditionConfirmedBy)
                }
              />
            }
            note={
              record.conditionConfirmedAt === null || container === null
                ? undefined
                : absoluteInstant(
                    record.conditionConfirmedAt,
                    container.siteTimeZone,
                  )
            }
          >
            <StatusBadge
              system="assessed_condition"
              value={record.assessedCondition}
            />
          </FieldRow>
        </FieldList>
      </DetailCard>

      <DetailCard
        title="Specification"
        description="Units are the field's own. Nothing here is inferred from a number."
      >
        <FieldList>
          <FieldRow
            label="Nominal voltage"
            source={
              <FieldSourceBadge
                source={fieldSourceFor("nominalVoltageV", sourceInput)}
              />
            }
          >
            <Measure value={record.nominalVoltageV} unit="V" />
          </FieldRow>
          <FieldRow
            label="Rated capacity"
            source={
              <FieldSourceBadge
                source={fieldSourceFor("ratedCapacityAh", sourceInput)}
              />
            }
          >
            <Measure value={record.ratedCapacityAh} unit="Ah" />
          </FieldRow>
          <FieldRow
            label="Rated energy"
            source={
              <FieldSourceBadge
                source={fieldSourceFor("ratedEnergyWh", sourceInput)}
              />
            }
          >
            <Measure value={record.ratedEnergyWh} unit="Wh" />
          </FieldRow>
          <FieldRow label="Mass">
            <Measure value={record.batteryMassKg} unit="kg" />
          </FieldRow>
          <FieldRow label="Application class">
            {labelFor(APPLICATION_CLASS_LABELS, record.applicationClass)}
          </FieldRow>
          <FieldRow label="Assembly level">
            {labelFor(ASSEMBLY_LEVEL_LABELS, record.assemblyLevel)}
          </FieldRow>
          <FieldRow label="Cell count">
            <Count value={record.cellCount} />
          </FieldRow>
          <FieldRow label="Module count">
            <Count value={record.moduleCount} />
          </FieldRow>
          <FieldRow label="Certification marks">
            {record.certificationMarks === null ? (
              <NotRecorded />
            ) : (
              jsonText(record.certificationMarks)
            )}
          </FieldRow>
          <FieldRow label="UN 38.3 test summary">
            <Un383 record={record} />
          </FieldRow>
        </FieldList>
      </DetailCard>

      <ClassificationCard decisions={decisions.items} />

      <DetailCard title="Placement and clock">
        <FieldList>
          <FieldRow label="Container">
            {container === null ? (
              <NotRecorded />
            ) : canReadRoute(ctx.role, "/containers/[id]") ? (
              <Link
                href={`/containers/${container.id}`}
                data-inline-target="true"
                className="rounded-md underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
              >
                {container.containerCode}
              </Link>
            ) : (
              container.containerCode
            )}
          </FieldRow>
          <FieldRow label="Storage location">
            {container?.storageLocation ?? <NotRecorded />}
          </FieldRow>
          {clock !== undefined && container !== null ? null : (
            <FieldRow label="Storage clock">
              <NotRecorded />
            </FieldRow>
          )}
        </FieldList>
        {/* Outside the field list rather than inside it: a `<dl>` holds
            label-and-value pairs, and the meter is neither. */}
        {clock !== undefined && container !== null ? (
          <StorageClockMeter
            clock={clock}
            asOf={asOf}
            label={`Storage clock for container ${container.containerCode}`}
          />
        ) : null}
      </DetailCard>

      {/* [B2] hazard_ranking — the slot, reserved. When it arrives it is a
          relative ranking with a stated basis per factor, and the shape it may
          never take is Rule 1.25 and _ANCHORS.md §7.1. B1a renders nothing here:
          no heading, no placeholder, no "coming soon", no empty card. */}
    </div>
  );
}

/**
 * Chemistry, and its two permitted sources.
 *
 * Where the stored `chemistry_source` is not a value T-54 defines, **no source
 * badge renders at all** and the stored string is shown beside the field. That
 * is the deliberate choice: guessing a chemistry provenance is the exact failure
 * `_ANCHORS.md` §7.2 exists to stop, and every battery fixture takes this path
 * today.
 */
function ChemistryRow({ record }: { readonly record: BatteryRecord }) {
  const source = chemistryFieldSource(record.chemistrySource);
  return (
    <FieldRow
      label="Chemistry"
      source={
        source === null ? undefined : <FieldSourceBadge source={source} />
      }
      note={
        source === null && record.chemistrySource !== null ? (
          <span className="text-mono">{record.chemistrySource}</span>
        ) : undefined
      }
    >
      <TaxonomyText
        system="chemistry"
        read={
          record.chemistry === null
            ? null
            : readTaxonomyValue(CHEMISTRIES, CHEMISTRY_LABELS, record.chemistry)
        }
      />
    </FieldRow>
  );
}

/**
 * The manufacture date, with the raw code beside it.
 *
 * A decode that produced nothing renders **Undecodable** and never an
 * approximate date (Rule 2.24). The raw characters stay visible so a person can
 * judge them, which is the whole reason the raw code is stored.
 */
function ManufactureDateRow({
  record,
  decode,
}: {
  readonly record: BatteryRecord;
  readonly decode: DateCodeDecode | undefined;
}) {
  const decoded = decode?.decodedManufacturedOn ?? record.manufacturedOn;
  const precision = decode?.decodedPrecision ?? null;

  return (
    <FieldRow
      label="Manufacture date"
      source={<FieldSourceBadge source={manufactureDateSource(record)} />}
      note={
        record.dateCodeRaw === null ? undefined : (
          <span>
            Date code <span className="text-mono">{record.dateCodeRaw}</span>
            {precision === null
              ? null
              : ` · ${labelFor(DATE_CODE_PRECISION_LABELS, precision)}`}
          </span>
        )
      }
    >
      {decoded === null ? (
        decode === undefined ? (
          <NotRecorded />
        ) : (
          <span data-decode-state="undecodable">Undecodable</span>
        )
      ) : (
        civilDateLabel(decoded)
      )}
    </FieldRow>
  );
}

/**
 * The classification outcome, **with its recorded reasoning shown rather than
 * hidden behind a disclosure** (Rule 3.7).
 *
 * The reasoning trail is what survives an audit: the inputs the evaluation
 * consumed, every rule version that applied and the citation each carried, all
 * frozen at decision time. It is not a detail view.
 *
 * Where no decision exists the card states **what is missing and who can supply
 * it**, by name. Classification blocks rather than defaults — there is no
 * fallback jurisdiction, no assumed federal baseline, no default threshold and
 * no placeholder citation (Rules 3.4, 3.10; E-13).
 */
function ClassificationCard({
  decisions,
}: {
  readonly decisions: readonly ClassificationDecision[];
}) {
  if (decisions.length === 0) {
    return (
      <DetailCard title="Classification outcome">
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
              {`A ${ROLE_LABELS.facility_manager} or a ${ROLE_LABELS.platform_admin} can supply what is missing.`}
            </p>
          </AlertDescription>
        </Alert>
      </DetailCard>
    );
  }

  return (
    <DetailCard title="Classification outcome">
      {decisions.map((decision) => (
        <div key={decision.id} className="flex flex-col gap-4 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              system="waste_classification"
              value={decision.wasteClassification}
            />
            {decision.basisCodes.map((code) => (
              <span key={code} className="text-caption text-muted-foreground">
                {labelFor(CLASSIFICATION_BASIS_CODE_LABELS, code)}
              </span>
            ))}
          </div>

          <p className="max-w-[72ch] text-body">{decision.reasoning}</p>

          {decision.wasteClassification === "fully_regulated" ? (
            <ManifestGap />
          ) : null}

          <div className="flex flex-col gap-2">
            <h3 className="text-label">Inputs the evaluation consumed</h3>
            <SnapshotList entries={snapshotEntries(decision.inputsSnapshot)} />
          </div>

          <Separator />

          <div className="flex flex-col gap-2">
            <h3 className="text-label">Rule versions applied</h3>
            <ul className="grid gap-3">
              {decision.evaluationTrace.map((applied) => (
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
      ))}
    </DetailCard>
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
function ManifestGap() {
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

/**
 * A stored measurement and the unit its own column names.
 *
 * **The unit comes from the field, never from the value.** `rated_energy_wh` is
 * watt-hours because the column says so; nothing here infers a unit from a
 * magnitude, and no threshold, period or limit is a literal anywhere on this
 * screen (Rule 1.23).
 */
function Measure({
  value,
  unit,
}: {
  readonly value: string | null;
  readonly unit: string;
}) {
  if (value === null) return <NotRecorded />;
  return (
    <span className="tabular">
      {value} {unit}
    </span>
  );
}

function Count({ value }: { readonly value: number | null }) {
  if (value === null) return <NotRecorded />;
  return <span className="tabular">{value}</span>;
}

function Un383({ record }: { readonly record: BatteryRecord }) {
  if (record.un383TestSummaryRef !== null) {
    return <span className="text-mono">{record.un383TestSummaryRef}</span>;
  }
  if (record.hasUn383Summary === null) return <NotRecorded />;
  return <span>{record.hasUn383Summary ? "On file" : "Not on file"}</span>;
}
