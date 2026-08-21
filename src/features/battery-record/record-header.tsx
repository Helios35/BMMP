import Link from "next/link";
import type { ReactElement } from "react";
import { Printer } from "lucide-react";

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
 */

export function RecordHeader({
  record,
  container,
  clock,
  role,
  documentsHref,
}: {
  readonly record: BatteryRecord;
  readonly container: Container | null;
  readonly clock: StorageClock | undefined;
  readonly role: RoleCode;
  readonly documentsHref: string;
}): ReactElement {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1">
            <h1
              id="page-title"
              tabIndex={-1}
              // `font-mono` rather than the `text-mono` token: the token carries
              // its own size, and this heading is `h1` / `display` (§1.3).
              className="font-mono text-h1 tabular-nums lg:text-display"
            >
              {record.recordNumber}
            </h1>
            <CopyButton value={record.recordNumber} label="record ID" />
          </div>

          <p className="text-body">
            {record.manufacturerName ?? <NotRecorded />}
            {record.modelName === null ? null : ` · ${record.modelName}`}
          </p>

          <div className="flex flex-wrap items-center gap-2">
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
          </div>
        </div>

        <Button
          asChild
          variant="outline"
          size="lg"
          className="min-h-11 rounded-md"
        >
          <Link href={documentsHref} data-print-documents="true">
            <Printer aria-hidden="true" />
            Print documents
          </Link>
        </Button>
      </div>
    </div>
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
