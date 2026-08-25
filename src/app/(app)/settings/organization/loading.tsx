import { PageColumns, PageHeaderSkeleton, PageShell } from "@/components/page";
import { Skeleton } from "@/components/ui/skeleton";
import { ORGANIZATION_PAGE_DESCRIPTION } from "@/features/settings/copy";

/**
 * First paint for `/settings/organization` — `UX_SPEC.md` §6.3.
 *
 * **A skeleton matching the final layout, never a spinner in the middle of an
 * empty page.** It composes `PageColumns` and `PageHeaderSkeleton` rather than
 * approximating them, so the section nav and the five section blocks sit exactly
 * where they will sit and nothing jumps when the read lands.
 *
 * No copy is rendered here. A skeleton that says "Loading your organization"
 * makes a promise it cannot keep if the read then fails.
 */
export default function Loading() {
  return (
    <PageShell>
      <span className="sr-only" role="status">
        Loading
      </span>

      <PageHeaderSkeleton
        subtitle
        description={ORGANIZATION_PAGE_DESCRIPTION}
      />

      <PageColumns
        aside={
          <div className="flex w-full flex-col gap-1 lg:w-56 lg:shrink-0">
            {Array.from({ length: 5 }, (_unused, index) => (
              <Skeleton key={index} className="h-11 w-full rounded-md" />
            ))}
          </div>
        }
      >
        {Array.from({ length: 4 }, (_unused, index) => (
          <div key={index} className="flex flex-col gap-4">
            <Skeleton className="h-7 w-56 rounded-md" />
            <Skeleton className="h-48 w-full rounded-lg" />
          </div>
        ))}
      </PageColumns>
    </PageShell>
  );
}
