/**
 * The header `src/middleware.ts` forwards so a Server Component can know its own
 * URL.
 *
 * Next.js gives a server segment its params and its search params, and not the
 * path it was reached by. The guard needs it to build `?next=`, the breadcrumb
 * trail needs it to name where it is, and the alternative — reconstructing a
 * pathname from params — is a second route matcher, which is the duplication
 * `SITE_ARCHITECTURE.md` §7.2 forbids.
 *
 * **This module holds the header name alone**, so the middleware can import it
 * without pulling `next/headers` or `src/data` into the edge runtime. The reader
 * lives in `./session.ts`.
 */

/** Carries the pathname **and the query string**, so `?next=` keeps a colleague's filters (§7.4). */
export const REQUEST_PATHNAME_HEADER = "x-bmmp-pathname";
