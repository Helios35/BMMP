import { PageHeaderSkeleton, PageShell } from "@/components/page";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * `/shipments/[id]` while it loads — `UX_SPEC.md` §6.3.
 *
 * The header block is the route's own: a breadcrumb, the shipment number with
 * its copy button, the destination-and-mode subtitle and its badges. **No
 * action is reserved** — Record departure is P1's and P6's alone, and a
 * skeleton that reserved it would be wrong for every other role.
 */
export default function ShipmentLoading() {
  return (
    <PageShell>
      <span className="sr-only" role="status">
        Loading
      </span>
      <PageHeaderSkeleton breadcrumb titleAdornment subtitle meta={3} />
      <Skeleton className="h-24 w-full rounded-lg" />
      <Skeleton className="h-96 w-full rounded-lg" />
    </PageShell>
  );
}
