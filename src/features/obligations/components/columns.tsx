import Link from "next/link";
import type { ReactNode } from "react";

import type { RecordTableColumn } from "@/components/record-table/record-table";
import { StatusBadge } from "@/components/status/status-badge";
import { MISSING_VALUE_FIXER } from "@/domain/producer";
import type { RoleCode } from "@/domain/taxonomy/role";

import { NOT_ON_FILE } from "@/domain/producer/filing-words";

import {
  EDIT_STATES,
  MAKE_PACKET,
  MARK_DONE,
  NOT_CHECKED_YET,
  PACKETS_UNDER_DEADLINE,
  PLAN,
  RECORD_SALES,
  REMOVE,
  REOPEN,
  SALES_NOT_ON_FILE_FIXER,
  SALES_REPLACED,
} from "../obligation-copy";
import type { FilingSummary, PacketLink } from "../packet-view";
import type { SalesRowView } from "../sales-view";
import type { StateOption } from "./product-dialogs";
import { EditStatesDialog } from "./product-dialogs";
import { MakePacketDialog } from "./make-packet-dialog";
import { MarkDoneDialog } from "./mark-done-dialog";
import { producerControl } from "./obligation-controls";
import { RecordSalesDialog, type SalesPair } from "./record-sales-dialog";
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

/** The packets listed under a deadline, each opening at `/documents/[id]` (Rule 8.19). */
function PacketList({
  packets,
}: {
  readonly packets: readonly PacketLink[];
}): ReactNode {
  if (packets.length === 0) return null;
  return (
    <span className="mt-1 flex flex-col gap-1" data-deadline-packets="true">
      <span className="text-caption text-muted-foreground">
        {PACKETS_UNDER_DEADLINE}
      </span>
      {packets.map((packet) => (
        <Link
          key={packet.id}
          href={packet.href}
          className="text-caption underline underline-offset-4"
          data-deadline-packet={packet.id}
          data-packet-status={packet.status}
        >
          {packet.title} · {packet.statusLabel} · {packet.issuedText}
        </Link>
      ))}
    </span>
  );
}

export function deadlineColumns(input: {
  readonly role: RoleCode;
  readonly today: string;
  readonly people: ReadonlyMap<string, string>;
  /** Each deadline's packets (Rule 8.19). */
  readonly packets: ReadonlyMap<string, readonly PacketLink[]>;
  /** The filing in force for each obligation that has one (Rule 8.18). */
  readonly filings: ReadonlyMap<string, FilingSummary>;
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
              {input.filings.has(row.obligationId)
                ? " No packet until it can be told (Rule 8.19)."
                : null}
            </span>
          ) : null}
          <PacketList packets={input.packets.get(row.id) ?? []} />
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
              {row.evidenceDocumentRenderId === null ? null : (
                <>
                  {" · "}
                  <Link
                    href={`/documents/${row.evidenceDocumentRenderId}`}
                    className="underline underline-offset-4"
                    data-deadline-evidence={row.evidenceDocumentRenderId}
                  >
                    Evidence:{" "}
                    {input.packets
                      .get(row.id)
                      ?.find(
                        (packet) => packet.id === row.evidenceDocumentRenderId,
                      )?.title ?? "the packet"}
                  </Link>
                </>
              )}
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
  input: {
    readonly role: RoleCode;
    readonly today: string;
    readonly packets: ReadonlyMap<string, readonly PacketLink[]>;
    readonly filings: ReadonlyMap<string, FilingSummary>;
  },
): ReactNode {
  if (row.standing === "open" || row.standing === "overdue") {
    // A packet for a deadline whose obligation applies and has a filing in
    // the rule data (Rule 8.19) — never one that can't be told.
    const packetable =
      row.obligationStatus === "applies" && input.filings.has(row.obligationId);
    const issued = (input.packets.get(row.id) ?? []).filter(
      (packet) => packet.status === "issued",
    );
    return (
      <div className="flex flex-wrap gap-2">
        {packetable
          ? producerControl({
              role: input.role,
              action: "make_packets",
              isDestructive: false,
              label: MAKE_PACKET,
              dataAttributes: { "data-make-packet": row.id },
              live: () => (
                <MakePacketDialog deadlineId={row.id} duty={row.duty} />
              ),
            })
          : null}
        {producerControl({
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
              packets={issued.map((packet) => ({
                id: packet.id,
                label: `${packet.title} — ${packet.issuedText}`,
              }))}
            />
          ),
        })}
      </div>
    );
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
        <span className="flex flex-col gap-1">
          <Link
            href={`/catalog/${row.catalogEntryId}`}
            className="underline-offset-4 hover:underline"
            data-product-entry={row.catalogEntryId}
          >
            {row.label}
          </Link>
          <Link
            href={`/obligations?tab=products&product=${encodeURIComponent(row.id)}`}
            className="text-caption underline underline-offset-4"
            data-product-plan-link={row.id}
          >
            {PLAN}
          </Link>
        </span>
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

/** The pair a row records sales for, with what is on file now (Rule 8.17). */
export function salesPairOf(
  row: SalesRowView,
  correction: (row: SalesRowView) => string | null,
): SalesPair {
  return {
    key: row.key,
    productId: row.productId,
    jurisdictionId: row.state.jurisdictionId,
    label: `${row.productLabel} — ${row.state.name}`,
    correction: correction(row),
  };
}

export function salesColumns(input: {
  readonly role: RoleCode;
  readonly year: number;
  readonly correction: (row: SalesRowView) => string | null;
}): readonly RecordTableColumn<SalesRowView>[] {
  return [
    {
      id: "product",
      header: "Product",
      primary: true,
      cell: (row) => (
        <span
          data-sales-row={row.key}
          data-sales-replaced={String(row.replaced)}
        >
          {row.productLabel}
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
      id: "units",
      header: "Units",
      status: true,
      cell: (row) =>
        row.entry === null ? (
          <span className="flex flex-col items-start gap-1">
            <span
              className="rounded-md border border-border px-2 py-1 text-label"
              data-sales-not-on-file="true"
            >
              {NOT_ON_FILE}
            </span>
            <span className="text-caption text-muted-foreground">
              {SALES_NOT_ON_FILE_FIXER}
            </span>
          </span>
        ) : (
          <span
            className="flex flex-col items-start gap-1"
            data-sales-units={row.entry.units}
          >
            <span className={row.replaced ? "line-through" : undefined}>
              {row.entry.unitsText}
            </span>
            {row.replaced ? (
              <span
                className="text-caption text-muted-foreground"
                data-sales-replaced-label="true"
              >
                {SALES_REPLACED}
                {row.replacedAtText === null ? "" : ` ${row.replacedAtText}`}
              </span>
            ) : null}
          </span>
        ),
    },
    {
      id: "note",
      header: "Note",
      cell: (row) => (
        <span className={WRAP_WIDE}>
          {row.entry === null ? "—" : row.entry.basisNote}
        </span>
      ),
    },
    {
      id: "recorded",
      header: "Recorded",
      cell: (row) =>
        row.entry === null ? (
          "—"
        ) : (
          <span className={`${WRAP_NARROW} text-caption`}>
            {row.entry.recordedBy}
            <span className="block text-muted-foreground">
              {row.entry.recordedAtText}
            </span>
          </span>
        ),
    },
    {
      id: "actions",
      header: "Actions",
      srOnlyHeader: true,
      cell: (row) =>
        row.replaced
          ? null
          : producerControl({
              role: input.role,
              action: "record_sales",
              isDestructive: false,
              label: RECORD_SALES,
              dataAttributes: { "data-record-sales": row.key },
              live: () => (
                <RecordSalesDialog
                  pairs={[salesPairOf(row, input.correction)]}
                  year={input.year}
                  preset={row.key}
                />
              ),
            }),
    },
  ];
}
