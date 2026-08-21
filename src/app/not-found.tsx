import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * The root not-found page — `UX_SPEC.md` §5 E-15, `TECHNICAL_SPEC.md` §10.3.
 *
 * **It never distinguishes "this does not exist" from "this is not yours"**
 * (Rule 1.2). A record belonging to another organisation resolves to `null`
 * inside `src/data` and reaches `notFound()` by the same path an absent one
 * does; no code in `src/app` holds enough information to tell them apart, and
 * that is what makes the guarantee structural rather than a habit. So there is
 * no mention here of organisations, of permissions, or of anything existing
 * elsewhere — in the copy, in a `data-` attribute, or in the status, which is
 * 404 either way.
 *
 * `src/app/(app)/not-found.tsx` renders the same answer *inside the shell* for a
 * signed-in caller, so the navigation stays reachable.
 */
export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col px-4 md:px-6 lg:px-8">
      <section className="mx-auto flex w-full max-w-[72ch] flex-col gap-4 py-12">
        <h1 id="page-title" tabIndex={-1} className="text-h1 lg:text-display">
          We couldn&rsquo;t find that page.
        </h1>
        <p className="text-body">
          It may have been removed, or the link may be wrong.
        </p>
        <div className="pt-2">
          <Button asChild size="lg" className="min-h-11">
            <Link href="/">Go to the dashboard</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
