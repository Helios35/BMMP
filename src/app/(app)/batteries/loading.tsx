import { RecordTableSkeleton } from "@/components/record-table/record-table";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * `/batteries` while it loads — `UX_SPEC.md` §6.3.
 *
 * **Eight skeleton rows at the exact row height, never a spinner in the middle
 * of an empty page.** The layout the reader lands on is the layout that was
 * already there, so a list does not jump under a thumb when it arrives. The
 * shell sits above this boundary and never flashes.
 */
export default function BatteriesLoading() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <Skeleton className="h-9 w-48 rounded-md" />
      <RecordTableSkeleton columns={8} />
    </div>
  );
}
