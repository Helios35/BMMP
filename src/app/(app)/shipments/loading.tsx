import { PageHeaderSkeleton, PageShell } from "@/components/page";
import { RecordTableSkeleton } from "@/components/record-table/record-table";
import { SHIPMENTS_DESCRIPTION } from "@/features/shipments/shipment-copy";

/**
 * `/shipments` while it loads — `UX_SPEC.md` §6.3.
 *
 * The header carries the route's own sentence, so it takes exactly the space
 * the loaded header will; Build a shipment is in the table's toolbar (§2.7),
 * so no action is reserved. Eight skeleton columns stand where the eight land.
 */
export default function ShipmentsLoading() {
  return (
    <PageShell>
      <PageHeaderSkeleton description={SHIPMENTS_DESCRIPTION} />
      <RecordTableSkeleton columns={8} />
    </PageShell>
  );
}
