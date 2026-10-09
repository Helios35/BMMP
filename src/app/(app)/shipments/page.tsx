import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Truck } from "lucide-react";

import { GatedControl } from "@/components/access/gated-control";
import { ReadOnlyBanner } from "@/components/access/read-only-banner";
import {
  ACTION_BUTTON_CLASS,
  EmptyState,
  PageHeader,
  PageShell,
} from "@/components/page";
import {
  decodeListQuery,
  toPageRequest,
} from "@/components/record-table/list-url";
import { RecordTable } from "@/components/record-table/record-table";
import { Button } from "@/components/ui/button";
import { data } from "@/data";
import {
  controlTreatment,
  controlTreatmentReason,
  showsReadOnlyBanner,
} from "@/domain/access/control-treatment";
import {
  canReadRoute,
  canWriteRoute,
  capabilityFor,
} from "@/domain/access/route-capability";
import { APP_ROUTE_NAMES } from "@/domain/access/routes";
import type { RoleCode } from "@/domain/taxonomy/role";
import {
  SHIPMENT_LIST_PATH,
  shipmentFilters,
  shipmentListSelection,
  shipmentListSpec,
} from "@/features/shipments/list-query";
import { shipmentColumns } from "@/features/shipments/shipment-columns";
import {
  BUILD_A_SHIPMENT,
  LIST_CAPTION,
  LIST_SEARCH_PLACEHOLDER,
  SHIPMENTS_DESCRIPTION,
  SHIPMENT_DETAIL_REASON,
  ZERO_SHIPMENTS_BODY,
  ZERO_SHIPMENTS_TITLE,
  ZERO_SHIPMENTS_WHO_CAN,
} from "@/features/shipments/shipment-copy";
import {
  readShipmentList,
  shipmentDestinations,
} from "@/features/shipments/server/read-shipments";
import { requireRoute } from "@/lib/auth/guard";
import { cn } from "@/lib/utils";

/**
 * `/shipments` — `UX_SPEC.md` §3.11. The shipment ledger: every movement,
 * retained for the period the jurisdiction's rule supplies — never a number
 * written into the product (Rules 5.18, 1.23).
 *
 * All six roles read it. **Build a shipment** sits in the table's toolbar
 * for P1 and P6, **disabled with its reason** for the auditor (E-8a), and
 * absent for the rest. Filter state lives in the URL.
 */

export const metadata: Metadata = {
  title: APP_ROUTE_NAMES["/shipments"],
};

export default async function ShipmentsPage({
  searchParams,
}: PageProps<"/shipments">) {
  const { ctx } = await requireRoute("/shipments");
  const params = await searchParams;

  const [organization, destinations] = await Promise.all([
    data.organizations.get(ctx, ctx.organizationId),
    shipmentDestinations(ctx),
  ]);
  const spec = shipmentListSpec(destinations);
  const listQuery = decodeListQuery(params, spec);
  const selection = shipmentListSelection(listQuery);

  const result = await readShipmentList(ctx, {
    ...toPageRequest(listQuery),
    ...(selection.search === undefined ? {} : { search: selection.search }),
    ...(selection.transportMode === undefined
      ? {}
      : { transportMode: selection.transportMode }),
    ...(selection.destinationFacilityName === undefined
      ? {}
      : { destinationFacilityName: selection.destinationFacilityName }),
    ...(selection.holdsDamagedRecord === undefined
      ? {}
      : { holdsDamagedRecord: selection.holdsDamagedRecord }),
    ...(selection.shippedAfter === undefined
      ? {}
      : { shippedAfter: selection.shippedAfter }),
    ...(selection.shippedBefore === undefined
      ? {}
      : { shippedBefore: selection.shippedBefore }),
  });

  const canOpen = canReadRoute(ctx.role, "/shipments/[id]");
  const timeZone = organization?.timeZone ?? "UTC";

  return (
    <PageShell>
      {/* The primary action sits in the table's toolbar (§2.7), so the
          header's height is the same for every role. */}
      <PageHeader
        title={APP_ROUTE_NAMES["/shipments"]}
        description={SHIPMENTS_DESCRIPTION}
        notice={
          showsReadOnlyBanner({
            role: ctx.role,
            routeHasMutatingControls: true,
          }) ? (
            <ReadOnlyBanner />
          ) : undefined
        }
      />

      <RecordTable
        caption={LIST_CAPTION}
        columns={shipmentColumns(timeZone)}
        rows={result.rows}
        rowKey={(row) => row.shipment.id}
        rowLink={(row) =>
          canOpen
            ? { kind: "link", href: `/shipments/${row.shipment.id}` }
            : { kind: "not-linked", reason: SHIPMENT_DETAIL_REASON }
        }
        total={result.total}
        query={listQuery}
        querySpec={spec}
        basePath={SHIPMENT_LIST_PATH}
        searchPlaceholder={LIST_SEARCH_PLACEHOLDER}
        filters={shipmentFilters(destinations)}
        emptyState={<ZeroShipments role={ctx.role} />}
        filteredEmpty={{ noun: "shipments" }}
        {...(result.error === undefined ? {} : { error: result.error })}
        toolbar={buildControl(ctx.role)}
      />
    </PageShell>
  );
}

/**
 * **Build a shipment** for P1 and P6; **disabled with its reason** for the
 * auditor (E-8a); absent for P2, P3 and P4 — P2's hand-off is the container's
 * ready-to-ship status (`SITE_ARCHITECTURE.md` Flow C).
 */
function buildControl(role: RoleCode): ReactNode {
  if (canWriteRoute(role, "/shipments/new")) {
    return (
      <Button asChild size="lg" className={ACTION_BUTTON_CLASS}>
        <Link href="/shipments/new" data-build-shipment="true">
          {BUILD_A_SHIPMENT}
        </Link>
      </Button>
    );
  }
  const treatment = controlTreatment({
    role,
    capability: capabilityFor(role, "/shipments/new"),
    isDestructive: false,
    isExportOrPrint: false,
  });
  const reason = controlTreatmentReason(treatment);
  if (reason === null) return undefined;
  return (
    <GatedControl reason={reason}>
      <Button
        type="button"
        size="lg"
        aria-disabled="true"
        data-disabled="true"
        data-mutating="true"
        data-build-shipment="true"
        className={cn(ACTION_BUTTON_CLASS, "opacity-60")}
      >
        {BUILD_A_SHIPMENT}
      </Button>
    </GatedControl>
  );
}

function ZeroShipments({ role }: { readonly role: RoleCode }) {
  const canBuild = canWriteRoute(role, "/shipments/new");
  return (
    <EmptyState
      icon={Truck}
      title={ZERO_SHIPMENTS_TITLE}
      description={ZERO_SHIPMENTS_BODY}
      {...(canBuild
        ? {
            action: {
              label: BUILD_A_SHIPMENT,
              href: "/shipments/new",
              dataAttributes: { "data-build-shipment-empty": "true" },
            },
          }
        : { whoCanAct: ZERO_SHIPMENTS_WHO_CAN })}
      dataAttributes={{ "data-shipments-empty": "true" }}
    />
  );
}
