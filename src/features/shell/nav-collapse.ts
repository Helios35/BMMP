/**
 * The desktop sidebar's collapse preference.
 *
 * **A cookie, not a URL parameter.** `SITE_ARCHITECTURE.md` §7.4 puts filter,
 * sort, step and tab in the URL so a warehouse user can send a colleague a link
 * that opens the same view. A chrome preference is none of those, and putting it
 * in the URL would attach one person's sidebar width to every link they share.
 *
 * It is read server-side in `src/app/(app)/layout.tsx` so the first paint is
 * already the right width — a collapse that flashes on every navigation reads as
 * a bug to the person using it all day.
 *
 * **Not `httpOnly`**: the toggle writes it from the client, which is the whole
 * point of a preference that must survive a reload without a round trip. It
 * carries no identity and no tenant data, so nothing is exposed by that.
 */

export const NAV_COLLAPSE_COOKIE = "bmmp_nav_collapsed";

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

/** `"1"` collapsed, anything else expanded. An absent or malformed value is expanded. */
export function isNavCollapsed(value: string | undefined): boolean {
  return value === "1";
}

/** The `document.cookie` string the client toggle writes. */
export function navCollapseCookie(collapsed: boolean): string {
  return `${NAV_COLLAPSE_COOKIE}=${collapsed ? "1" : "0"}; path=/; max-age=${ONE_YEAR_IN_SECONDS}; samesite=lax`;
}
