import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ReadOnlyBanner } from "@/components/access/read-only-banner";
import { PageShell } from "@/components/page";
import {
  decodeListQuery,
  encodeListQuery,
} from "@/components/record-table/list-url";
import { data } from "@/data";
import { showsReadOnlyBanner } from "@/domain/access/control-treatment";
import { APP_ROUTE_NAMES } from "@/domain/access/routes";
import { DdrBlockAlert } from "@/features/battery-record/ddr-block-alert";
import { DocumentsTab } from "@/features/battery-record/documents-tab";
import { UNPLACED_RECORD_TIME_ZONE } from "@/features/battery-record/format-instant";
import { HistoryTab } from "@/features/battery-record/history-tab";
import { OverviewTab } from "@/features/battery-record/overview-tab";
import { PhotosTab } from "@/features/battery-record/photos-tab";
import { RecordActions } from "@/features/battery-record/record-actions";
import { RecordHeader } from "@/features/battery-record/record-header";
import {
  activeRecordTab,
  RECORD_TAB_SPEC,
  RecordTabs,
} from "@/features/battery-record/record-tabs";
import { Breadcrumbs } from "@/features/shell/chrome/breadcrumbs";
import { breadcrumbTrail } from "@/features/shell/navigation/breadcrumb-ancestors";
import { requireRoute } from "@/lib/auth/guard";
import { recordNotFound } from "@/lib/auth/record-denial";
import { nowIso, resolveRequestContext } from "@/lib/auth/session";

/**
 * `/batteries/[id]` — `UX_SPEC.md` §3.7.
 *
 * **Read-only in this unit, with all four tabs present and all four rendering
 * fixture data.** Every write path here belongs to unit 02, and none of it is
 * built: no editing assessed condition, no re-running catalog matching, no
 * attaching a photo. E-8a is still fully demonstrable, because a disabled
 * control has no handler to call — see `RecordActions`.
 *
 * ## The cross-tenant path
 *
 * A record belonging to another organisation returns `null` from the adapter,
 * exactly as an absent one does, and this page calls `notFound()` for both.
 * **There is no organisation comparison anywhere in this file**: the seam has
 * already made the decision, and a screen that repeated it would eventually
 * drift from it. That is what makes Rule 1.2 structural rather than a habit —
 * another tenant's record is byte-identical to one that never existed, and
 * existence is never disclosed.
 *
 * ## What this route never renders
 *
 * No format band and no single organisation-wide size or format value
 * (`SITE_ARCHITECTURE.md` §7.6b). No `[B2]` hazard surface: the slot is reserved
 * on the Overview tab and renders literally nothing. **No probability,
 * percentage, likelihood or chance of anything, anywhere** (Rule 1.25).
 */

/**
 * The browser tab carries the record number, and nothing else.
 *
 * **It resolves the session rather than calling the guard.** Next renders
 * `generateMetadata` and the page in parallel, and a second `requireRoute` on
 * one request would write a second denial `audit_event` for a single attempt —
 * denials are evidence, and a doubled count is a wrong record rather than a
 * redundant one (Rules 12.6, 1.16). The page's own guard is the access decision;
 * this only needs a context to read with, and it has none when the caller is
 * signed out. `resolveRequestContext` is request-cached, so this costs nothing.
 *
 * **A title is not an existence oracle**: an id that resolves to nothing gets
 * the route's own name and discloses nothing about the record (Rule 1.2).
 */
export async function generateMetadata({
  params,
}: PageProps<"/batteries/[id]">): Promise<Metadata> {
  const fallback: Metadata = { title: APP_ROUTE_NAMES["/batteries/[id]"] };

  const resolution = await resolveRequestContext();
  if (resolution.kind !== "resolved") return fallback;

  const { id } = await params;
  const record = await data.batteryRecords.get(resolution.session.ctx, id);
  return record === null ? fallback : { title: record.recordNumber };
}

export default async function BatteryRecordPage({
  params,
  searchParams,
}: PageProps<"/batteries/[id]">) {
  const { ctx, capability } = await requireRoute("/batteries/[id]");
  const { id } = await params;

  const record = await data.batteryRecords.get(ctx, id);
  if (record === null) {
    // Denials are evidence (Rules 1.16, 12.6), and this row is deliberately
    // identical whether the record is absent or belongs to another tenant.
    await recordNotFound(ctx, "battery_record", id);
    notFound();
  }

  const asOf = nowIso();
  const basePath = `/batteries/${record.id}`;
  const query = decodeListQuery(await searchParams, RECORD_TAB_SPEC);
  const tab = activeRecordTab(query);

  const container =
    record.containerId === null
      ? null
      : await data.containers.get(ctx, record.containerId);

  const clock =
    container === null
      ? undefined
      : (
          await data.storageClocks.list(ctx, {
            containerId: container.id,
            limit: 1,
          })
        ).items[0];

  // The zone every absolute instant on this screen is read in (Rule 4.29). A
  // record with no placement has no site, and the fallback is stated beside the
  // value rather than assumed.
  const timeZone = container?.siteTimeZone ?? UNPLACED_RECORD_TIME_ZONE;

  const assessments = await data.damageAssessments.list(ctx, {
    batteryRecordId: record.id,
    limit: 50,
  });
  const currentAssessment = [...assessments.items]
    .filter((assessment) => assessment.status !== "superseded")
    .sort((a, b) => b.assessedAt.localeCompare(a.assessedAt))[0];

  const documentsHref = encodeListQuery(
    basePath,
    query,
    { tab: "documents" },
    RECORD_TAB_SPEC,
  );

  return (
    <PageShell>
      <RecordHeader
        record={record}
        container={container}
        clock={clock}
        role={ctx.role}
        documentsHref={documentsHref}
        breadcrumbs={
          <Breadcrumbs
            crumbs={breadcrumbTrail(
              "/batteries/[id]",
              ctx.role,
              record.recordNumber,
            )}
          />
        }
        notice={
          <>
            {/* Pinned directly below the title, in §2.9's slot. The decision is
                the domain's, not this page's. */}
            {showsReadOnlyBanner({
              role: ctx.role,
              routeHasMutatingControls: true,
            }) ? (
              <ReadOnlyBanner />
            ) : null}

            {/* Persistent on every tab, and non-dismissible for every role
                including P6 (Rules 6.8, 6.17). */}
            <DdrBlockAlert record={record} assessment={currentAssessment} />

            {/* E-8a's disabled controls sit inside the header rather than in a
                row of their own between the block and the tabs. Every mutating
                affordance on this record is then in one place, which is what an
                auditor is on this screen to find. */}
            <RecordActions
              role={ctx.role}
              capability={capability}
              recordId={record.id}
            />
          </>
        }
      />

      <RecordTabs basePath={basePath} query={query} active={tab} />

      {tab === "overview" ? (
        <OverviewTab ctx={ctx} record={record} asOf={asOf} />
      ) : null}
      {tab === "photos" ? (
        <PhotosTab ctx={ctx} record={record} timeZone={timeZone} />
      ) : null}
      {tab === "documents" ? (
        <DocumentsTab ctx={ctx} record={record} timeZone={timeZone} />
      ) : null}
      {tab === "history" ? (
        <HistoryTab ctx={ctx} record={record} timeZone={timeZone} />
      ) : null}
    </PageShell>
  );
}
