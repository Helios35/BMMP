import { PageHeaderSkeleton, PageShell } from "@/components/page";
import { RecordTableSkeleton } from "@/components/record-table/record-table";

/**
 * `/batteries` while it loads — `UX_SPEC.md` §6.3.
 *
 * **Eight skeleton rows at the exact row height, never a spinner in the middle
 * of an empty page.** The layout the reader lands on is the layout that was
 * already there, so a list does not jump under a thumb when it arrives. The
 * shell sits above this boundary and never flashes.
 *
 * `PageHeaderSkeleton` stands in the *header block*, not a bar the width of a
 * title, and it carries **no action**: §2.7 puts this route's primary action in
 * the table's own header row, where the search box already sets the height. A
 * role-dependent control in the page header would make this skeleton wrong for
 * four of the six roles. `tests/e2e/layout-shift.spec.ts` measures
 * `[data-page-header]` in both states and fails when the two disagree.
 */
export default function BatteriesLoading() {
  return (
    <PageShell>
      <PageHeaderSkeleton />
      <RecordTableSkeleton columns={8} />
    </PageShell>
  );
}
