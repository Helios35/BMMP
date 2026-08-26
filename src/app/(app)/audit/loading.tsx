import { PageHeaderSkeleton, PageShell } from "@/components/page";
import { AUDIT_PAGE_DESCRIPTION } from "@/features/audit/audit-copy";
import { RecordTableSkeleton } from "@/components/record-table/record-table";

/**
 * `/audit`'s first paint — `UX_SPEC.md` §6.3.
 *
 * Eight skeleton rows at the table's exact row height, so the list does not jump
 * under a reader's thumb when it lands. **Never a spinner in the middle of an
 * empty page** (§2.7).
 *
 * The header skeleton is given the page's **own sentence** rather than a
 * one-line bar. It runs to three lines at 1280 and the bar stood in for one, so
 * the table dropped 48px the moment the read landed — a shift §6.3 forbids and
 * no screenshot could show.
 *
 * The shell above this file never flashes: it lives in `(app)/layout.tsx`, which
 * is above every `loading.tsx`, so navigation replaces the content and keeps the
 * navigation, the switcher and the palette in place.
 */
export default function AuditLoading() {
  return (
    <PageShell>
      <PageHeaderSkeleton description={AUDIT_PAGE_DESCRIPTION} />
      <RecordTableSkeleton columns={6} />
    </PageShell>
  );
}
