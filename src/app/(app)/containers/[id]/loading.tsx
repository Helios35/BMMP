import { PageHeaderSkeleton, PageShell } from "@/components/page";
import { ContainerFillMeterSkeleton } from "@/components/storage/container-fill-meter";
import { StorageClockMeterSkeleton } from "@/components/storage/storage-clock-meter";

/**
 * `/containers/[id]` while it loads — `UX_SPEC.md` §6.3.
 *
 * The header block is the route's own: a breadcrumb, the container ID with its
 * copy button, and the type-and-location subtitle. **No action**: Ship this
 * container is P1's and P6's alone, and a skeleton that reserved it would be
 * wrong for P2. The two meters stand in at their exact heights.
 */
export default function ContainerLoading() {
  return (
    <PageShell>
      <PageHeaderSkeleton breadcrumb titleAdornment subtitle />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <StorageClockMeterSkeleton />
        <ContainerFillMeterSkeleton />
      </div>
    </PageShell>
  );
}
