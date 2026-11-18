import type { Metadata } from "next";
import { ScrollText } from "lucide-react";

import { ReadOnlyBanner } from "@/components/access/read-only-banner";
import {
  ACTION_BUTTON_CLASS,
  EmptyState,
  PageHeader,
  PageShell,
  RouteTabs,
} from "@/components/page";
import {
  decodeListQuery,
  encodeListQuery,
} from "@/components/record-table/list-url";
import { RecordTable } from "@/components/record-table/record-table";
import { Button } from "@/components/ui/button";
import { mayTakeProducerAction } from "@/domain/access/producer-actions";
import { showsReadOnlyBanner } from "@/domain/access/control-treatment";
import { APP_ROUTE_NAMES } from "@/domain/access/routes";
import { CheckNowButton } from "@/features/obligations/components/check-now-button";
import {
  deadlineColumns,
  productColumns,
  stateColumns,
} from "@/features/obligations/components/columns";
import { producerControl } from "@/features/obligations/components/obligation-controls";
import { ObligationStatePanel } from "@/features/obligations/components/obligation-state-panel";
import { AddProductDialog } from "@/features/obligations/components/product-dialogs";
import {
  activeObligationTab,
  deadlineFilters,
  deadlineSelection,
  OBLIGATION_TABS,
  OBLIGATIONS_EXPORT_PATH,
  OBLIGATIONS_PATH,
  obligationsListSpec,
} from "@/features/obligations/list-query";
import {
  ADD_PRODUCT,
  CHECK_NOW,
  DEADLINES_CAPTION,
  EXPORT,
  PRODUCTS_CAPTION,
  STATES_CAPTION,
  ZERO_DEADLINES_BODY,
  ZERO_DEADLINES_TITLE,
  ZERO_PRODUCTS_BODY,
  ZERO_PRODUCTS_TITLE,
  ZERO_PRODUCTS_WHO_CAN,
} from "@/features/obligations/obligation-copy";
import { readObligationsPage } from "@/features/obligations/server/read-obligations";
import { requireRoute } from "@/lib/auth/guard";
import { nowIso } from "@/lib/auth/session";

/**
 * `/obligations` — Producer obligations. `UX_SPEC.md` §3.21; Rules 8.6–8.16;
 * D-78. The 21st route.
 *
 * P3 and P6 act; P2 and P5 read; P1 and P4 have no page (Rule 8.15) — the
 * guard turns them away and audits it. **Everything shown was decided by a
 * run and stored**: the bands in the law's own terms, each obligation's
 * status, the dated deadlines. Tabs, filters and `?state=` live in the URL.
 */

export const metadata: Metadata = {
  title: APP_ROUTE_NAMES["/obligations"],
};

export default async function ObligationsPage({
  searchParams,
}: PageProps<"/obligations">) {
  const { ctx } = await requireRoute("/obligations");
  const params = await searchParams;
  const page = await readObligationsPage(ctx, nowIso());
  const { model } = page;

  const states = [...model.states.map((view) => view.state)];
  const spec = obligationsListSpec([
    ...new Set(
      [...states, ...model.deadlines.map((row) => row.state)].map(
        (s) => s.code,
      ),
    ),
  ]);
  const query = decodeListQuery(params, spec);
  const tab = activeObligationTab(query);
  const stateOptions = page.stateOptions;

  const header = (
    <PageHeader
      title={APP_ROUTE_NAMES["/obligations"]}
      description={page.basisLine}
      notice={
        showsReadOnlyBanner({
          role: ctx.role,
          routeHasMutatingControls: true,
        }) ? (
          <ReadOnlyBanner />
        ) : undefined
      }
      action={
        <div
          className="flex flex-wrap items-start gap-2"
          data-obligations-actions="true"
        >
          {producerControl({
            role: ctx.role,
            action: "check_now",
            isDestructive: false,
            label: CHECK_NOW,
            dataAttributes: { "data-check-now": "true" },
            live: () => <CheckNowButton />,
          })}
          {mayTakeProducerAction(ctx.role, "export_obligations") ? (
            <Button
              asChild
              variant="outline"
              size="lg"
              className={ACTION_BUTTON_CLASS}
            >
              <a
                href={OBLIGATIONS_EXPORT_PATH}
                data-obligations-export="true"
                download
              >
                {EXPORT}
              </a>
            </Button>
          ) : null}
        </div>
      }
    />
  );
  const tabs = (
    <RouteTabs
      tabs={OBLIGATION_TABS}
      basePath={OBLIGATIONS_PATH}
      query={query}
      spec={spec}
      active={tab}
      label="Obligations views"
      dataAttribute="data-obligations-tab"
    />
  );
  const addProduct = producerControl({
    role: ctx.role,
    action: "manage_products",
    isDestructive: false,
    label: ADD_PRODUCT,
    dataAttributes: { "data-add-product": "true" },
    live: () => (
      <AddProductDialog
        entryOptions={page.entryOptions}
        stateOptions={stateOptions}
      />
    ),
  });
  const noProducts = (
    <EmptyState
      icon={ScrollText}
      title={ZERO_PRODUCTS_TITLE}
      description={ZERO_PRODUCTS_BODY}
      {...(mayTakeProducerAction(ctx.role, "manage_products")
        ? {}
        : { whoCanAct: ZERO_PRODUCTS_WHO_CAN })}
      dataAttributes={{ "data-obligations-empty": "true" }}
    />
  );

  if (tab === "products") {
    return (
      <PageShell>
        {header}
        {tabs}
        <RecordTable
          caption={PRODUCTS_CAPTION}
          columns={productColumns({ role: ctx.role, stateOptions })}
          rows={model.products}
          rowKey={(row) => row.id}
          rowLink={() => ({
            kind: "not-linked",
            reason: "Open the catalog entry from its name.",
          })}
          total={model.products.length}
          query={query}
          querySpec={spec}
          basePath={OBLIGATIONS_PATH}
          emptyState={noProducts}
          toolbar={addProduct}
        />
      </PageShell>
    );
  }

  if (tab === "states") {
    const selected = query.filters.state;
    const open = model.states.find((view) => view.state.code === selected);
    return (
      <PageShell>
        {header}
        {tabs}
        {open === undefined ? null : (
          <ObligationStatePanel
            view={open}
            closeHref={encodeListQuery(
              OBLIGATIONS_PATH,
              query,
              { filters: {} },
              spec,
            )}
          />
        )}
        <RecordTable
          caption={STATES_CAPTION}
          columns={stateColumns()}
          rows={model.states}
          rowKey={(row) => row.state.jurisdictionId}
          rowLink={() => ({
            kind: "not-linked",
            reason: "Open a state from its name.",
          })}
          total={model.states.length}
          query={{ ...query, filters: {} }}
          querySpec={spec}
          basePath={OBLIGATIONS_PATH}
          emptyState={noProducts}
        />
      </PageShell>
    );
  }

  const selection = deadlineSelection(query);
  const filtered = model.deadlines.filter(
    (row) =>
      (selection.stateCode === null ||
        row.state.code === selection.stateCode) &&
      (selection.standing === null || row.standing === selection.standing),
  );
  const start = (query.page - 1) * query.perPage;
  return (
    <PageShell>
      {header}
      {tabs}
      <RecordTable
        caption={DEADLINES_CAPTION}
        columns={deadlineColumns({
          role: ctx.role,
          today: page.today,
          people: page.people,
        })}
        rows={filtered.slice(start, start + query.perPage)}
        rowKey={(row) => row.id}
        rowLink={() => ({
          kind: "not-linked",
          reason: "Open the state from the States tab.",
        })}
        total={filtered.length}
        query={query}
        querySpec={spec}
        basePath={OBLIGATIONS_PATH}
        filters={deadlineFilters(
          [
            ...new Map(
              model.deadlines.map((row) => [row.state.code, row.state]),
            ).values(),
          ].sort((a, b) => a.name.localeCompare(b.name)),
        )}
        emptyState={
          model.products.length === 0 ? (
            noProducts
          ) : (
            <EmptyState
              icon={ScrollText}
              title={ZERO_DEADLINES_TITLE}
              description={ZERO_DEADLINES_BODY}
              dataAttributes={{ "data-deadlines-empty": "true" }}
            />
          )
        }
        filteredEmpty={{ noun: "deadlines" }}
      />
    </PageShell>
  );
}
