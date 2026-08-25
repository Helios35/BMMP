import Link from "next/link";

import { ACTION_BUTTON_CLASS, PageHeader } from "@/components/page";
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
 * **It carries its own `<main>` and its own gutter**, because it renders outside
 * both route groups and has no shell above it. That is the one place a page in
 * this product sets its own gutter, and the values are §1.4's.
 *
 * `src/app/(app)/not-found.tsx` renders the same answer *inside the shell* for a
 * signed-in caller, so the navigation stays reachable.
 */
export default function NotFound() {
  return (
    <main
      id="main-content"
      className="mx-auto flex w-full max-w-[72ch] flex-1 flex-col px-4 py-12 md:px-6 lg:px-8"
    >
      <PageHeader
        title="We couldn’t find that page."
        description="It may have been removed, or the link may be wrong."
        action={
          <Button asChild size="lg" className={ACTION_BUTTON_CLASS}>
            <Link href="/">Go to the dashboard</Link>
          </Button>
        }
      />
    </main>
  );
}
