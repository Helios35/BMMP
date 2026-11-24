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
import { latestFullCalendarYear } from "@/domain/producer";
import { CheckNowButton } from "@/features/obligations/components/check-now-button";
import {
  deadlineColumns,
  productColumns,
  salesColumns,
  salesPairOf,
  stateColumns,
} from "@/features/obligations/components/columns";
import { producerControl } from "@/features/obligations/components/obligation-controls";
import { ObligationStatePanel } from "@/features/obligations/components/obligation-state-panel";
import { AddProductDialog } from "@/features/obligations/components/product-dialogs";
import { ProductPlanPanel } from "@/features/obligations/components/product-plan-panel";
import { RecordSalesDialog } from "@/features/obligations/components/record-sales-dialog";
import {
  activeObligationTab,
  deadlineFilters,
  deadlineSelection,
  OBLIGATION_TABS,
  OBLIGATIONS_EXPORT_PATH,
  OBLIGATIONS_PATH,
  obligationsListSpec,
  salesYear,
  salesYearFilter,
} from "@/features/obligations/list-query";
import {
  ADD_PRODUCT,
  CHECK_NOW,
  DEADLINES_CAPTION,
  EXPORT,
  PRODUCTS_CAPTION,
  RECORD_SALES,
  SALES_CAPTION,
  STATES_CAPTION,
  ZERO_DEADLINES_BODY,
  ZERO_DEADLINES_TITLE,
  ZERO_PRODUCTS_BODY,
  ZERO_PRODUCTS_TITLE,
  ZERO_PRODUCTS_WHO_CAN,
} from "@/features/obligations/obligation-copy";
import {
  correctionWords,
  salesReadModel,
  salesYears,
} from "@/features/obligations/sales-view";
import { readObligationsPage } from "@/features/obligations/server/read-obligations";
import { productPlanView, stateLabel } from "@/features/obligations/view";
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
 *
 * `b1b-13` (Rules 8.17–8.23, D-81) adds the Sales tab (`?year=`), Make
 * packet and the packets under each deadline, Mark done's evidence, and a
 * product's plan on `?product=`.
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
  const latestYear = latestFullCalendarYear(page.today);
  const yearOptions = salesYears(
    latestYear,
    page.sales.map((row) => row.year),
  );
  const spec = obligationsListSpec(
    [
      ...new Set(
        [...states, ...model.deadlines.map((row) => row.state)].map(
          (s) => s.code,
        ),
      ),
    ],
    model.products.map((row) => row.id),
    yearOptions,
  );
  const query = decodeListQuery(params, spec);
  const tab = activeObligationTab(query);
  // The search box narrows the tab it sits on: a deadline by its duty, state
  // or citation; a state by its name, law or agency; a product by its name.
  const needle = query.q?.toLocaleLowerCase() ?? null;
  const matchesSearch = (...fields: readonly (string | null)[]): boolean =>
    needle === null ||
    fields.some(
      (field) => field?.toLocaleLowerCase().includes(needle) === true,
    );
  const products = model.products.filter((row) =>
    matchesSearch(row.label, row.chemistry),
  );
  const stateRows = model.states.filter((row) =>
    matchesSearch(row.state.name, row.law, row.agency),
  );
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

  if (tab === "sales") {
    const year = salesYear(query, latestYear);
    const salesRows = salesReadModel({
      year,
      timeZone: page.timeZone,
      products: page.rows.products,
      catalogEntries: page.rows.catalogEntries,
      states: new Map(
        page.rows.jurisdictions.map((row) => [row.id, stateLabel(row)]),
      ),
      sales: page.sales,
      people: page.people,
    }).filter((row) => matchesSearch(row.productLabel, row.state.name));
    const correction = (row: (typeof salesRows)[number]): string | null =>
      row.entry === null ? null : correctionWords(row.entry);
    const pairs = salesRows
      .filter((row) => !row.replaced)
      .map((row) => salesPairOf(row, correction));
    return (
      <PageShell>
        {header}
        {tabs}
        <RecordTable
          caption={`${SALES_CAPTION} — ${String(year)}`}
          columns={salesColumns({ role: ctx.role, year, correction })}
          rows={salesRows}
          rowKey={(row) => row.key}
          rowLink={() => ({
            kind: "not-linked",
            reason: "Record or correct a year's units from the row.",
          })}
          total={salesRows.length}
          query={query}
          querySpec={spec}
          basePath={OBLIGATIONS_PATH}
          filters={[salesYearFilter(yearOptions, latestYear)]}
          emptyState={noProducts}
          filteredEmpty={{ noun: "sales entries" }}
          toolbar={producerControl({
            role: ctx.role,
            action: "record_sales",
            isDestructive: false,
            label: RECORD_SALES,
            dataAttributes: { "data-record-sales": "toolbar" },
            live: () => <RecordSalesDialog pairs={pairs} year={year} />,
          })}
        />
      </PageShell>
    );
  }

  if (tab === "products") {
    const selectedProduct = query.filters.product;
    const planned = model.products.find((row) => row.id === selectedProduct);
    return (
      <PageShell>
        {header}
        {tabs}
        {planned === undefined ? null : (
          <ProductPlanPanel
            label={planned.label}
            productId={planned.id}
            plan={productPlanView({
              productId: planned.id,
              today: page.today,
              jurisdictions: page.rows.jurisdictions,
              obligations: page.rows.obligations.filter((row) =>
                planned.stateIds.includes(row.jurisdictionId),
              ),
              deadlines: page.rows.deadlines,
            })}
            closeHref={encodeListQuery(
              OBLIGATIONS_PATH,
              query,
              { filters: {} },
              spec,
            )}
          />
        )}
        <RecordTable
          caption={PRODUCTS_CAPTION}
          columns={productColumns({ role: ctx.role, stateOptions })}
          rows={products}
          rowKey={(row) => row.id}
          rowLink={() => ({
            kind: "not-linked",
            reason: "Open the catalog entry from its name.",
          })}
          total={products.length}
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
          rows={stateRows}
          rowKey={(row) => row.state.jurisdictionId}
          rowLink={() => ({
            kind: "not-linked",
            reason: "Open a state from its name.",
          })}
          total={stateRows.length}
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
      matchesSearch(row.duty, row.state.name, row.citation) &&
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
          packets: page.packets,
          filings: page.filings,
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
