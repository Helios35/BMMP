import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { controlTreatment } from "@/domain/access";
import type { Capability } from "@/domain/access/capability";
import type { RoleCode } from "@/domain/taxonomy/role";

/**
 * **Export** — a list's CSV download (`UX_SPEC.md` §3.5, §3.8b, §3.11, §3.20;
 * D-50), in `RecordTable`'s toolbar. The route decides whether it renders
 * (`mayExportList`); this decides how.
 *
 * **Never disabled for the auditor** (E-8a, Rule 5.27). That is not decided
 * here: `controlTreatment` answers `isExportOrPrint` before every other
 * clause, so the one function the whole product asks about a control already
 * encodes it. The treatment is rendered as an attribute so a reviewer and a
 * test read the decision rather than inferring it.
 *
 * **A plain anchor, never `next/link`.** The router prefetches a `Link` on
 * hover, and every request to an export endpoint writes an `export.generated`
 * audit event (Rule 12.18) — a prefetch would put a row in an append-only log
 * for an export nobody asked for.
 */

export interface ExportControlProps {
  readonly href: string;
  /** `data-export-control`'s value — which list this exports. */
  readonly exportName: string;
  /** Read after "Export" by a screen reader — what the file holds. */
  readonly description: string;
  readonly role: RoleCode;
  /** This role's capability on the list's route, from the guard. */
  readonly capability: Capability;
}

export function ExportControl({
  href,
  exportName,
  description,
  role,
  capability,
}: ExportControlProps) {
  const treatment = controlTreatment({
    role,
    capability,
    isDestructive: false,
    isExportOrPrint: true,
  });

  return (
    <Button
      asChild
      variant="outline"
      size="lg"
      className="min-h-11 rounded-md text-label"
    >
      <a
        href={href}
        data-export-control={exportName}
        data-control-treatment={treatment}
      >
        <Download aria-hidden="true" />
        Export
        <span className="sr-only">{description}</span>
      </a>
    </Button>
  );
}
