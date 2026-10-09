import { PageHeaderSkeleton, PageShell } from "@/components/page";
import { Skeleton } from "@/components/ui/skeleton";
import { NEW_SHIPMENT_DESCRIPTION } from "@/features/shipments/shipment-copy";

/**
 * `/shipments/new` while it loads — `UX_SPEC.md` §6.3.
 *
 * The header block is the route's own: a breadcrumb, the title and the
 * route's sentence. The stepper and the step's card stand in at their shape.
 * Never a spinner.
 */
export default function NewShipmentLoading() {
  return (
    <PageShell>
      <span className="sr-only" role="status">
        Loading
      </span>
      <PageHeaderSkeleton breadcrumb description={NEW_SHIPMENT_DESCRIPTION} />
      <Skeleton className="h-10 w-full rounded-md" />
      <Skeleton className="h-96 w-full rounded-lg" />
    </PageShell>
  );
}
