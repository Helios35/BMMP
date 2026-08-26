import { PageColumns, PageHeaderSkeleton, PageShell } from "@/components/page";
import { Skeleton } from "@/components/ui/skeleton";
import { MEMBERS_PAGE_DESCRIPTION } from "@/features/settings/copy";

/**
 * First paint for `/settings/users` — `UX_SPEC.md` §6.3.
 *
 * **A skeleton at the final layout's shape, never a spinner on an empty page.**
 * The member rows are at the table's own row height — 56px on touch, 48px from
 * `lg` — so the list does not jump when the read lands.
 */
export default function Loading() {
  return (
    <PageShell>
      <span className="sr-only" role="status">
        Loading
      </span>

      <PageHeaderSkeleton description={MEMBERS_PAGE_DESCRIPTION} />

      <PageColumns
        aside={
          <div className="flex w-full flex-col gap-1 lg:w-56 lg:shrink-0">
            {Array.from({ length: 3 }, (_unused, index) => (
              <Skeleton key={index} className="h-11 w-full rounded-md" />
            ))}
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <Skeleton className="h-7 w-40 rounded-md" />
          <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
            {Array.from({ length: 6 }, (_unused, index) => (
              <Skeleton
                key={index}
                className="h-14 w-full rounded-md lg:h-12"
              />
            ))}
          </div>
        </div>

        {Array.from({ length: 2 }, (_unused, index) => (
          <div key={index} className="flex flex-col gap-4">
            <Skeleton className="h-7 w-48 rounded-md" />
            <Skeleton className="h-32 w-full rounded-lg" />
          </div>
        ))}
      </PageColumns>
    </PageShell>
  );
}
