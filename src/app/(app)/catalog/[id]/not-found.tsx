import Link from "next/link";

import { ACTION_BUTTON_CLASS, PageHeader, PageShell } from "@/components/page";
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
    <PageShell>
      <PageHeader
        title="We couldn’t find that record."
        description="It may have been removed, or the link may be wrong."
        action={
          <Button asChild size="lg" className={ACTION_BUTTON_CLASS}>
            <Link href={CATALOG_BASE_PATH}>Back to the catalog</Link>
          </Button>
        }
      />
    </PageShell>
  );
}
