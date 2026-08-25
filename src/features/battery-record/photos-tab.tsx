import type { ReactElement, ReactNode } from "react";
import { ImageOff } from "lucide-react";

import { ConfidenceBandDisplay } from "@/components/confidence/confidence-band-display";
import { Field, FieldList } from "@/components/page";
import { StatusBadge } from "@/components/status/status-badge";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import { CHEMISTRIES, CHEMISTRY_LABELS } from "@/domain/taxonomy/chemistry";
import {
  INTAKE_PHOTO_TYPES,
  INTAKE_PHOTO_TYPE_LABELS,
} from "@/domain/taxonomy/intake-photo-type";
import {
  LABEL_FIELD_CODE_LABELS,
  type LabelFieldCode,
} from "@/domain/taxonomy/label-field-code";
import { labelFor, readTaxonomyValue } from "@/domain/taxonomy/lookup";
import type { BatteryRecord } from "@/types/battery-record";
import type { TimeZone } from "@/types/common";
import type { IntakePhoto, LabelExtraction } from "@/types/intake";
import type { TosAcceptance } from "@/types/tenancy";
import { absoluteInstant } from "./format-instant";
import { jsonText } from "./json-text";
import { DetailCard, NotRecorded, TaxonomyText } from "./record-display";
import { resolveUserNames } from "./user-names";

/**
 * `/batteries/[id]` — Photos & extraction. `UX_SPEC.md` §3.7.
 *
 * **Read-only after commit, for every role, in this unit and in every later
 * one.** A photograph and the reading taken from it are evidence; a re-read
 * appends a new run and never overwrites the previous one (T-10), which is why
 * this tab has no edit path at all rather than a disabled one.
 *
 * **The training-eligible state and the Terms of Service version in force when
 * each photo was captured render here** (Rules 7.16, 7.22), with the document's
 * content hash, so eligibility can be verified from outside the system rather
 * than trusted.
 *
 * ## The image itself does not render in this unit
 *
 * The mock's object store returns a `mock://` URL and no fixture bytes exist, so
 * an `img` would render broken. The card shows a labelled placeholder at the
 * photo's own aspect ratio instead. When the Supabase adapter lands,
 * `objects.signedUrl` returns a real URL and this same component renders the
 * image with **no screen change** — which is the seam working. A screen that had
 * to change for the swap would mean the seam leaked.
 */

const IMAGE_UNAVAILABLE = "Image not available on the mock adapter.";

const NO_PHOTOS = "No intake photos are linked to this record.";

export async function PhotosTab({
  ctx,
  record,
  timeZone,
}: {
  readonly ctx: RequestContext;
  readonly record: BatteryRecord;
  /** The site's zone, so a capture time is never read in the reader's (Rule 4.29). */
  readonly timeZone: TimeZone;
}): Promise<ReactElement> {
  const empty = { items: [], total: 0, cursor: null } as const;

  const [photos, extractions, acceptances] = await Promise.all([
    record.intakeSessionId === null
      ? Promise.resolve(empty)
      : data.intakePhotos.list(ctx, {
          intakeSessionId: record.intakeSessionId,
          limit: 50,
        }),
    record.intakeSessionId === null
      ? Promise.resolve(empty)
      : data.labelExtractions.list(ctx, {
          intakeSessionId: record.intakeSessionId,
          limit: 100,
        }),
    data.tosAcceptances.list(ctx, {
      documentKey: "terms_of_service",
      limit: 10,
    }),
  ]);

  if (photos.items.length === 0 && extractions.items.length === 0) {
    return (
      <DetailCard title="Photos & extraction">
        <p role="status" className="max-w-[72ch] text-body">
          {NO_PHOTOS}
        </p>
      </DetailCard>
    );
  }

  const names = await resolveUserNames(
    ctx,
    photos.items.map((photo) => photo.takenBy),
  );

  return (
    <div className="flex flex-col gap-6">
      <DetailCard
        title="Photos"
        description="Every photograph captured for this record, with the consent in force when it was taken."
      >
        <ul className="grid gap-4 md:grid-cols-2">
          {photos.items.map((photo) => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              takenByName={names.get(photo.takenBy)}
              acceptance={acceptanceInForceAt(acceptances.items, photo)}
              timeZone={timeZone}
            />
          ))}
        </ul>
      </DetailCard>

      <DetailCard
        title="Label extraction"
        description="One row per field per extraction run. A re-read appends a run; it never overwrites one."
      >
        <ExtractionTable rows={extractions.items} record={record} />
      </DetailCard>
    </div>
  );
}

/**
 * The acceptance that was in force when this photograph was taken.
 *
 * Newest acceptance whose `in_force_on` is on or before the capture date. A
 * photo with no capture time gets none rather than the current one: attributing
 * a record to the consent that happens to be live now is exactly the claim
 * Rule 7.22 exists to prevent.
 */
function acceptanceInForceAt(
  acceptances: readonly TosAcceptance[],
  photo: IntakePhoto,
): TosAcceptance | undefined {
  if (photo.capturedAt === null) return undefined;
  const capturedOn = photo.capturedAt.slice(0, 10);
  return acceptances
    .filter(
      (acceptance) =>
        acceptance.inForceOn !== null && acceptance.inForceOn <= capturedOn,
    )
    .sort((a, b) => (a.inForceOn ?? "").localeCompare(b.inForceOn ?? ""))
    .at(-1);
}

function PhotoCard({
  photo,
  takenByName,
  acceptance,
  timeZone,
}: {
  readonly photo: IntakePhoto;
  readonly takenByName: string | undefined;
  readonly acceptance: TosAcceptance | undefined;
  readonly timeZone: TimeZone;
}) {
  return (
    <li
      data-intake-photo={photo.id}
      className="flex flex-col gap-3 rounded-md border border-border p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-body-strong">
          <TaxonomyText
            system="intake_photo_type"
            read={readTaxonomyValue(
              INTAKE_PHOTO_TYPES,
              INTAKE_PHOTO_TYPE_LABELS,
              photo.photoType,
            )}
          />
        </span>
        <StatusBadge
          system="data_use_eligibility"
          value={photo.dataUseEligibility}
          size="sm"
        />
      </div>

      {/* The placeholder holds the photo's own aspect ratio so the card does not
          resize when real bytes arrive behind the same component. */}
      <div
        data-photo-placeholder="true"
        style={{ aspectRatio: `${photo.widthPx} / ${photo.heightPx}` }}
        className="flex w-full flex-col items-center justify-center gap-2 rounded-md border border-border bg-muted p-4"
      >
        <ImageOff aria-hidden="true" className="size-6" />
        <p className="max-w-[36ch] text-center text-caption">
          {IMAGE_UNAVAILABLE}
        </p>
      </div>

      <FieldList>
        <PhotoFact label="Dimensions">
          <span className="tabular">
            {photo.widthPx} &times; {photo.heightPx}
          </span>
        </PhotoFact>
        <PhotoFact label="Captured">
          {photo.capturedAt === null ? (
            <NotRecorded />
          ) : (
            absoluteInstant(photo.capturedAt, timeZone)
          )}
        </PhotoFact>
        <PhotoFact label="Taken by">{takenByName ?? <NotRecorded />}</PhotoFact>
        <PhotoFact label="Content hash">
          <span className="text-mono break-all">{photo.contentHash}</span>
        </PhotoFact>
        <PhotoFact label="EXIF">
          {photo.isExifStripped ? "Stripped" : "Retained"}
        </PhotoFact>
        {photo.cropGeometry === null ? null : (
          <PhotoFact label="Crop">
            <span className="text-mono">
              {photo.cropGeometry.x}, {photo.cropGeometry.y} &middot;{" "}
              {photo.cropGeometry.width} &times; {photo.cropGeometry.height} of{" "}
              {photo.cropGeometry.sourceWidth} &times;{" "}
              {photo.cropGeometry.sourceHeight}
            </span>
          </PhotoFact>
        )}
        <PhotoFact label="Terms in force at capture">
          {acceptance === undefined ? (
            <NotRecorded />
          ) : (
            <span className="flex flex-col gap-1">
              <span>{acceptance.documentVersion}</span>
              <span className="text-mono break-all">
                {acceptance.documentContentHash}
              </span>
            </span>
          )}
        </PhotoFact>
      </FieldList>
    </li>
  );
}

/**
 * One fact about a photo.
 *
 * It was a fourth field grammar — a `display: contents` two-column grid, label
 * left, value right — for the same information the record, the catalog entry and
 * both settings screens all render. It is `Field` now, so a field reads the same
 * way wherever a reader meets one.
 */
function PhotoFact({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return <Field label={label}>{children}</Field>;
}

/**
 * The per-field reading, and the value that was confirmed against it.
 *
 * **The confirmed value is read from the record itself.** `label_extraction`
 * stores what a model read; confirmation is per field and lands on the
 * `battery_record` column the field feeds, so the pair shown here is *what was
 * read* beside *what the record now holds*. There is no confirmed-value column
 * to read instead — see this unit's build-notes.
 *
 * **No threshold renders anywhere.** `ConfidenceBandDisplay` shows the band, the
 * provider's own score and whether the field is hard-gated, and no cutoff value
 * exists anywhere in `src/` (D-22).
 */
function ExtractionTable({
  rows,
  record,
}: {
  readonly rows: readonly LabelExtraction[];
  readonly record: BatteryRecord;
}) {
  if (rows.length === 0) {
    return (
      <p role="status" className="max-w-[72ch] text-body">
        No label reading is linked to this record.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableCaption className="sr-only">
          Label extraction, field by field
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col" className="h-11 px-3 text-label">
              Field
            </TableHead>
            <TableHead scope="col" className="h-11 px-3 text-label">
              Read from the label
            </TableHead>
            <TableHead scope="col" className="h-11 px-3 text-label">
              Confirmed on the record
            </TableHead>
            <TableHead scope="col" className="h-11 px-3 text-label">
              Confidence
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} data-field-code={row.fieldCode}>
              <TableCell className="px-3 py-2 text-body-strong">
                {labelFor(LABEL_FIELD_CODE_LABELS, row.fieldCode)}
              </TableCell>
              <TableCell className="px-3 py-2 text-body">
                {row.fieldValue ?? <NotRecorded />}
                {row.rawText === null ? null : (
                  // The characters the model reported are retained for a person
                  // to judge, even where nothing was accepted (Rule 2.12).
                  <span className="block text-mono text-muted-foreground">
                    {row.rawText}
                  </span>
                )}
              </TableCell>
              <TableCell className="px-3 py-2 text-body">
                {confirmedValue(record, row.fieldCode) ?? <NotRecorded />}
              </TableCell>
              <TableCell className="px-3 py-2">
                <ConfidenceBandDisplay
                  band={row.confidenceBand}
                  rawConfidence={row.rawConfidence}
                  isHardGated={row.isHardGated}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** The record column each T-09 field feeds, once a person has confirmed it. */
function confirmedValue(
  record: BatteryRecord,
  fieldCode: LabelFieldCode,
): string | null {
  switch (fieldCode) {
    case "manufacturer":
      return record.manufacturerName;
    case "model":
      return record.modelName;
    case "chemistry_code": {
      if (record.chemistry === null) return null;
      const read = readTaxonomyValue(
        CHEMISTRIES,
        CHEMISTRY_LABELS,
        record.chemistry,
      );
      return read.recognised ? read.label : read.storedValue;
    }
    case "voltage":
      return record.nominalVoltageV;
    case "capacity_ah":
      return record.ratedCapacityAh;
    case "energy_wh":
      return record.ratedEnergyWh;
    case "date_code":
      return record.dateCodeRaw;
    case "serial_number":
      return record.serialNumber;
    case "certification_marks":
      return record.certificationMarks === null
        ? null
        : jsonText(record.certificationMarks);
    case "transport_test_marking":
      return record.un383TestSummaryRef;
    case "assessed_condition":
      return record.assessedCondition;
  }
}
