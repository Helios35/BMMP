import { ExportControl } from "@/components/record-table/export-control";
import type { Capability } from "@/domain/access/capability";
import type { RoleCode } from "@/domain/taxonomy/role";

/**
 * `/audit`'s primary action — `UX_SPEC.md` §3.20. The shared `ExportControl`,
 * named for the audit log: never disabled for the auditor (E-8a, Rule 5.27),
 * and a plain anchor so no prefetch writes an `export.generated` row nobody
 * asked for (Rule 12.18).
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
  return (
    <ExportControl
      href={href}
      exportName="audit"
      description=" the audit log, with the filters on this page, as a CSV file"
      role={role}
      capability={capability}
    />
  );
}
