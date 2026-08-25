import { PageHeaderSkeleton, PageShell } from "@/components/page";
import { RecordTableSkeleton } from "@/components";

/**
 * `/catalog`'s first paint — `UX_SPEC.md` §2.7, §6.3.
 *
 * **Eight skeleton rows at the exact row height, never a spinner in the middle
 * of an empty page.** The skeleton matches the loaded layout column for column,
 * so the list does not jump under a reader's thumb when it lands.
 *
 * No action in the header skeleton, because the route has none: §3.15 makes
 * search the primary action and it lives in the table's toolbar.
 */
export default function CatalogLoading() {
  return (
    <PageShell>
      <PageHeaderSkeleton />
      <RecordTableSkeleton columns={7} />
    </PageShell>
  );
}
