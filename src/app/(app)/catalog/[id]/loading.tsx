import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * `/catalog/[id]`'s first paint — `UX_SPEC.md` §6.3.
 *
 * The shape of the loaded page: breadcrumb, title, and section cards at the
 * heights their field lists occupy. **Never a spinner in the middle of an empty
 * page**, and nothing jumps when the record lands.
 *
 * Its own file rather than `/catalog`'s, because a table skeleton on a detail
 * route is a promise the page does not keep.
 */
export default function CatalogEntryLoading() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-40 rounded-md" />
        <Skeleton className="h-8 w-72 rounded-md lg:h-9" />
      </div>

      {[0, 1, 2].map((section) => (
        <Card key={section} className="gap-4">
          <CardHeader>
            <Skeleton className="h-6 w-48 rounded-md" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
              {[0, 1, 2, 3].map((field) => (
                <div key={field} className="flex flex-col gap-1">
                  <Skeleton className="h-4 w-28 rounded-md" />
                  <Skeleton className="h-5 w-44 rounded-md" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      <div className="flex items-center gap-2">
        <span className="text-caption text-muted-foreground">
          Loading catalog entry…
        </span>
      </div>
    </div>
  );
}
