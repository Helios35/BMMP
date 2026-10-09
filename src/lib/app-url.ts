/**
 * The app's permanent origin — where a printed QR code points
 * (`TECHNICAL_SPEC.md` §8.3: "a permanent URL to `/containers/[id]`").
 *
 * Read from `NEXT_PUBLIC_APP_URL`, which `.env.example` already lists.
 * **Unset reads as empty, and an empty origin blocks the label** — the label
 * builder names the missing configuration rather than printing a QR to a
 * guessed host, because a code on a drum that opens nothing, or opens a
 * preview that no longer exists, is a wrong label that looks right. There is
 * deliberately no fallback to the request's own host.
 */
export function appOrigin(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.trim() ?? "";
}
