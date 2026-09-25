import { PageHeaderSkeleton, PageShell } from "@/components/page";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * `/review` while it loads — `UX_SPEC.md` §6.3.
 *
 * **The header is the title alone, for both compositions.** This boundary
 * cannot know which of the two screens is coming — P1's work queue or P2's
 * unidentified inventory (§3.8a, §3.8b) — and a description written for one
 * would be a guess the layout-shift measurement catches for the other. So the
 * page itself carries no description, and each composition opens with its own
 * first block below the header.
 *
 * Below the header, the shape both compositions share on a wide screen: a
 * column of item-sized blocks and a wider one beside it. Never a spinner.
 */
export default function ReviewLoading() {
  return (
    <PageShell>
      <PageHeaderSkeleton />
      <div
        data-review-loading="true"
        className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-8"
      >
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-24 w-full rounded-lg" />
          ))}
        </div>
        <Skeleton className="hidden h-96 w-full rounded-lg lg:block" />
      </div>
    </PageShell>
  );
}
