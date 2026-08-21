import { Skeleton } from "@/components/ui/skeleton";

/**
 * First paint for `/settings/organization` — `UX_SPEC.md` §6.3.
 *
 * **A skeleton matching the final layout, never a spinner in the middle of an
 * empty page.** The section nav and the five section blocks sit where they will
 * sit, so nothing jumps when the read lands.
 *
 * No copy is rendered here. A skeleton that says "Loading your organization"
 * makes a promise it cannot keep if the read then fails.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6" aria-busy="true">
      <span className="sr-only" role="status">
        Loading
      </span>

      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:gap-10">
        <div className="flex w-full flex-col gap-1 lg:w-56 lg:shrink-0">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-11 w-full" />
          ))}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-10">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="flex flex-col gap-3">
              <Skeleton className="h-7 w-56" />
              <Skeleton className="h-48 w-full rounded-xl" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
