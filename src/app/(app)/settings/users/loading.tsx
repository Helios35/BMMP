import { Skeleton } from "@/components/ui/skeleton";

/**
 * First paint for `/settings/users` — `UX_SPEC.md` §6.3.
 *
 * **A skeleton at the final layout's shape, never a spinner on an empty page.**
 * The member rows are at the table's own row height — 56px on touch, 48px from
 * `lg` — so the list does not jump when the read lands.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6" aria-busy="true">
      <span className="sr-only" role="status">
        Loading
      </span>

      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:gap-10">
        <div className="flex w-full flex-col gap-1 lg:w-56 lg:shrink-0">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-11 w-full" />
          ))}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-10">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-7 w-40" />
            <div className="flex flex-col gap-2 rounded-xl border border-border p-4">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-14 w-full lg:h-12" />
              ))}
            </div>
          </div>

          {Array.from({ length: 2 }, (_, index) => (
            <div key={index} className="flex flex-col gap-3">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-32 w-full rounded-xl" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
