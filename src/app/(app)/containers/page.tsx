import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Boxes } from "lucide-react";

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
import { mayTakeContainerAction } from "@/domain/access/container-actions";
import { canReadRoute, capabilityFor } from "@/domain/access/route-capability";
import { APP_ROUTE_NAMES } from "@/domain/access/routes";
import {
  CONTAINER_TYPES,
  CONTAINER_TYPE_LABELS,
} from "@/domain/taxonomy/container-type";
import { optionsFor } from "@/domain/taxonomy/lookup";
import type { RoleCode } from "@/domain/taxonomy/role";
import { NewContainerAction } from "@/features/containers/components/new-container-action";
import {
  CONTAINER_DETAIL_ROLES_REASON,
  LIST_CAPTION,
  LIST_SEARCH_PLACEHOLDER,
  NEW_CONTAINER,
  ZERO_CONTAINERS_TITLE,
  ZERO_CONTAINERS_WHO_CAN,
} from "@/features/containers/container-copy";
import { containerColumns } from "@/features/containers/container-columns";
import {
  CONTAINER_LIST_PATH,
  containerFilters,
  containerListSelection,
  containerListSpec,
} from "@/features/containers/list-query";
import {
  containersAtTier,
  readContainerList,
} from "@/features/containers/server/read-containers";
import { requireRoute } from "@/lib/auth/guard";
import { cn } from "@/lib/utils";
import { nowIso } from "@/lib/auth/session";

/**
 * `/containers` — `UX_SPEC.md` §3.9.
 *
 * Every container's fill and storage clock at a glance, and which need action.
 * All six roles read it; **only P1, P2 and P6 open a container**. For P3, P4
 * and P5 the rows are **not links** — no hover, no pointer, no ring, and the
 * reason named on the row (`SITE_ARCHITECTURE.md` §5.4). `RecordTable`
 * already carries that treatment; this route only answers, per row and from
 * `ROUTE_ACCESS`, whether the row opens.
 *
 * **Filter state lives in the URL**, so `?filter=alerting` — the link the
 * dashboard and `/review` send — is shareable, and it narrows by the `alert`
 * rows themselves (Flow C2).
 */

export const metadata: Metadata = {
  title: APP_ROUTE_NAMES["/containers"],
};

/** The location filter's options — every location this organization records. */
const LOCATION_LIMIT = 200;

export default async function ContainersPage({
  searchParams,
}: PageProps<"/containers">) {
  const { ctx } = await requireRoute("/containers");
  const params = await searchParams;
  const asOf = nowIso();

  const everyContainer = await data.containers.list(ctx, {
    limit: LOCATION_LIMIT,
  });
  const locations = [
    ...new Set(
      everyContainer.items
        .map((container) => container.storageLocation)
        .filter((location): location is string => location !== null),
    ),
  ].sort((a, b) => a.localeCompare(b));

  const spec = containerListSpec(locations);
  const listQuery = decodeListQuery(params, spec);
  const selection = containerListSelection(listQuery);
  const containerIds = await containersAtTier(ctx, selection.tier);

  const result = await readContainerList(ctx, {
    ...toPageRequest(listQuery),
    search: selection.search,
    status: selection.status,
    storageLocation: selection.storageLocation,
    isAlerting: selection.isAlerting,
    containerIds,
  });

  const canOpen = canReadRoute(ctx.role, "/containers/[id]");

  return (
    <PageShell>
      {/* The primary action sits in the table's toolbar, not here (§2.7), so
          the header's height is the same for every role. */}
      <PageHeader
        title={APP_ROUTE_NAMES["/containers"]}
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
        columns={containerColumns(asOf)}
        rows={result.rows}
        rowKey={(row) => row.container.id}
        rowLink={(row) =>
          canOpen
            ? { kind: "link", href: `/containers/${row.container.id}` }
            : { kind: "not-linked", reason: CONTAINER_DETAIL_ROLES_REASON }
        }
        total={result.total}
        query={listQuery}
        querySpec={spec}
        basePath={CONTAINER_LIST_PATH}
        searchPlaceholder={LIST_SEARCH_PLACEHOLDER}
        filters={containerFilters(locations)}
        emptyState={<ZeroContainers role={ctx.role} />}
        filteredEmpty={{ noun: "containers" }}
        error={result.error}
        toolbar={newContainerControl(ctx.role)}
      />
    </PageShell>
  );
}

/**
 * **New container** for P1, P2 and P6; **disabled with its reason** for the
 * auditor, whose job is to see the controls (E-8a); **absent** for P3 and P4.
 */
function newContainerControl(role: RoleCode): ReactNode {
  if (mayTakeContainerAction(role, "create")) {
    return (
      <NewContainerAction
        typeOptions={optionsFor(CONTAINER_TYPES, CONTAINER_TYPE_LABELS)}
      />
    );
  }
  const treatment = controlTreatment({
    role,
    capability: capabilityFor(role, "/containers/[id]"),
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
        data-create-container="true"
        className={cn(ACTION_BUTTON_CLASS, "opacity-60")}
      >
        {NEW_CONTAINER}
      </Button>
    </GatedControl>
  );
}

/** E-2 on `/containers` — the same first sentence for everyone; who can create, for the roles that cannot. */
function ZeroContainers({ role }: { readonly role: RoleCode }) {
  const canCreate = mayTakeContainerAction(role, "create");
  return (
    <EmptyState
      icon={Boxes}
      title={ZERO_CONTAINERS_TITLE}
      {...(canCreate ? {} : { whoCanAct: ZERO_CONTAINERS_WHO_CAN })}
      dataAttributes={{ "data-containers-empty": "true" }}
    />
  );
}
