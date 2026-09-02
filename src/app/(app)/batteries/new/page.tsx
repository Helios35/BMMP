import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { formatInstant } from "@/components/extraction-review";
import { PageHeader, PageShell } from "@/components/page";
import { data } from "@/data";
import { canReadRoute } from "@/domain/access/route-capability";
import { APP_ROUTE_NAMES } from "@/domain/access/routes";
import { commitFieldStates } from "@/domain/intake/draft";
import {
  INTAKE_FLOW_STEPS,
  stepIndex,
  type IntakeFlowStep,
} from "@/domain/intake/steps";
import { INTAKE_STEP_LABELS } from "@/domain/taxonomy/intake-step";
import {
  IntakeBlockedNotice,
  IntakeGraceNotice,
} from "@/features/consent/components/intake-blocked-notice";
import { readIntakeGate } from "@/features/consent/read-intake-gate";
import { resolveUserNames } from "@/features/battery-record/user-names";
import { ConfirmAndPlaceStep } from "@/features/intake/components/confirm-and-place-step";
import { ExtractionReviewStep } from "@/features/intake/components/extraction-review-step";
import {
  INTAKE_ROUTE,
  intakeStepHref,
  parseIntakeStepParam,
} from "@/features/intake/components/intake-hrefs";
import { IntakeStart } from "@/features/intake/components/intake-start";
import {
  ResumeNotice,
  type ResumeNoticeSession,
} from "@/features/intake/components/resume-notice";
import {
  readIntakeStepView,
  readOpenSessions,
  type IntakeStepView,
} from "@/features/intake/server/read-intake";
import {
  catalogProposal,
  catalogQuery,
  clockPreview,
  commitGateInput,
  containerRows,
  existingPhotos,
  jurisdictionLabel,
  requiredTypeLabel,
  reviewCardView,
  reviewPlaceholders,
  summaryFields,
  WHO_CAN_CREATE_CONTAINER,
} from "@/features/intake/server/step-views";
import { Breadcrumbs } from "@/features/shell/chrome/breadcrumbs";
import { breadcrumbTrail } from "@/features/shell/navigation/breadcrumb-ancestors";
import { requireRoute } from "@/lib/auth/guard";
import { recordNotFound } from "@/lib/auth/record-denial";
import { nowIso } from "@/lib/auth/session";

/**
 * `/batteries/new` — the three-step intake, behind the Terms of Service
 * gate (`UX_SPEC.md` §3.6, §3.9, §2.1, §2.12; `SITE_ARCHITECTURE.md` §1.3;
 * `TECHNICAL_SPEC.md` §7.3, §11.1).
 *
 * **The gate blocks intake, not the app** (Rules 7.1, 7.2; E-12), and it is
 * checked here rather than in middleware so every read-only route stays
 * reachable while consent is pending. P1 and P6 hold `write` here and no
 * other role holds anything, so everyone else is redirected before a byte of
 * this file runs (§5.2, §5.3(4)).
 *
 * ## The URL is a view of the session
 *
 * `?session=` names the intake and `?step=` the step being looked at.
 * **The durable position is `intake_session.current_step`** (T-53, Rule
 * 2.2): a request for a step ahead of it is answered with a redirect to the
 * canonical URL of the step the session is actually on, because a URL
 * cannot move the pipeline. An earlier step may be revisited and discards
 * nothing. `?container=` is the drum the person is standing next to,
 * carried onto the draft when the session starts and back here by **Log
 * another**.
 *
 * ## What is composed where
 *
 * The step's view is read once through `src/data`
 * (`readIntakeStepView`) and turned into plain props on the server
 * (`step-views.ts`); the three step compositions are client components that
 * add only what the browser knows — the network, a pending action — and
 * every write goes back through the Server Actions bound in
 * `bind-actions.ts`. Nothing here decides a rule; the classification, the
 * admissions and the clock arrive decided.
 *
 * An absent session and another tenant's read the same: `null` from the
 * seam, a recorded denial, `notFound()` (Rule 1.2; §5.3(5)).
 */

export const metadata: Metadata = {
  title: APP_ROUTE_NAMES[INTAKE_ROUTE],
};

const UPLOAD_URL = "/api/intake/photos";

function firstParam(value: string | string[] | undefined): string | null {
  const single = Array.isArray(value) ? value[0] : value;
  return single === undefined || single === "" ? null : single;
}

export default async function LogBatteryPage({
  searchParams,
}: PageProps<"/batteries/new">) {
  const { ctx } = await requireRoute(INTAKE_ROUTE);
  const gate = await readIntakeGate(ctx);

  if (gate.status === "blocked") {
    return (
      <PageShell>
        <PageHeader
          title={APP_ROUTE_NAMES["/batteries/new"]}
          // The block is pinned below the title, in the slot §2.9 fixes for
          // every notice that qualifies what the page can do.
          notice={
            <IntakeBlockedNotice
              gate={gate}
              canReachOrganizationSettings={canReadRoute(
                ctx.role,
                "/settings/organization",
              )}
            />
          }
        />
      </PageShell>
    );
  }

  const params = await searchParams;
  const sessionId = firstParam(params.session);
  const containerParam = firstParam(params.container);
  const title = APP_ROUTE_NAMES[INTAKE_ROUTE];

  // §2.4 — a multi-step route carries the trail, resolved server-side
  // against the capability map so no crumb links where the role is sent away.
  const breadcrumbs = (
    <Breadcrumbs crumbs={breadcrumbTrail(INTAKE_ROUTE, ctx.role, title)} />
  );
  const grace = <IntakeGraceNotice gate={gate} />;

  /* ---------------------------------------------------- no session yet */

  if (sessionId === null) {
    const [open, container] = await Promise.all([
      readOpenSessions(ctx),
      containerParam === null
        ? Promise.resolve(null)
        : data.containers.get(ctx, containerParam),
    ]);
    return (
      <IntakeStart
        frame={{ title, breadcrumbs, notice: grace }}
        sessionId={null}
        sessionStatus={null}
        containerContext={
          container === null
            ? null
            : { id: container.id, code: container.containerCode }
        }
        existingPhotos={[]}
        labelPhoto={null}
        resumeSessions={open.map(resumeSession)}
        uploadUrl={UPLOAD_URL}
      />
    );
  }

  /* --------------------------------------------------- with a session */

  const view = await readIntakeStepView(ctx, sessionId);
  if (view === null) {
    // Denials are evidence (Rules 1.16, 12.6), and this row is identical
    // whether the session is absent or belongs to another tenant.
    await recordNotFound(ctx, "intake_session", sessionId);
    notFound();
  }

  // A session that has left the flow is read on its record, never re-entered.
  if (
    view.step === "complete" ||
    view.session.status === "completed" ||
    view.session.status === "abandoned"
  ) {
    redirect(`/batteries/${view.record.id}`);
  }

  const reached: IntakeFlowStep = view.step;
  const requested = parseIntakeStepParam(firstParam(params.step));
  if (requested !== null && requested > stepIndex(reached)) {
    redirect(intakeStepHref(view.session.id, reached));
  }
  const shown: IntakeFlowStep =
    requested === null
      ? reached
      : (INTAKE_FLOW_STEPS[requested - 1] ?? reached);

  // Flow A-a — "Picking up where you left off", for the session in hand.
  const notice = (
    <>
      {grace}
      <ResumeNotice sessions={[resumeSession(view)]} />
    </>
  );
  const frame = { title, breadcrumbs, notice };

  if (shown === "capture") {
    const others = (await readOpenSessions(ctx)).filter(
      (summary) => summary.session.id !== view.session.id,
    );
    const container = view.placementPreview.chosen?.container ?? null;
    return (
      <IntakeStart
        frame={frame}
        sessionId={view.session.id}
        sessionStatus={view.session.status}
        reachedStep={reached}
        containerContext={
          container === null
            ? null
            : { id: container.id, code: container.containerCode }
        }
        existingPhotos={existingPhotos(view)}
        labelPhoto={
          view.labelPhoto === null
            ? null
            : {
                id: view.labelPhoto.id,
                width: view.labelPhoto.widthPx,
                height: view.labelPhoto.heightPx,
                fileName: null,
              }
        }
        resumeSessions={others.map(resumeSession)}
        uploadUrl={UPLOAD_URL}
      />
    );
  }

  if (shown === "extraction_review") {
    return (
      <ExtractionReviewStep
        frame={frame}
        sessionId={view.session.id}
        batteryRecordId={view.record.id}
        correlationId={view.session.correlationId}
        reachedStep={reached}
        labelPhotoId={view.labelPhoto?.id ?? null}
        card={reviewCardView(view)}
        fieldStates={commitFieldStates(view.draft)}
        images={reviewPlaceholders(view)}
        proposal={catalogProposal(view)}
        catalogQuery={catalogQuery(view)}
      />
    );
  }

  const asOf = nowIso();
  const confirmedBy = view.draft.condition?.confirmedBy ?? null;
  const names = await resolveUserNames(ctx, [confirmedBy]);
  const confirmedAt = view.draft.condition?.confirmedAt ?? null;

  return (
    <ConfirmAndPlaceStep
      frame={frame}
      sessionId={view.session.id}
      uploadUrl={UPLOAD_URL}
      condition={{
        findings: view.draft.condition?.findingTypes ?? [],
        isDefective: view.draft.condition?.isDefective ?? false,
        confirmed:
          confirmedBy === null || confirmedAt === null
            ? null
            : {
                byName:
                  names.get(confirmedBy) ??
                  (confirmedBy === ctx.userId
                    ? (view.viewer.fullName ?? "you")
                    : "a colleague"),
                at: formatInstant(confirmedAt, view.site.timeZone),
              },
      }}
      stateOfCharge={view.draft.stateOfCharge}
      sourceDevice={view.draft.sourceDevice}
      placement={{
        containers: containerRows(view),
        selectedId: view.draft.containerId,
        requiredTypeLabel: requiredTypeLabel(view),
        whoCanCreate: WHO_CAN_CREATE_CONTAINER,
      }}
      classification={{
        preview: view.classificationPreview,
        jurisdictionLabel: jurisdictionLabel(view),
      }}
      clock={clockPreview(view, asOf)}
      summary={summaryFields(view)}
      commitGate={commitGateInput(view)}
    />
  );
}

/** One unfinished intake, as the resume notice lists it. */
function resumeSession(summary: {
  readonly session: IntakeStepView["session"];
  readonly step: IntakeStepView["step"];
}): ResumeNoticeSession {
  const step: IntakeFlowStep =
    summary.step === "complete" ? "confirm_and_place" : summary.step;
  return {
    id: summary.session.id,
    startedAt: summary.session.startedAt,
    stepLabel: INTAKE_STEP_LABELS[step],
    href: intakeStepHref(summary.session.id, step),
  };
}
