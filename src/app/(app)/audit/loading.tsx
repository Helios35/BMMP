import { RecordTableSkeleton } from "@/components/record-table/record-table";
import { APP_ROUTE_NAMES } from "@/domain/access/routes";

/**
 * `/audit`'s first paint — `UX_SPEC.md` §6.3.
 *
 * Eight skeleton rows at the table's exact row height, so the list does not jump
 * under a reader's thumb when it lands. **Never a spinner in the middle of an
 * empty page** (§2.7).
 *
 * The shell above this file never flashes: it lives in `(app)/layout.tsx`, which
 * is above every `loading.tsx`, so navigation replaces the content and keeps the
 * navigation, the switcher and the palette in place.
 */
export default function AuditLoading() {
  return (
    <div className="flex flex-col gap-6">
      <h1 id="page-title" tabIndex={-1} className="text-h1 lg:text-display">
        {APP_ROUTE_NAMES["/audit"]}
      </h1>
      <RecordTableSkeleton columns={6} />
    </div>
  );
}
