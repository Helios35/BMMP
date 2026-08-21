import { RecordTableSkeleton } from "@/components";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * `/catalog`'s first paint — `UX_SPEC.md` §2.7, §6.3.
 *
 * **Eight skeleton rows at the exact row height, never a spinner in the middle
 * of an empty page.** The skeleton matches the loaded layout column for column,
 * so the list does not jump under a reader's thumb when it lands.
 *
 * Route-level rather than group-level: a skeleton that matches *this* table is
 * the only kind worth rendering, and the shell above it never flashes because
 * only the segment is replaced.
 */
export default function CatalogLoading() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <Skeleton className="h-8 w-48 rounded-md lg:h-9" />
      <RecordTableSkeleton columns={7} />
    </div>
  );
}
