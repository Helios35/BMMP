/**
 * The role→route capability map, the vocabulary it is expressed in, and every
 * pure decision taken from it.
 *
 * `SITE_ARCHITECTURE.md` §5.2 and §7.2 — one map, one place, read by the guard,
 * the navigation, the command palette and every cross-route link. Everything in
 * this folder is pure: it takes a role, a route and — where a rule turns on time
 * — an instant, and returns a decision. **The I/O belongs to `src/lib/auth` and
 * to the route segments**, which is what makes every branch of this folder
 * testable without a request.
 */

export * from "./capability";
export * from "./routes";
export * from "./route-capability";
export * from "./match-route";
export * from "./next-path";
export * from "./denial";
export * from "./grant";
export * from "./control-treatment";
