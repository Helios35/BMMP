import { PageHeaderSkeleton, PageShell } from "@/components/page";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * `/batteries/new` while it loads — `UX_SPEC.md` §6.3.
 *
 * The header block is the same height as the one it becomes: a breadcrumb
 * trail, the title, no action and no description — exactly what
 * `PageHeaderSkeleton({ breadcrumb: true })` stands in for, and what
 * `tests/e2e/layout-shift.spec.ts` measures when this journey joins its
 * list. Below it, the stepper's line and one card. **Layout must not shift
 * when the content arrives**, and there is never a spinner in the middle of
 * an empty page.
 *
 * The notices — the grace banner, the resume alert — are outside the block
 * on purpose: whether either renders is decided by the read, and reserving
 * space for a notice that may never appear is a worse answer than the shift
 * it would prevent.
 */
export default function LogBatteryLoading() {
  return (
    <PageShell>
      <PageHeaderSkeleton breadcrumb />
      <Skeleton
        data-stepper-state="loading"
        className="h-11 w-full max-w-lg rounded-md"
      />
      <Skeleton className="h-64 w-full rounded-lg" />
    </PageShell>
  );
}
