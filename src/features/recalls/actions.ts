"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";

import type { RequestContext } from "@/data/contracts";
import type { StorageWriteAttribution } from "@/data/contracts/storage";
import {
  mayTakeRecallAction,
  rolesForRecallAction,
  type RecallAction,
} from "@/domain/access/recall-actions";
import { ROLE_LABELS } from "@/domain/taxonomy/role";
import {
  actionFailed,
  actionFailedFrom,
  actionSucceeded,
  type ActionResult,
} from "@/lib/action-result";
import { requireActionOn } from "@/lib/auth/guard";
import { recordNotFound } from "@/lib/auth/record-denial";
import { nowIso } from "@/lib/auth/session";
import { requestAttribution } from "@/features/intake/server/session-action";
import { NotFoundError } from "@/lib/errors";

import { REFUSED_ACT } from "./recall-copy";
import {
  checkRecallsNowSchema,
  confirmRecallSchema,
  dismissRecallSchema,
  firstIssue,
  recordRecallSchema,
} from "./schemas";
import { runRecallCheck } from "./server/check";
import {
  confirmRecallMatchFor,
  dismissRecallMatchFor,
  recordRecallFor,
} from "./server/decide";

/**
 * The recall controls on `/batteries/[id]` — `UX_SPEC.md` §3.7; Rules 6.23,
 * 6.24, 10.10, 10.14–10.16; D-73 #4.
 *
 * Thin, as every action here is: (1) the guard — `/batteries/[id]` is
 * read-only for P2, who may still confirm, record and check, so the guard is
 * the recall action map (`mayTakeRecallAction`) on a route the role reads,
 * and a refusal is audited; (2) zod; (3) the work in `./server/*.ts`; (4)
 * `ActionResult`, never a throw across the boundary; (5) revalidate, because
 * a decision moves the record, its alerts and possibly a shipment.
 *
 * **Nothing here is optimistic.** A confirmed recall is a legal fact; the
 * control waits for the server and the page re-renders from `src/data`.
 */

const RECORD_ROUTE = "/batteries/[id]" as const;

/** "Handler, Facility Manager or Admin can …" — from the map, never a literal list. */
function refusal(action: RecallAction): string {
  const names = rolesForRecallAction(action).map((role) => ROLE_LABELS[role]);
  const who =
    names.length <= 1
      ? (names[0] ?? "No role")
      : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
  return `Your role cannot ${REFUSED_ACT[action]}. ${who} can.`;
}

export interface RecallActionResult {
  readonly flagsChanged: boolean;
  /** Rule 6.14 — the air shipments the decision held, by number. */
  readonly heldShipments: readonly string[];
}

async function recallAction<
  TInput extends { readonly recordId: string },
  TData,
>(
  action: RecallAction,
  attempted: string,
  schema: z.ZodType<TInput>,
  input: unknown,
  run: (
    ctx: RequestContext,
    parsed: TInput,
    attribution: StorageWriteAttribution,
  ) => Promise<TData>,
): Promise<ActionResult<TData>> {
  const guard = await requireActionOn(
    RECORD_ROUTE,
    attempted,
    (role) => mayTakeRecallAction(role, action),
    refusal(action),
  );
  if (!guard.ok) return guard;
  const { ctx } = guard;

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
    // The record, its list, the dashboard's alerts and any held shipment.
    revalidatePath("/", "layout");
    return actionSucceeded(result);
  } catch (error) {
    if (error instanceof NotFoundError) {
      await recordNotFound(ctx, "battery_record", parsed.data.recordId);
    }
    return actionFailedFrom(error, ctx.correlationId);
  }
}

export async function checkRecallsNow(
  input: unknown,
): Promise<ActionResult<{ readonly found: number }>> {
  return recallAction(
    "check_now",
    "checkRecallsNow",
    checkRecallsNowSchema,
    input,
    async (ctx, parsed, attribution) => {
      const recorded = await runRecallCheck(
        ctx,
        parsed.recordId,
        "check_now",
        nowIso(),
        attribution,
      );
      return { found: recorded.found.length };
    },
  );
}

export async function confirmRecall(
  input: unknown,
): Promise<ActionResult<RecallActionResult>> {
  return recallAction(
    "confirm",
    "confirmRecall",
    confirmRecallSchema,
    input,
    async (ctx, parsed, attribution) => {
      const decided = await confirmRecallMatchFor(
        ctx,
        parsed,
        nowIso(),
        attribution,
      );
      return {
        flagsChanged: decided.flagsChanged,
        heldShipments: decided.airShipments.map((held) => held.shipmentNumber),
      };
    },
  );
}

/**
 * Dismiss a possible match or withdraw a confirmed one. Both are P1's and
 * P6's (Rule 6.24), so one guard covers both; the server reads which the row
 * is and refuses the other roles either way.
 */
export async function dismissRecall(
  input: unknown,
): Promise<ActionResult<RecallActionResult>> {
  return recallAction(
    "dismiss",
    "dismissRecall",
    dismissRecallSchema,
    input,
    async (ctx, parsed, attribution) => {
      const decided = await dismissRecallMatchFor(
        ctx,
        parsed,
        nowIso(),
        attribution,
      );
      return {
        flagsChanged: decided.flagsChanged,
        heldShipments: [],
      };
    },
  );
}

export async function recordRecall(
  input: unknown,
): Promise<ActionResult<RecallActionResult>> {
  return recallAction(
    "record",
    "recordRecall",
    recordRecallSchema,
    input,
    async (ctx, parsed, attribution) => {
      const decided = await recordRecallFor(ctx, parsed, nowIso(), attribution);
      return {
        flagsChanged: decided.flagsChanged,
        heldShipments: decided.airShipments.map((held) => held.shipmentNumber),
      };
    },
  );
}
