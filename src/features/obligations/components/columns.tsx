import Link from "next/link";
import type { ReactNode } from "react";

import type { RecordTableColumn } from "@/components/record-table/record-table";
import { StatusBadge } from "@/components/status/status-badge";
import { MISSING_VALUE_FIXER } from "@/domain/producer";
import type { RoleCode } from "@/domain/taxonomy/role";

import {
  EDIT_STATES,
  MARK_DONE,
  NOT_CHECKED_YET,
  REMOVE,
  REOPEN,
} from "../obligation-copy";
import type { StateOption } from "./product-dialogs";
import { EditStatesDialog } from "./product-dialogs";
import { MarkDoneDialog } from "./mark-done-dialog";
import { producerControl } from "./obligation-controls";
import { RemoveProduct } from "./remove-product";
import { ReopenDeadline } from "./reopen-deadline";
import type { DeadlineView, ProductView, StateView } from "../view";

/**
 * The three tables on `/obligations` — `UX_SPEC.md` §3.21. Each column reads
 * a stored, decided value from `../view.ts`; none decides one.
 *
 * A table cell does not wrap (the primitive is `whitespace-nowrap`), and a
 * duty or a law's citation runs to a sentence — so those cells wrap at a
 * reading width, or the status column is pushed off the screen.
 */
const WRAP_WIDE = "block min-w-56 max-w-[44ch] whitespace-normal";
const WRAP_NARROW = "block min-w-32 max-w-[28ch] whitespace-normal";

export function deadlineColumns(input: {
  readonly role: RoleCode;
  readonly today: string;
  readonly people: ReadonlyMap<string, string>;
}): readonly RecordTableColumn<DeadlineView>[] {
  return [
    {
      id: "due",
      header: "Due",
      primary: true,
      cell: (row) => (
        <span data-deadline-due={row.dueOn}>
          {row.dueWords}
          <span className="block text-caption text-muted-foreground">
            {row.basisLabel}
          </span>
        </span>
      ),
    },
    {
      id: "state",
      header: "State",
      secondary: true,
      cell: (row) => row.state.name,
    },
    {
      id: "obligation",
      header: "Obligation",
      cell: (row) => (
        <span className={WRAP_WIDE} data-deadline-duty="true">
          {row.duty}
          {row.obligationStatus === "undetermined" ? (
            <span className="block text-caption text-muted-foreground">
              Can&apos;t tell yet whether it applies — open the States tab.
            </span>
          ) : null}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      status: true,
      cell: (row) => (
        <span
          className="flex flex-col items-start gap-1"
          data-deadline-standing={row.standing}
        >
          <StatusBadge
            system="obligation_deadline_standing"
            value={row.standing}
            {...(row.intent === "attention"
              ? { escalateTo: "attention" as const }
              : {})}
          />
          {row.standing === "completed" ? (
            <span
              className={`${WRAP_NARROW} text-caption text-muted-foreground`}
              data-deadline-completion="true"
            >
              Met {row.completedOn ?? ""}
              {row.completedBy === null
                ? ""
                : ` · marked by ${input.people.get(row.completedBy) ?? "a member"}`}
              {row.completionNote === null ? "" : ` · ${row.completionNote}`}
              {row.completionReference === null
                ? ""
                : ` · ${row.completionReference}`}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      id: "citation",
      header: "Citation",
      cell: (row) => (
        <span className={`${WRAP_NARROW} text-caption`}>
          {row.citation}
          <span className="block text-muted-foreground">
            Rule version {row.versionLabel}
          </span>
        </span>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      srOnlyHeader: true,
      cell: (row) => deadlineActions(row, input),
    },
  ];
}

function deadlineActions(
  row: DeadlineView,
  input: { readonly role: RoleCode; readonly today: string },
): ReactNode {
  if (row.standing === "open" || row.standing === "overdue") {
    return producerControl({
      role: input.role,
      action: "mark_deadline",
      isDestructive: false,
      label: MARK_DONE,
      dataAttributes: { "data-mark-done": row.id },
      live: () => (
        <MarkDoneDialog
          deadlineId={row.id}
          duty={row.duty}
          today={input.today}
        />
      ),
    });
  }
  if (row.standing === "completed") {
    return producerControl({
      role: input.role,
      action: "mark_deadline",
      isDestructive: true,
      label: REOPEN,
      dataAttributes: { "data-reopen": row.id },
      live: () => <ReopenDeadline deadlineId={row.id} />,
    });
  }
  return null;
}

export function stateColumns(): readonly RecordTableColumn<StateView>[] {
  return [
    {
      id: "state",
      header: "State",
      primary: true,
      cell: (row) => (
        <Link
          href={`/obligations?tab=states&state=${encodeURIComponent(row.state.code)}`}
          className="underline-offset-4 hover:underline"
          data-state-link={row.state.code}
        >
          {row.state.name}
        </Link>
      ),
    },
    {
      id: "law",
      header: "Law and citation",
      cell: (row) =>
        row.onFile ? (
          <span className={`${WRAP_WIDE} text-caption`}>{row.law}</span>
        ) : (
          <span
            className={`${WRAP_WIDE} text-caption text-muted-foreground`}
            data-no-rules={row.state.code}
          >
            {row.noRulesWords}
          </span>
        ),
    },
    {
      id: "agency",
      header: "Agency",
      cell: (row) => <span className={WRAP_NARROW}>{row.agency ?? "—"}</span>,
    },
    {
      id: "result",
      header: "Result",
      secondary: true,
      cell: (row) => (
        <span className={WRAP_NARROW} data-state-result={row.state.code}>
          {row.resultWords}
        </span>
      ),
    },
    {
      id: "next",
      header: "Next deadline",
      cell: (row) =>
        row.nextDeadline === null ? (
          <span className="text-muted-foreground">None open</span>
        ) : (
          <span className={WRAP_NARROW}>
            {row.nextDeadline.dueWords}
            <span className="block text-caption text-muted-foreground">
              {row.nextDeadline.duty}
            </span>
          </span>
        ),
    },
  ];
}

export function productColumns(input: {
  readonly role: RoleCode;
  readonly stateOptions: readonly StateOption[];
}): readonly RecordTableColumn<ProductView>[] {
  return [
    {
      id: "product",
      header: "Product",
      primary: true,
      cell: (row) => (
        <Link
          href={`/catalog/${row.catalogEntryId}`}
          className="underline-offset-4 hover:underline"
          data-product-entry={row.catalogEntryId}
        >
          {row.label}
        </Link>
      ),
    },
    {
      id: "facts",
      header: "From the catalog",
      secondary: true,
      cell: (row) => (
        <span
          className={`${WRAP_NARROW} text-caption`}
          data-product-facts={row.id}
        >
          {row.chemistry} ·{" "}
          {row.massKg === null ? "No weight on file" : `${row.massKg} kg`} ·{" "}
          {row.energyWh === null ? "No energy on file" : `${row.energyWh} Wh`} ·{" "}
          {row.removability}
          {row.missingValues.length === 0 ? null : (
            <span
              className="block text-muted-foreground"
              data-product-missing={row.id}
            >
              Missing: {row.missingValues.join(", ")}. {MISSING_VALUE_FIXER}
            </span>
          )}
        </span>
      ),
    },
    {
      id: "states",
      header: "Band in each state",
      cell: (row) =>
        row.states.length === 0 ? (
          NOT_CHECKED_YET
        ) : (
          <ul
            className={`${WRAP_WIDE} flex flex-col gap-1`}
            data-product-bands={row.id}
          >
            {row.states.map((state) => (
              <li
                key={state.state.jurisdictionId}
                data-product-band={state.state.code}
              >
                {state.words}
              </li>
            ))}
          </ul>
        ),
    },
    {
      id: "actions",
      header: "Actions",
      srOnlyHeader: true,
      cell: (row) => (
        <div className="flex flex-wrap gap-2">
          {producerControl({
            role: input.role,
            action: "manage_products",
            isDestructive: false,
            label: EDIT_STATES,
            dataAttributes: { "data-edit-states": row.id },
            live: () => (
              <EditStatesDialog
                productId={row.id}
                productLabel={row.label}
                stateOptions={input.stateOptions}
                current={row.stateIds}
              />
            ),
          })}
          {producerControl({
            role: input.role,
            action: "manage_products",
            isDestructive: true,
            label: REMOVE,
            dataAttributes: { "data-remove-product": row.id },
            live: () => <RemoveProduct productId={row.id} />,
          })}
        </div>
      ),
    },
  ];
}
