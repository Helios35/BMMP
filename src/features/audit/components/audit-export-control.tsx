import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { controlTreatment } from "@/domain/access";
import type { Capability } from "@/domain/access/capability";
import type { RoleCode } from "@/domain/taxonomy/role";

/**
 * `/audit`'s primary action — `UX_SPEC.md` §3.20.
 *
 * **Never disabled for the auditor** (E-8a, Rule 5.27). That is not decided here:
 * `controlTreatment` answers `isExportOrPrint` before every other clause, so the
 * one function the whole product asks about a control already encodes it. Asking
 * it rather than asserting it is what keeps the read-only banner's promise —
 * *"you can view and export everything on this page"* — true by construction.
 *
 * The treatment is rendered as an attribute so a reviewer and a test read the
 * decision rather than inferring it from the absence of a `disabled`.
 *
 * **A plain anchor, never `next/link`.** The router prefetches a `Link` on hover,
 * and every request to this endpoint writes an `export.generated` audit event
 * (Rule 12.18) — a prefetch would put a row in an append-only log for an export
 * nobody asked for, and a wrong record is worse than a missing convenience.
 */

export interface AuditExportControlProps {
  readonly href: string;
  readonly role: RoleCode;
  /** This role's capability on `/audit`, from the guard. */
  readonly capability: Capability;
}

export function AuditExportControl({
  href,
  role,
  capability,
}: AuditExportControlProps) {
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
        data-export-control="audit"
        data-control-treatment={treatment}
      >
        <Download aria-hidden="true" />
        Export
        <span className="sr-only">
          {" the audit log, with the filters on this page, as a CSV file"}
        </span>
      </a>
    </Button>
  );
}
