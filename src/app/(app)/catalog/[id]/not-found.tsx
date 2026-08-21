import Link from "next/link";
import { FileQuestion } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CATALOG_BASE_PATH } from "@/features/catalog/list-query";

/**
 * `/catalog/[id]` resolved to nothing — **E-15**, `UX_SPEC.md` §5.
 *
 * **This is also what a catalog entry belonging to another organisation
 * renders**, byte for byte. `catalogEntries.get` returns `null` for both, the
 * page calls `notFound()` for both, and the response — copy, action, status,
 * every `data-` attribute — is identical. Nothing here mentions organisations,
 * permissions or anything existing elsewhere, and there is no 403 anywhere on
 * the path, because **existence is never disclosed** (Rule 1.2,
 * `SITE_ARCHITECTURE.md` §5.3(5)).
 *
 * Route-scoped rather than group-scoped so the way back is the catalog the
 * reader was in, not a generic dashboard link.
 */
export default function CatalogEntryNotFound() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex max-w-[72ch] flex-col items-start gap-4 rounded-lg border border-border p-6">
        <div className="flex items-center gap-2">
          <FileQuestion
            aria-hidden="true"
            className="size-5 text-muted-foreground"
          />
          <h1 id="page-title" tabIndex={-1} className="text-h1 lg:text-display">
            We couldn&rsquo;t find that record.
          </h1>
        </div>
        <p className="text-body">
          It may have been removed, or the link may be wrong.
        </p>
        <Button asChild size="lg" className="min-h-11 rounded-md">
          <Link href={CATALOG_BASE_PATH}>Back to the catalog</Link>
        </Button>
      </div>
    </div>
  );
}
