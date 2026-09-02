/**
 * Deterministic identifier and counter allocation for the mock adapter.
 *
 * **Deterministic rather than random**, so a test that appends a row can assert
 * on the id it got, and a failing run reproduces. `crypto.randomUUID()` would
 * make the mock's output differ between runs for no benefit — the Supabase
 * adapter gets its ids from `gen_random_uuid()` and nothing downstream depends
 * on their shape.
 */

/**
 * The counters live on `globalThis`, for the same reason the store does
 * (`./store.ts`): the built app loads this module once per Turbopack module
 * graph — the `app/api/*` route handlers in one, Server Components and Server
 * Actions in another — and two module-level counters would mint the same id
 * twice into one table. An `audit_event` written by the upload route and one
 * written by a Server Action must not share an id any more than two Postgres
 * inserts would.
 */
const IDS_SLOT: unique symbol = Symbol.for("bmmp.data.mock.ids");

interface IdState {
  sequence: number;
  readonly counters: Map<string, number>;
}

interface IdHost {
  [IDS_SLOT]?: IdState;
}

const host = globalThis as typeof globalThis & IdHost;
const state: IdState = (host[IDS_SLOT] ??= {
  sequence: 0,
  counters: new Map<string, number>(),
});

/** A UUID-shaped identifier, unique within the process. */
export function nextId(): string {
  state.sequence += 1;
  const tail = state.sequence.toString(16).padStart(12, "0");
  return `0b000000-0000-4000-8000-${tail}`;
}

export function resetIdSequence(): void {
  state.sequence = 0;
}

/**
 * Per-organization counters — `organization.battery_record_seq` and its three
 * siblings.
 *
 * In Postgres these are incremented under the organization row lock inside the
 * insert transaction, so the numbers are genuinely sequential with no counter
 * table and no race (`ERD.md` §3.1). Here they are incremented in the same
 * synchronous step, which is the same guarantee in a single-threaded process.
 */
const counters = state.counters;

export function nextSequenceNumber(
  organizationId: string,
  counter: "battery_record" | "container" | "lot" | "shipment",
  startAt: number,
): number {
  const key = `${organizationId}:${counter}`;
  const current = counters.get(key) ?? startAt;
  const next = current + 1;
  counters.set(key, next);
  return next;
}

export function resetSequenceNumbers(): void {
  counters.clear();
}

/** `BR-0007`, `C-0003`, `L-0001`, `SH-0002`. */
export function formatRecordNumber(
  prefix: "BR" | "C" | "L" | "SH",
  value: number,
): string {
  return `${prefix}-${value.toString().padStart(4, "0")}`;
}
