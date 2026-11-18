import { PageHeaderSkeleton, PageShell } from "@/components/page";
import { RecordTableSkeleton } from "@/components/record-table/record-table";

/**
 * `/obligations` while it loads — `UX_SPEC.md` §6.3, §3.21.
 *
 * The header carries **Check now** and **Export**, and the default tab is
 * Deadlines: six skeleton columns stand where its six columns land — due,
 * state, obligation, status, citation and the row's action.
 */
export default function ObligationsLoading() {
  return (
    <PageShell>
      <PageHeaderSkeleton description action />
      <RecordTableSkeleton columns={6} />
    </PageShell>
  );
}
