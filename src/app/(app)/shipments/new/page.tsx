import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactElement } from "react";
import { Boxes } from "lucide-react";

import { DocumentStatusMarking } from "@/components/documents/document-viewer";
import { ShippingPaperDocument } from "@/components/documents/shipping-paper-document";
import { HardBlockNotice } from "@/components/hard-block/hard-block-notice";
import {
  ACTION_BUTTON_CLASS,
  EmptyState,
  PageHeader,
  PageShell,
  SectionCard,
} from "@/components/page";
import { INTENT_SURFACE_CLASSES } from "@/components/status/intent-classes";
import { StatusBadge } from "@/components/status/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import { canReadRoute } from "@/domain/access/route-capability";
import { APP_ROUTE_NAMES } from "@/domain/access/routes";
import { DOCUMENT_RENDER_STATUS_LABELS } from "@/domain/taxonomy/document-render-status";
import { isTaxonomyValue } from "@/domain/taxonomy/lookup";
import {
  TRANSPORT_MODES,
  TRANSPORT_MODE_LABELS,
  type TransportMode,
} from "@/domain/taxonomy/transport-mode";
import {
  AIR_PROHIBITION_STATEMENT,
  airBlockIndicatorText,
  assessAirTransport,
  type AirTransportAssessment,
} from "@/domain/transport/air-transport";
import { admitContainerToShipment } from "@/domain/transport/container-admission";
import { ContentsStep } from "@/features/shipments/components/contents-step";
import { GenerateControl } from "@/features/shipments/components/generate-control";
import { PreconditionChecklist } from "@/features/shipments/components/precondition-checklist";
import { ShipmentStepper } from "@/features/shipments/components/shipment-stepper";
import {
  TransportStep,
  type TransportDefaults,
} from "@/features/shipments/components/transport-step";
import { draftPaperProps } from "@/features/shipments/paper-view";
import {
  AIR_BLOCK_TITLE,
  AIR_CHECK_FAILED,
  AIR_MISSING_CITATION,
  AIR_UNAVAILABLE_TOOLTIP,
  CLASSIFICATION_TITLE,
  CONTENTS_CHANGED,
  ddrBody,
  DDR_TITLE,
  DRAFT_DETAIL,
  LINES_TITLE,
  manifestBody,
  MANIFEST_TITLE,
  NEW_SHIPMENT_DESCRIPTION,
  OPEN_CONTAINERS,
  PACKAGING_NO_RULE,
  PACKAGING_TITLE,
  PACKAGING_UNREADABLE,
  PAPER_GAP,
  PATH_GROUND,
  PATH_REASSESS,
  PATH_REMOVE,
  RETRY,
  REVIEW_TITLE,
  STEP_LABELS,
  STEP_LOCKED_SELECT,
  STEP_LOCKED_REVIEW,
  STEP_LOCKED_TRANSPORT,
  STEPS_LABEL,
  ZERO_CONTAINERS_BODY,
  ZERO_CONTAINERS_TITLE,
} from "@/features/shipments/shipment-copy";
import { readShipmentCandidates } from "@/features/shipments/server/candidates";
import {
  activeOrganization,
  readShippingPaperBuild,
  shipmentContainers,
} from "@/features/shipments/server/paper-build";
import {
  admissionFacts,
  airSubject,
  OPEN_SHIPMENT_STATUSES,
  readContainerScope,
  scopeRecords,
  type ScopeContainer,
} from "@/features/shipments/server/scope";
import { Breadcrumbs } from "@/features/shell/chrome/breadcrumbs";
import { breadcrumbTrail } from "@/features/shell/navigation/breadcrumb-ancestors";
import { requireRoute } from "@/lib/auth/guard";
import { recordNotFound } from "@/lib/auth/record-denial";
import { nowIso } from "@/lib/auth/session";
import { cn } from "@/lib/utils";
import type { Shipment } from "@/types/documents";
import type { Container } from "@/types/storage";

/**
 * `/shipments/new` — `UX_SPEC.md` §3.12; `SITE_ARCHITECTURE.md` Flow B, D.
 *
 * Three steps on one route, the step in the URL: **Contents** (`?containers=`
 * — what `/containers/[id]`'s *Ship this container* sends), **Transport**,
 * and **Review and generate** (`?shipment=`, once step 2 has written the
 * shipment — its destination is a required column). P1 and P6 only; the
 * guard redirects every other role with the restriction named.
 *
 * **Nothing here decides a rule.** Step 1's refusals, step 2's air block and
 * step 3's checklist are the domain's, read through `features/shipments/
 * server`, and the adapter runs each again at commit. **The air block has no
 * override for any role** (Rules 6.7, 6.8): Air is rendered visible and
 * disabled beneath a `HardBlockNotice`, and the notice offers exactly Rule
 * 6.10's three paths.
 */

export const metadata: Metadata = {
  title: APP_ROUTE_NAMES["/shipments/new"],
};

type Step = 1 | 2 | 3;

const STEPS = [
  { id: "contents", label: STEP_LABELS.contents },
  { id: "transport", label: STEP_LABELS.transport },
  { id: "review", label: STEP_LABELS.review },
] as const;

function single(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  return value?.[0] ?? null;
}

function stepOf(value: string | null): Step {
  return value === "2" ? 2 : value === "3" ? 3 : 1;
}

function idsOf(value: string | null): readonly string[] {
  if (value === null) return [];
  return [
    ...new Set(
      value
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id !== ""),
    ),
  ];
}

export default async function NewShipmentPage({
  searchParams,
}: PageProps<"/shipments/new">) {
  const { ctx } = await requireRoute("/shipments/new");
  const params = await searchParams;
  const step = stepOf(single(params.step));
  const shipmentId = single(params.shipment);
  const containerIds = idsOf(single(params.containers));
  const modeParam = single(params.mode);

  let shipment: Shipment | null = null;
  if (shipmentId !== null) {
    shipment = await data.shipments.get(ctx, shipmentId);
    if (shipment === null) {
      await recordNotFound(ctx, "shipment", shipmentId);
      notFound();
    }
    // A departed shipment is built; its page is the ledger entry.
    if (!OPEN_SHIPMENT_STATUSES.includes(shipment.status)) {
      redirect(`/shipments/${shipment.id}`);
    }
  }

  const base =
    shipment === null
      ? "/shipments/new"
      : `/shipments/new?shipment=${shipment.id}`;
  const selection = containerIds.join(",");
  const hrefFor = (index: number): string => {
    if (shipment !== null) return `${base}&step=${index + 1}`;
    if (index === 0) {
      return selection === ""
        ? "/shipments/new"
        : `/shipments/new?containers=${selection}`;
    }
    return `/shipments/new?step=2&containers=${selection}`;
  };
  // Steps a shipment has actually recorded: a written shipment has its
  // contents and its transport; a new one has neither until step 2 saves it.
  const completedThrough = shipment !== null ? 1 : 0;

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            crumbs={breadcrumbTrail(
              "/shipments/new",
              ctx.role,
              APP_ROUTE_NAMES["/shipments/new"],
            )}
          />
        }
        title={APP_ROUTE_NAMES["/shipments/new"]}
        description={NEW_SHIPMENT_DESCRIPTION}
        {...(shipment === null
          ? {}
          : {
              meta: (
                <span className="inline-flex items-center gap-2">
                  <span className="font-mono text-body-strong">
                    {shipment.shipmentNumber}
                  </span>
                  <StatusBadge
                    system="shipment_status"
                    value={shipment.status}
                  />
                </span>
              ),
            })}
      />

      <ShipmentStepper
        steps={STEPS}
        currentIndex={step - 1}
        completedThrough={completedThrough}
        hrefs={STEPS.map((_step, index) => hrefFor(index))}
        disabledReasons={STEPS.map((_step, index) =>
          index === 1 && shipment === null && containerIds.length === 0
            ? STEP_LOCKED_SELECT
            : index === 2 && shipment === null
              ? STEP_LOCKED_TRANSPORT
              : index === 2 && step < 3
                ? STEP_LOCKED_REVIEW
                : null,
        )}
        label={STEPS_LABEL}
      />

      {step === 1 ? (
        <StepOne ctx={ctx} shipment={shipment} containerIds={containerIds} />
      ) : null}
      {step === 2 ? (
        <StepTwo
          ctx={ctx}
          shipment={shipment}
          containerIds={containerIds}
          modeParam={modeParam}
        />
      ) : null}
      {step === 3 ? <StepThree ctx={ctx} shipment={shipment} /> : null}
    </PageShell>
  );
}

// --- step 1 --------------------------------------------------------------------------------

async function StepOne({
  ctx,
  shipment,
  containerIds,
}: {
  readonly ctx: RequestContext;
  readonly shipment: Shipment | null;
  readonly containerIds: readonly string[];
}): Promise<ReactElement> {
  const candidates = await readShipmentCandidates(ctx, shipment);
  if (candidates.length === 0) {
    // E-2 — the picker is replaced by an explanatory state, never an empty list.
    return (
      <EmptyState
        icon={Boxes}
        title={ZERO_CONTAINERS_TITLE}
        description={ZERO_CONTAINERS_BODY}
        action={{
          label: OPEN_CONTAINERS,
          href: "/containers",
          dataAttributes: { "data-open-containers": "true" },
        }}
        dataAttributes={{ "data-shipment-no-containers": "true" }}
      />
    );
  }
  const known = new Set(candidates.map((candidate) => candidate.id));
  const initialSelection =
    containerIds.length > 0
      ? containerIds.filter((id) => known.has(id))
      : candidates
          .filter((candidate) => candidate.onThisShipment)
          .map((candidate) => candidate.id);
  const paperIssued = shipment?.status === "documents_issued";
  return (
    <ContentsStep
      candidates={candidates}
      initialSelection={initialSelection}
      shipment={shipment === null ? null : { id: shipment.id, paperIssued }}
    />
  );
}

// --- step 2 --------------------------------------------------------------------------------

function ContentsChanged({ href }: { readonly href: string }): ReactElement {
  return (
    <Alert
      role="alert"
      data-contents-changed="true"
      className={cn(INTENT_SURFACE_CLASSES.critical, "gap-3 px-4 py-4")}
    >
      <AlertTitle className="text-body-strong">{CONTENTS_CHANGED}</AlertTitle>
      <AlertDescription className="text-current">
        <Button
          asChild
          variant="outline"
          size="lg"
          className={ACTION_BUTTON_CLASS}
        >
          <Link href={href}>{STEP_LABELS.contents}</Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}

async function readSelection(
  ctx: RequestContext,
  ids: readonly string[],
): Promise<readonly Container[] | null> {
  const containers: Container[] = [];
  for (const id of ids) {
    const container = await data.containers.get(ctx, id);
    if (container === null) return null;
    containers.push(container);
  }
  return containers;
}

function defaultsFor(
  shipment: Shipment | null,
  country: string,
  mode: TransportMode,
): TransportDefaults {
  if (shipment === null) {
    return {
      transportMode: mode,
      destinationFacilityName: "",
      line1: "",
      line2: "",
      city: "",
      region: "",
      postalCode: "",
      country,
      destinationIdentifier: "",
      carrierName: "",
      transporterIdentifier: "",
    };
  }
  return {
    transportMode: mode,
    destinationFacilityName: shipment.destinationFacilityName,
    line1: shipment.destinationAddress.line1,
    line2: shipment.destinationAddress.line2 ?? "",
    city: shipment.destinationAddress.city,
    region: shipment.destinationAddress.region,
    postalCode: shipment.destinationAddress.postalCode,
    country: shipment.destinationAddress.country,
    destinationIdentifier: shipment.destinationIdentifier ?? "",
    carrierName: shipment.carrierName ?? "",
    transporterIdentifier: shipment.transporterIdentifier ?? "",
  };
}

async function StepTwo({
  ctx,
  shipment,
  containerIds,
  modeParam,
}: {
  readonly ctx: RequestContext;
  readonly shipment: Shipment | null;
  readonly containerIds: readonly string[];
  readonly modeParam: string | null;
}): Promise<ReactElement> {
  const stepOneHref =
    shipment === null
      ? `/shipments/new?containers=${containerIds.join(",")}`
      : `/shipments/new?shipment=${shipment.id}&step=1`;

  if (shipment === null && containerIds.length === 0) {
    redirect("/shipments/new");
  }
  if (shipment !== null && shipment.status === "documents_issued") {
    // T-18 — frozen once documents are issued; a contents change reopens them.
    redirect(`/shipments/${shipment.id}`);
  }

  const organization = await activeOrganization(ctx);
  const containers =
    shipment === null
      ? await readSelection(ctx, containerIds)
      : await shipmentContainers(ctx, shipment.id);
  if (containers === null || containers.length === 0) {
    return <ContentsChanged href={stepOneHref} />;
  }

  let scope: readonly ScopeContainer[] = [];
  let air: AirTransportAssessment | "unknown";
  try {
    scope = await readContainerScope(ctx, containers);
    air = assessAirTransport(scopeRecords(scope).map(airSubject));
  } catch (cause) {
    // §2.6 Error — fail closed: the constraint could not be evaluated, so
    // Air is unavailable until it can be.
    console.error(
      "[shipments] the air constraint could not be evaluated",
      cause,
    );
    air = "unknown";
  }

  // A new shipment's selection is re-validated — a container that changed
  // under the user sends them back to step 1 with the selection intact.
  if (shipment === null && air !== "unknown") {
    const [first] = containers;
    const refused = scope.some(
      (entry) =>
        !admitContainerToShipment(admissionFacts(entry, null), {
          organizationId: ctx.organizationId,
          transportMode: null,
          origin:
            first === undefined
              ? null
              : {
                  siteTimeZone: first.siteTimeZone,
                  siteAddress: first.siteAddress,
                },
        }).ok,
    );
    if (refused) return <ContentsChanged href={stepOneHref} />;
  }

  const airUnavailable = air === "unknown" || !air.available;
  const modes = TRANSPORT_MODES.map((value) => ({
    value,
    label: TRANSPORT_MODE_LABELS[value],
    unavailableReason:
      value !== "air" || !airUnavailable
        ? null
        : air === "unknown"
          ? AIR_CHECK_FAILED
          : AIR_UNAVAILABLE_TOOLTIP,
  }));
  const available = (mode: string | null): mode is TransportMode =>
    mode !== null &&
    isTaxonomyValue(TRANSPORT_MODES, mode) &&
    (mode !== "air" || !airUnavailable);
  const orgDefault = organization.defaultTransportMode;
  const mode: TransportMode = available(modeParam)
    ? modeParam
    : shipment !== null && available(shipment.transportMode)
      ? shipment.transportMode
      : available(orgDefault)
        ? orgDefault
        : "ground";

  const currentHref =
    shipment === null
      ? `/shipments/new?step=2&containers=${containerIds.join(",")}`
      : `/shipments/new?shipment=${shipment.id}&step=2`;
  const joiner = currentHref.includes("?") ? "&" : "?";

  return (
    <div className="flex flex-col gap-6">
      {air === "unknown" ? (
        <HardBlockNotice
          state="error"
          message={AIR_CHECK_FAILED}
          retryHref={currentHref}
          retryLabel={RETRY}
          dataAttribute="air"
        />
      ) : air.available ? null : (
        <AirBlock
          ctx={ctx}
          air={air}
          scope={scope}
          shipment={shipment}
          groundHref={`${currentHref}${joiner}mode=ground`}
        />
      )}
      <TransportStep
        modes={modes}
        defaults={defaultsFor(
          shipment,
          organization.primaryAddress.country,
          mode,
        )}
        target={
          shipment === null
            ? { kind: "new", containerIds: containers.map((row) => row.id) }
            : { kind: "existing", shipmentId: shipment.id }
        }
      />
    </div>
  );
}

/** Rules 6.9, 6.10 — the five parts, and exactly three paths. */
function AirBlock({
  ctx,
  air,
  scope,
  shipment,
  groundHref,
}: {
  readonly ctx: RequestContext;
  readonly air: Extract<AirTransportAssessment, { readonly available: false }>;
  readonly scope: readonly ScopeContainer[];
  readonly shipment: Shipment | null;
  readonly groundHref: string;
}): ReactElement {
  const blocking = new Set(
    air.blockingRecords.map((record) => record.recordId),
  );
  const remaining = scope
    .filter(
      (entry) => !entry.records.some(({ record }) => blocking.has(record.id)),
    )
    .map((entry) => entry.container.id);
  const removeHref =
    shipment === null
      ? `/shipments/new?containers=${remaining.join(",")}`
      : `/shipments/new?shipment=${shipment.id}&step=1&containers=${remaining.join(",")}`;
  const canOpenRecord = canReadRoute(ctx.role, "/batteries/[id]");
  const [first] = air.blockingRecords;
  return (
    <HardBlockNotice
      state="blocked"
      dataAttribute="air"
      title={AIR_BLOCK_TITLE}
      statement={AIR_PROHIBITION_STATEMENT}
      citations={air.citations}
      missingCitation={AIR_MISSING_CITATION}
      items={air.blockingRecords.map((record) => ({
        id: record.recordId,
        label: record.recordNumber,
        href: canOpenRecord ? `/batteries/${record.recordId}` : null,
        indicators: record.indicators.map(airBlockIndicatorText),
      }))}
      paths={[
        { id: "ground", label: PATH_GROUND, href: groundHref },
        { id: "remove", label: PATH_REMOVE, href: removeHref },
        ...(first === undefined || !canOpenRecord
          ? []
          : [
              {
                id: "reassess",
                label: PATH_REASSESS,
                href: `/batteries/${first.recordId}`,
              },
            ]),
      ]}
    />
  );
}

// --- step 3 --------------------------------------------------------------------------------

async function StepThree({
  ctx,
  shipment,
}: {
  readonly ctx: RequestContext;
  readonly shipment: Shipment | null;
}): Promise<ReactElement> {
  if (shipment === null) redirect("/shipments/new");
  if (shipment.status === "documents_issued") {
    redirect(`/shipments/${shipment.id}`);
  }

  const { build, organization, scope } = await readShippingPaperBuild(
    ctx,
    shipment,
    nowIso(),
  );
  const { draft } = build;
  const packagingSentence =
    draft.packagingException.basis === "no_rule_on_file"
      ? PACKAGING_NO_RULE
      : PACKAGING_UNREADABLE;
  // Every record's governing decision — on a line or not — with its reasoning.
  const classified = scopeRecords(scope);

  return (
    <div className="flex flex-col gap-6" data-review-step="true">
      <h2 className="text-h2">{REVIEW_TITLE}</h2>

      <PreconditionChecklist
        checklist={build.checklist}
        role={ctx.role}
        shipmentId={shipment.id}
      />

      {draft.manifestObligation.required ? (
        <Alert
          role="alert"
          data-manifest-obligation="true"
          className={cn(INTENT_SURFACE_CLASSES.attention, "gap-2 px-4 py-4")}
        >
          <AlertTitle className="text-body-strong">{MANIFEST_TITLE}</AlertTitle>
          <AlertDescription className="text-body text-current">
            {manifestBody(draft.manifestObligation.recordNumbers)}
          </AlertDescription>
        </Alert>
      ) : null}

      {draft.ddrRecordNumbers.length === 0 ? null : (
        <Alert
          role="alert"
          data-ddr-on-shipment="true"
          className={cn(INTENT_SURFACE_CLASSES.critical, "gap-2 px-4 py-4")}
        >
          <AlertTitle className="text-body-strong">{DDR_TITLE}</AlertTitle>
          <AlertDescription className="text-body text-current">
            {ddrBody(draft.ddrRecordNumbers)}
          </AlertDescription>
        </Alert>
      )}

      <SectionCard
        title={CLASSIFICATION_TITLE}
        dataAttributes={{ "data-line-classifications": "true" }}
      >
        <ul className="grid gap-3">
          {classified.map(({ record, classification }) => (
            <li
              key={record.id}
              data-line-record={record.recordNumber}
              className="flex flex-col gap-1"
            >
              <span className="inline-flex flex-wrap items-center gap-2">
                <span className="font-mono text-body-strong">
                  {record.recordNumber}
                </span>
                <StatusBadge
                  system="waste_classification"
                  value={classification?.wasteClassification ?? null}
                  size="sm"
                />
              </span>
              {classification === null ? null : (
                <span className="max-w-[72ch] text-body">
                  {classification.reasoning}
                </span>
              )}
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title={PACKAGING_TITLE}>
        <p
          data-packaging-exception={draft.packagingException.basis}
          className="max-w-[72ch] text-body"
        >
          {packagingSentence}
        </p>
      </SectionCard>

      <SectionCard
        title={LINES_TITLE}
        dataAttributes={{ "data-paper-draft": "true" }}
      >
        <div className="overflow-auto rounded-lg bg-muted p-4 md:p-8">
          <article
            aria-label={DRAFT_DETAIL}
            className="mx-auto flex w-full max-w-3xl flex-col gap-6 rounded-md border border-border bg-background p-6 text-foreground md:p-12"
          >
            <ShippingPaperDocument
              {...draftPaperProps({
                draft,
                shipment,
                organization,
                gap: PAPER_GAP,
              })}
              marking={
                <DocumentStatusMarking
                  status="draft"
                  statusLabel={DOCUMENT_RENDER_STATUS_LABELS.draft}
                  detail={DRAFT_DETAIL}
                />
              }
            />
          </article>
        </div>
      </SectionCard>

      <div>
        <GenerateControl
          shipmentId={shipment.id}
          complete={build.kind === "complete"}
        />
      </div>
    </div>
  );
}
