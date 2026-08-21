import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * The not-found answer *inside the shell* — `UX_SPEC.md` §5 E-15.
 *
 * A signed-in caller who reaches a record that is not there keeps the
 * navigation, so the dead end is a page rather than a wall. It says **record**
 * rather than **page**, because every route that can reach this is a record
 * lookup — `/batteries/[id]`, `/catalog/[id]` — and "page" reads as a broken
 * link when the link was fine and the record was not.
 *
 * **It never distinguishes "this does not exist" from "this is not yours"**
 * (Rule 1.2). A record belonging to another organisation resolves to `null`
 * inside `src/data` and reaches `notFound()` by the same path an absent one
 * does; no code in `src/app` holds enough information to tell them apart. So
 * nothing here mentions organisations, permissions, or anything existing
 * elsewhere — not in the copy, not in a `data-` attribute, not in the status.
 *
 * **No `<main>` element.** The shell's layout already renders
 * `<main id="main-content">` around this, and a second one is a second landmark
 * for anyone navigating by landmark.
 */
export default function AppNotFound() {
  return (
    <section className="mx-auto flex w-full max-w-[72ch] flex-col gap-4 py-12">
      <h1 id="page-title" tabIndex={-1} className="text-h1 lg:text-display">
        We couldn&rsquo;t find that record.
      </h1>
      <p className="text-body">
        It may have been removed, or the link may be wrong.
      </p>
      <div className="flex flex-wrap gap-3 pt-2">
        <Button asChild>
          <Link href="/batteries">Back to batteries</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Go to the dashboard</Link>
        </Button>
      </div>
    </section>
  );
}
