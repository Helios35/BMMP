import { PageColumns, PageHeaderSkeleton, PageShell } from "@/components/page";
import { Skeleton } from "@/components/ui/skeleton";
import { CATALOG_ADMIN_DESCRIPTION } from "@/features/catalog-admin/catalog-admin-copy";

/**
 * `/settings/catalog` while it loads — `UX_SPEC.md` §6.3.
 *
 * The header skeleton carries the page's **own sentence**, so it takes exactly
 * the space the loaded header will at every width (`PageHeaderSkeleton`); the
 * section nav and the two sections stand in at their own shape. Never a
 * spinner.
 */
export default function CatalogAdministrationLoading() {
  return (
    <PageShell>
      <span className="sr-only" role="status">
        Loading
      </span>

      <PageHeaderSkeleton description={CATALOG_ADMIN_DESCRIPTION} />

      <PageColumns
        aside={
          <div className="flex w-full flex-col gap-1 lg:w-56 lg:shrink-0">
            {Array.from({ length: 2 }, (_unused, index) => (
              <Skeleton key={index} className="h-11 w-full rounded-md" />
            ))}
          </div>
        }
      >
        {Array.from({ length: 2 }, (_unused, index) => (
          <div key={index} className="flex flex-col gap-4">
            <Skeleton className="h-7 w-48 rounded-md" />
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>
        ))}
      </PageColumns>
    </PageShell>
  );
}
