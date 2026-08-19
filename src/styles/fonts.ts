import localFont from "next/font/local";

/**
 * Inter, self-hosted.
 *
 * `UX_SPEC.md` §1.3 names Inter loaded through `next/font` as a variable font
 * with a `system-ui` fallback. It is loaded with `next/font/local` rather than
 * `next/font/google` because a production build must not depend on a live fetch
 * to someone else's CDN (D-27). The `.woff2` files ship inside the
 * `@fontsource-variable/inter` package, so the bytes are a locked dependency
 * rather than a vendored binary in the repository.
 *
 * The latin and latin-extended subsets only. Adding a script means adding its
 * subset here, not switching to a hosted stylesheet.
 */
export const inter = localFont({
  src: [
    {
      path: "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
      weight: "100 900",
      style: "normal",
    },
    {
      path: "../../node_modules/@fontsource-variable/inter/files/inter-latin-ext-wght-normal.woff2",
      weight: "100 900",
      style: "normal",
    },
  ],
  variable: "--font-sans",
  display: "swap",
  // The fallback carries Inter's own metrics so a swap does not move the layout.
  // A warehouse user reading a field value must not have it jump under a glove.
  adjustFontFallback: "Arial",
  fallback: [
    "system-ui",
    "-apple-system",
    "Segoe UI",
    "Roboto",
    "Helvetica Neue",
    "Arial",
    "sans-serif",
  ],
});
