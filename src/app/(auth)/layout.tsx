/**
 * The `(auth)` group — `/sign-in`, `/sign-up`, `/invite/[token]`, and nothing
 * else (`SITE_ARCHITECTURE.md` §5.6).
 *
 * **No app chrome.** No sidebar, no bottom tab bar, no organization switcher, no
 * alert bell, no command palette, no breadcrumbs — a caller here has proved
 * nothing, and every one of those either names a tenant or offers a destination
 * the caller cannot reach. A centred card on a plain background is the whole
 * layout (`UX_SPEC.md` §3.1).
 *
 * `max-w-[400px]` is §3.1's width. The card is centred with `justify-center` and
 * padded rather than pinned, so at 200% zoom the content grows downward and the
 * page never scrolls sideways (§4.3).
 */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-background px-4 py-12">
      <main
        id="main-content"
        tabIndex={-1}
        className="flex w-full max-w-[400px] flex-col gap-6"
      >
        <p className="text-center text-h2 tracking-tight">BMMP</p>
        {children}
      </main>
    </div>
  );
}
