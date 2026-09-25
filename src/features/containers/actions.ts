"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";

import { data } from "@/data";
import type {
  ContainerContentsMoveResult,
  RequestContext,
} from "@/data/contracts";
import {
  mayTakeContainerAction,
  rolesForContainerAction,
  type ContainerAction,
} from "@/domain/access/container-actions";
import { instantAtSiteTime } from "@/domain/storage/clock-display";
import { ROLE_LABELS } from "@/domain/taxonomy/role";
import { firstIssue } from "@/features/intake/schemas";
import type { RequestAttribution } from "@/features/intake/server/audit";
import { requestAttribution } from "@/features/intake/server/session-action";
import {
  actionFailed,
  actionFailedFrom,
  actionSucceeded,
  type ActionResult,
} from "@/lib/action-result";
import { requireWrite } from "@/lib/auth/guard";
import { nowIso } from "@/lib/auth/session";
import { recordNotFound, recordWriteDenial } from "@/lib/auth/record-denial";
import { DataIntegrityError, NotFoundError } from "@/lib/errors";
import type { Uuid } from "@/types/common";
import type { Container, StorageEvent } from "@/types/storage";

import {
  containerIdSchema,
  createContainerSchema,
  editContainerDetailsSchema,
  moveContentsSchema,
  recordInspectionSchema,
  recordRemediationSchema,
} from "./schemas";
import { resolveReceivingRule } from "./server/receiving-rule";

/**
 * The container writes — `UX_SPEC.md` §3.9, §3.10; `SITE_ARCHITECTURE.md`
 * §5.5.
 *
 * Every action runs the same steps (`TECHNICAL_SPEC.md` §7.1): the write guard
 * for `/containers/[id]` — P1, P2 and P6 hold it — then **§5.5's write set**,
 * because P1 and P2 hold write and not the same write. A refusal at either
 * step is audited as an attempt (Rules 1.16, 12.6) and names who can
 * (Rule 1.26). Then a zod parse, the adapter's one operation, and a refresh.
 *
 * **None of these accepts a date that re-dates a clock** — there is no field
 * for one (Rules 4.6, 4.9–4.12). A move sends which batteries go where; the
 * adapter decides the dates.
 */

const DETAIL_ROUTE = "/containers/[id]";

/** "A Facility Manager or a Platform Admin can …" — built from the §5.5 map, never a literal list. */
function whoCan(action: ContainerAction): string {
  const names = rolesForContainerAction(action).map(
    (role) => ROLE_LABELS[role],
  );
  if (names.length <= 1) return names[0] ?? "No role";
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

async function containerAction<TInput, TData>(
  action: ContainerAction,
  attempted: string,
  denial: string,
  schema: z.ZodType<TInput>,
  input: unknown,
  run: (
    ctx: RequestContext,
    parsed: TInput,
    attribution: RequestAttribution,
  ) => Promise<TData>,
): Promise<ActionResult<TData>> {
  const guard = await requireWrite(DETAIL_ROUTE, attempted);
  if (!guard.ok) return guard;
  const { ctx } = guard;

  if (!mayTakeContainerAction(ctx.role, action)) {
    await recordWriteDenial(ctx, DETAIL_ROUTE, attempted);
    return actionFailed<TData>({
      code: "FORBIDDEN",
      message: `${whoCan(action)} can ${denial}.`,
      correlationId: ctx.correlationId,
    });
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const issue = firstIssue(parsed.error);
    return actionFailed<TData>({
      code: "VALIDATION",
      message: issue.message,
      ...(issue.field === undefined ? {} : { field: issue.field }),
      correlationId: ctx.correlationId,
    });
  }

  try {
    const result = await run(ctx, parsed.data, await requestAttribution());
    // Every container screen, the dashboard's alerts and the review
    // roll-up read what a container write changes.
    revalidatePath("/", "layout");
    return actionSucceeded(result);
  } catch (error) {
    const containerId = (parsed.data as { containerId?: unknown }).containerId;
    if (error instanceof NotFoundError && typeof containerId === "string") {
      await recordNotFound(ctx, "container", containerId);
    }
    return actionFailedFrom<TData>(error, ctx.correlationId);
  }
}

async function organizationOf(ctx: RequestContext) {
  const organization = await data.organizations.get(ctx, ctx.organizationId);
  if (organization === null) {
    throw new DataIntegrityError({
      userMessage: "Your organization could not be read. Nothing was changed.",
      correlationId: ctx.correlationId,
    });
  }
  return organization;
}

/**
 * **New container** — §3.9's primary action, P1, P2 and P6.
 *
 * The type is chosen and is effectively terminal once the container holds
 * anything (T-23); the zone comes from the organization; no start date exists
 * until the first placement (Rule 4.4).
 */
export async function createContainer(
  input: unknown,
): Promise<ActionResult<{ readonly id: Uuid }>> {
  return containerAction(
    "create",
    "createContainer",
    "create a container",
    createContainerSchema,
    input,
    async (ctx, parsed) => {
      const organization = await organizationOf(ctx);
      const container = await data.containers.create(ctx, {
        containerType: parsed.containerType,
        lotId: null,
        shipmentId: null,
        capacityKg: null,
        capacityVolumeM3: null,
        siteAddress: null,
        siteTimeZone: organization.timeZone,
        storageLocation: parsed.storageLocation,
        status: "open",
        sealedAt: null,
        closedAt: null,
      });
      // TODO(T-43): creating a container is an audited act (Rule 12.1) and
      // T-43 carries no `container.created`. Written nowhere rather than under
      // a near neighbour — the same gap intake's creation carries.
      return { id: container.id };
    },
  );
}

/** Move, consolidate or split — records leave one container for another (Rules 4.9–4.12). */
export async function moveContents(
  input: unknown,
): Promise<ActionResult<ContainerContentsMoveResult>> {
  return containerAction(
    "add_or_remove_records",
    "moveContents",
    "move batteries between containers",
    moveContentsSchema,
    input,
    async (ctx, parsed, attribution) => {
      const [organization, source, target] = await Promise.all([
        organizationOf(ctx),
        data.containers.get(ctx, parsed.sourceContainerId),
        data.containers.get(ctx, parsed.targetContainerId),
      ]);
      if (source === null || target === null) {
        const missing =
          source === null ? parsed.sourceContainerId : parsed.targetContainerId;
        await recordNotFound(ctx, "container", missing);
        throw new NotFoundError({
          userMessage: "That container was not found. Nothing was moved.",
          correlationId: ctx.correlationId,
        });
      }
      const accumulationRule = await resolveReceivingRule(ctx, {
        operation: parsed.operation,
        organization,
        source,
        target,
        batteryRecordIds: parsed.batteryRecordIds,
      });
      return data.containers.moveContents(ctx, {
        operation: parsed.operation,
        sourceContainerId: source.id,
        targetContainerId: target.id,
        batteryRecordIds: parsed.batteryRecordIds,
        at: nowIso(),
        accumulationRule,
        attribution,
      });
    },
  );
}

async function containerOrThrow(
  ctx: RequestContext,
  containerId: Uuid,
): Promise<Container> {
  const container = await data.containers.get(ctx, containerId);
  if (container === null) {
    throw new NotFoundError({
      userMessage: "That container was not found. Nothing was recorded.",
      correlationId: ctx.correlationId,
    });
  }
  return container;
}

/** An inspection, dated in the site's time (§3.10 storage-event dialog; Rule 4.29). */
export async function recordInspection(
  input: unknown,
): Promise<ActionResult<StorageEvent>> {
  return containerAction(
    "record_storage_event",
    "recordInspection",
    "record a storage event",
    recordInspectionSchema,
    input,
    async (ctx, parsed, attribution) => {
      const container = await containerOrThrow(ctx, parsed.containerId);
      const [date = "", time = ""] = parsed.occurredAt.split("T");
      const [hour = "0", minute = "0"] = time.split(":");
      return data.containers.recordStorageEvent(ctx, {
        kind: "inspect",
        containerId: container.id,
        occurredAt: instantAtSiteTime(
          date,
          Number(hour),
          Number(minute),
          container.siteTimeZone,
        ),
        note: parsed.note,
        at: nowIso(),
        attribution,
      });
    },
  );
}

/**
 * A remediation on an overdue container — P2 or P6, with a statement of what
 * was done and why (Rule 4.17). It changes no date and no status: the owner's
 * call in this unit, reported in the build-notes.
 */
export async function recordRemediation(
  input: unknown,
): Promise<ActionResult<StorageEvent>> {
  return containerAction(
    "record_remediation",
    "recordRemediation",
    "record a remediation",
    recordRemediationSchema,
    input,
    async (ctx, parsed, attribution) => {
      const at = nowIso();
      return data.containers.recordStorageEvent(ctx, {
        kind: "remediate",
        containerId: parsed.containerId,
        occurredAt: at,
        statement: parsed.statement,
        at,
        attribution,
      });
    },
  );
}

/** **Mark ready to ship** — T-24 `closed`, sealed and ready for shipment (Flow C4(c)). */
export async function markReadyToShip(
  input: unknown,
): Promise<ActionResult<Container>> {
  return containerAction(
    "mark_ready_to_ship",
    "markReadyToShip",
    "mark a container ready to ship",
    containerIdSchema,
    input,
    async (ctx, parsed, attribution) =>
      data.containers.changeStatus(ctx, {
        containerId: parsed.containerId,
        status: "closed",
        at: nowIso(),
        attribution,
      }),
  );
}

/** Retire an empty container whose clock has closed (Rule 4.30). A container is never deleted. */
export async function retireContainer(
  input: unknown,
): Promise<ActionResult<Container>> {
  return containerAction(
    "retire",
    "retireContainer",
    "retire a container",
    containerIdSchema,
    input,
    async (ctx, parsed, attribution) =>
      data.containers.changeStatus(ctx, {
        containerId: parsed.containerId,
        status: "retired",
        at: nowIso(),
        attribution,
      }),
  );
}

/** Capacity and location — P2 and P6 (§5.5). Neither moves a date. */
export async function editContainerDetails(
  input: unknown,
): Promise<ActionResult<Container>> {
  return containerAction(
    "edit_capacity_or_location",
    "editContainerDetails",
    "edit a container's capacity or location",
    editContainerDetailsSchema,
    input,
    async (ctx, parsed) => {
      await containerOrThrow(ctx, parsed.containerId);
      const updated = await data.containers.update(ctx, parsed.containerId, {
        storageLocation: parsed.storageLocation,
        capacityKg: parsed.capacityKg,
      });
      // TODO(T-43): an edit to a container's capacity or location is an
      // audited act (Rule 12.1) and T-43 has no type for it
      // (`container.status_changed` is a status move, which this is not).
      // Written nowhere rather than under a near neighbour.
      return updated;
    },
  );
}
