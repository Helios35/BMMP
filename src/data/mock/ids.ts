/**
 * Deterministic identifier and counter allocation for the mock adapter.
 *
 * **Deterministic rather than random**, so a test that appends a row can assert
 * on the id it got, and a failing run reproduces. `crypto.randomUUID()` would
 * make the mock's output differ between runs for no benefit — the Supabase
 * adapter gets its ids from `gen_random_uuid()` and nothing downstream depends
 * on their shape.
 */

let sequence = 0;

/** A UUID-shaped identifier, unique within the process. */
export function nextId(): string {
  sequence += 1;
  const tail = sequence.toString(16).padStart(12, "0");
  return `0b000000-0000-4000-8000-${tail}`;
}

export function resetIdSequence(): void {
  sequence = 0;
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
const counters = new Map<string, number>();

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
