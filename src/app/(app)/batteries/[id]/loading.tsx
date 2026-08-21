import { Skeleton } from "@/components/ui/skeleton";

/**
 * `/batteries/[id]` while it loads — `UX_SPEC.md` §6.3.
 *
 * The skeleton matches the layout it becomes: a crumb, a heading, the header
 * facts, the tab row and two cards. **Layout must not shift when the content
 * arrives**, and there is never a spinner in the middle of an empty page.
 */
export default function BatteryRecordLoading() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <Skeleton className="h-5 w-40 rounded-md" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-56 rounded-md" />
        <Skeleton className="h-6 w-72 rounded-md" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-6 w-28 rounded-md" />
          <Skeleton className="h-6 w-28 rounded-md" />
          <Skeleton className="h-6 w-28 rounded-md" />
        </div>
      </div>
      <Skeleton className="h-11 w-full max-w-md rounded-md" />
      <Skeleton className="h-64 w-full rounded-lg" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}
