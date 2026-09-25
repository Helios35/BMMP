import { PageHeaderSkeleton, PageShell } from "@/components/page";
import { RecordTableSkeleton } from "@/components/record-table/record-table";

/**
 * `/containers` while it loads — `UX_SPEC.md` §6.3.
 *
 * The header block carries no action — §2.7 puts New container in the table's
 * own toolbar — and seven skeleton columns stand where the seven columns land.
 * `tests/e2e/layout-shift.spec.ts` measures `[data-page-header]` in both
 * states.
 */
export default function ContainersLoading() {
  return (
    <PageShell>
      <PageHeaderSkeleton />
      <RecordTableSkeleton columns={7} />
    </PageShell>
  );
}
