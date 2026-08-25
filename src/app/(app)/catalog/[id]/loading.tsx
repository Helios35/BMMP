import {
  FieldList,
  PageHeaderSkeleton,
  PageShell,
  SectionCard,
} from "@/components/page";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * `/catalog/[id]`'s first paint — `UX_SPEC.md` §6.3.
 *
 * The shape of the loaded page: breadcrumb, title, and section cards at the
 * heights their field lists occupy. **Never a spinner in the middle of an empty
 * page**, and nothing jumps when the record lands.
 *
 * It composes the same `SectionCard` and `FieldList` the loaded page does rather
 * than approximating them with boxes, which is what keeps the two heights equal
 * as the card's padding or the field's line height changes. The field pairs are
 * plain blocks rather than `Field`, because a `Skeleton` is a `div` and a `div`
 * inside the `<span>` a field label renders is markup the parser rewrites — and
 * a rewritten tree is a hydration mismatch.
 *
 * Its own file rather than `/catalog`'s, because a table skeleton on a detail
 * route is a promise the page does not keep.
 */
export default function CatalogEntryLoading() {
  return (
    <PageShell>
      <PageHeaderSkeleton breadcrumb />

      {[0, 1, 2].map((section) => (
        <SectionCard key={section}>
          <Skeleton className="h-7 w-48 rounded-md" />
          <FieldList>
            {[0, 1, 2, 3].map((field) => (
              <div key={field} className="flex flex-col gap-1">
                <Skeleton className="h-5 w-28 rounded-md" />
                <Skeleton className="h-6 w-44 rounded-md" />
              </div>
            ))}
          </FieldList>
        </SectionCard>
      ))}
    </PageShell>
  );
}
