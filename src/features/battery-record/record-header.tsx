import Link from "next/link";
import type { ReactElement, ReactNode } from "react";
import { Printer, RotateCcw } from "lucide-react";

import { ACTION_BUTTON_CLASS, PageHeader } from "@/components/page";
import { StatusBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { canReadRoute } from "@/domain/access/route-capability";
import { CHEMISTRIES, CHEMISTRY_LABELS } from "@/domain/taxonomy/chemistry";
import { readTaxonomyValue } from "@/domain/taxonomy/lookup";
import type { RoleCode } from "@/domain/taxonomy/role";
import type { BatteryRecord } from "@/types/battery-record";
import type { Container, StorageClock } from "@/types/storage";
import { CopyButton } from "./copy-button";
import { NotRecorded, TaxonomyText } from "./record-display";

/**
 * The header of `/batteries/[id]` — `UX_SPEC.md` §3.7.
 *
 * Record ID, manufacturer and model, chemistry, assessed condition, the
 * container and the storage clock tier: the six facts that tell a reader they
 * have the right battery before they read anything else.
 *
 * **The container link renders only where the role can open a container**
 * (§5.4). For P3, P4 and P5 the code renders as text — no link, no cursor
 * change, nothing suggesting a page they will be redirected away from
 * (§5.3(7)).
 *
 * **Print documents is never disabled, for any role including the auditor**
 * (Rule 5.27, E-8a). Every render touching this record is on the Documents tab,
 * each linking to its own `/documents/[id]`, so the control opens the tab rather
 * than guessing which of several documents a reader meant.
 *
 * **Resume intake** renders only where the page has resolved an href for it:
 * the record is still a draft or pending review, its intake session is open,
 * and the role holds `write` on `/batteries/new` (Flow A-a). Every one of
 * those is the page's decision; this header renders the link it is given and
 * nothing for the roles it is not.
 */

export function RecordHeader({
  record,
  container,
  clock,
  role,
  documentsHref,
  resumeIntakeHref = null,
  breadcrumbs,
  notice,
}: {
  readonly record: BatteryRecord;
  readonly container: Container | null;
  readonly clock: StorageClock | undefined;
  readonly role: RoleCode;
  readonly documentsHref: string;
  /** `/batteries/new?session=…&step=…` while the intake is still open and the role may write it. */
  readonly resumeIntakeHref?: string | null;
  readonly breadcrumbs?: ReactNode;
  /** The read-only banner, the hard block and the gated controls (§2.9). */
  readonly notice?: ReactNode;
}): ReactElement {
  return (
    <PageHeader
      breadcrumbs={breadcrumbs}
      title={
        // `font-mono` rather than the `text-mono` token: the token carries its
        // own size, and this heading is `h1` / `display` (§1.3).
        <span className="font-mono tabular-nums">{record.recordNumber}</span>
      }
      // §1.3 — every ID sits beside a copy button at a 44px target. Outside the
      // `h1`, so the heading's accessible name stays the record number.
      titleAdornment={
        <CopyButton value={record.recordNumber} label="record ID" />
      }
      // A value, not helper text: this is the line a handler reads to confirm
      // they have the right battery, so it is never muted (§1.2 Rule 3).
      subtitle={
        <>
          {record.manufacturerName ?? <NotRecorded />}
          {record.modelName === null ? null : ` · ${record.modelName}`}
        </>
      }
      action={
        <Button
          asChild
          variant="outline"
          size="lg"
          className={ACTION_BUTTON_CLASS}
        >
          <Link href={documentsHref} data-print-documents="true">
            <Printer aria-hidden="true" />
            Print documents
          </Link>
        </Button>
      }
      meta={
        <>
          <span className="text-body">
            <TaxonomyText
              system="chemistry"
              read={
                record.chemistry === null
                  ? null
                  : readTaxonomyValue(
                      CHEMISTRIES,
                      CHEMISTRY_LABELS,
                      record.chemistry,
                    )
              }
            />
          </span>
          <StatusBadge
            system="assessed_condition"
            value={record.assessedCondition}
            size="sm"
          />
          <StatusBadge
            system="battery_record_status"
            value={record.status}
            size="sm"
          />
          <StatusBadge
            system="storage_clock_alert_band"
            value={clock?.alertBand}
            size="sm"
          />
          <ContainerLink container={container} role={role} />
          {resumeIntakeHref === null ? null : (
            <Button
              asChild
              variant="outline"
              size="lg"
              className={ACTION_BUTTON_CLASS}
            >
              <Link href={resumeIntakeHref} data-resume-intake="true">
                <RotateCcw aria-hidden="true" />
                Resume intake
              </Link>
            </Button>
          )}
        </>
      }
      notice={notice}
    />
  );
}

function ContainerLink({
  container,
  role,
}: {
  readonly container: Container | null;
  readonly role: RoleCode;
}) {
  if (container === null) return null;
  if (!canReadRoute(role, "/containers/[id]")) {
    return (
      <span data-container-link="false" className="text-body">
        {container.containerCode}
      </span>
    );
  }
  return (
    <Link
      href={`/containers/${container.id}`}
      data-container-link="true"
      data-inline-target="true"
      className="rounded-md text-body underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
    >
      {container.containerCode}
    </Link>
  );
}
