import { StatusBadge } from "@/components/status/status-badge";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TimeZone } from "@/types/common";
import { cn } from "@/lib/utils";
import { OWN_ROLE_UNCHANGEABLE_NOTE } from "../member-rules";
import type { MemberRow } from "../read-members";
import { roleCapabilitySummary } from "../role-capability-summary";
import { NOT_RECORDED, ZonedDate } from "./settings-primitives";

/**
 * The member table — `UX_SPEC.md` §3.18.
 *
 * **Not `RecordTable`.** That component is the list surface behind `/batteries`,
 * `/catalog`, `/containers`, `/shipments`, `/review` and `/audit`, and it always
 * renders a search box wired to the adapter's `search`. `MembershipQuery.search`
 * matches `invited_email` and nothing else, so a search box here would return
 * nothing for every accepted member — a control that appears to work and does
 * not. §3.18 names a plain `Table` and specifies no search, no filter and no
 * paging: this is one organization's complete membership, not a list view.
 *
 * **Status renders as plain text, never a `StatusBadge`.** No `TAXONOMY.md`
 * system governs membership status, `StatusBadge` renders taxonomy values only,
 * and a badge over an ungoverned string is how an invented vocabulary acquires a
 * colour.
 *
 * **Every mutating control is absent** — no Invite member, no change role, no
 * resend invitation, no Deactivate, no Grant auditor access. Absent rather than
 * disabled: P5 cannot reach this route and every role that can holds `write`, so
 * a disabled control here would be disabled for a reason that is not a
 * permission, which §2.9's table does not admit. Nothing is greyed out and
 * nothing is dead.
 *
 * The role description in each cell is **computed from `ROUTE_ACCESS`**, so it
 * cannot drift from what the guard enforces.
 */

const COLUMNS = [
  "Name",
  "Email",
  "Role",
  "Status",
  "Binding authority",
  "Last active",
  "Joined",
] as const;

export function MemberTable({
  rows,
  timeZone,
}: {
  readonly rows: readonly MemberRow[];
  readonly timeZone: TimeZone;
}) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <Table>
          <TableCaption className="sr-only">
            Members of this organization, with their role, status and binding
            authority.
          </TableCaption>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {COLUMNS.map((column) => (
                <TableHead
                  key={column}
                  scope="col"
                  className="h-11 px-3 text-label"
                >
                  {column}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.membership.id}
                data-membership-status={row.status}
                data-is-viewer={row.isViewer ? "true" : "false"}
                className="h-14 border-border hover:bg-transparent lg:h-12"
              >
                <TableCell className="px-3 text-body-strong whitespace-normal">
                  {row.displayName}
                </TableCell>
                <TableCell className="px-3 text-body break-words whitespace-normal">
                  {row.email ?? NOT_RECORDED}
                </TableCell>
                <TableCell className="px-3 whitespace-normal">
                  <RoleCell row={row} />
                </TableCell>
                <TableCell className="px-3 text-body">
                  <MembershipStatusText row={row} />
                </TableCell>
                <TableCell className="px-3 text-body">
                  <BindingAuthorityText row={row} />
                </TableCell>
                <TableCell className="px-3 text-body">
                  <LastActive row={row} timeZone={timeZone} />
                </TableCell>
                <TableCell className="px-3 text-body">
                  <Joined row={row} timeZone={timeZone} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Below `md` the same rows as cards. Exactly one of the two is in the
          accessibility tree at a time — `display: none` removes an element from
          it, which is why this is `hidden`/`md:hidden` and not opacity. */}
      <ul className="flex flex-col gap-3 md:hidden">
        {rows.map((row) => (
          <li
            key={row.membership.id}
            data-membership-status={row.status}
            className="flex flex-col gap-2 rounded-md border border-border p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <span className="text-body-strong break-words">
                {row.displayName}
              </span>
              <StatusBadge system="role" value={row.membership.role} />
            </div>
            <span className="text-body break-words text-muted-foreground">
              {row.email ?? NOT_RECORDED}
            </span>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              <CardField label="Status">
                <MembershipStatusText row={row} />
              </CardField>
              <CardField label="Binding authority">
                <BindingAuthorityText row={row} />
              </CardField>
              <CardField label="Last active">
                <LastActive row={row} timeZone={timeZone} />
              </CardField>
              <CardField label="Joined">
                <Joined row={row} timeZone={timeZone} />
              </CardField>
            </dl>
            <p className="text-caption text-muted-foreground">
              {roleCapabilitySummary(row.membership.role).sentence}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}

function CardField({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="text-body">{children}</dd>
    </div>
  );
}

function RoleCell({ row }: { readonly row: MemberRow }) {
  return (
    <div className="flex flex-col gap-1">
      {/* T-37, through the one statusIntent map. Every role reads neutral —
          intent carries urgency and a role carries none. */}
      <StatusBadge system="role" value={row.membership.role} />
      <span className="text-caption text-muted-foreground">
        {roleCapabilitySummary(row.membership.role).sentence}
      </span>
      {row.isViewer ? (
        // Rule 1.11 — stated on the row it applies to, so the reader is not left
        // hunting for a control that is deliberately absent.
        <span className="text-caption text-muted-foreground">
          {OWN_ROLE_UNCHANGEABLE_NOTE}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Plain text. **Deliberately not a badge** — see this file's header.
 */
function MembershipStatusText({ row }: { readonly row: MemberRow }) {
  return (
    <span
      data-membership-status-text={row.status}
      className={cn(row.status === "Active" && "text-body-strong")}
    >
      {row.status}
    </span>
  );
}

/**
 * D-35 — binding authority is an attribute of a P2 membership, not a role of its
 * own, because an organization has several Facility Managers and only some of
 * them can sign (Rule 7.3).
 */
function BindingAuthorityText({ row }: { readonly row: MemberRow }) {
  return (
    <span
      data-binding-authority={
        row.membership.holdsBindingAuthority ? "true" : "false"
      }
    >
      {row.membership.holdsBindingAuthority ? "Yes" : "No"}
    </span>
  );
}

function LastActive({
  row,
  timeZone,
}: {
  readonly row: MemberRow;
  readonly timeZone: TimeZone;
}) {
  const lastSeenAt = row.user?.lastSeenAt ?? null;
  if (lastSeenAt === null) {
    return <span className="text-muted-foreground">Never</span>;
  }
  return <ZonedDate instant={lastSeenAt} timeZone={timeZone} />;
}

/**
 * When they joined, or when they were invited.
 *
 * A revoked row keeps its join date: **revocation is never a delete** and the
 * history stays attached (Rule 1.13).
 */
function Joined({
  row,
  timeZone,
}: {
  readonly row: MemberRow;
  readonly timeZone: TimeZone;
}) {
  const { acceptedAt, invitedAt } = row.membership;
  if (acceptedAt !== null) {
    return <ZonedDate instant={acceptedAt} timeZone={timeZone} />;
  }
  if (invitedAt !== null) {
    return (
      <span className="inline-flex flex-wrap items-baseline gap-1">
        <span className="text-caption text-muted-foreground">Invited</span>
        <ZonedDate instant={invitedAt} timeZone={timeZone} />
      </span>
    );
  }
  return <span className="text-muted-foreground">{NOT_RECORDED}</span>;
}
