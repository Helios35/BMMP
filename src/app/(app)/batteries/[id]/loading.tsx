import { PageHeaderSkeleton, PageShell } from "@/components/page";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * `/batteries/[id]` while it loads — `UX_SPEC.md` §6.3.
 *
 * The skeleton matches the layout it becomes: a crumb, the record number beside
 * its 44px copy button, the print action, the identifying subtitle, the
 * four-badge meta strip, the tab row and two cards. **Layout must not shift when
 * the content arrives**, and there is never a spinner in the middle of an empty
 * page.
 *
 * `titleAdornment` is what makes the title line 44px rather than the type
 * token's 36 — the copy button is a touch target and it is the taller of the
 * two. Without it this header was eight pixels short on every load.
 */
export default function BatteryRecordLoading() {
  return (
    <PageShell>
      <PageHeaderSkeleton breadcrumb titleAdornment subtitle action meta={4} />
      <Skeleton className="h-11 w-full max-w-md rounded-md" />
      <Skeleton className="h-64 w-full rounded-lg" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </PageShell>
  );
}
