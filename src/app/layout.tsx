import type { Metadata } from "next";
import "@/styles/globals.css";
import { inter } from "@/styles/fonts";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { ShellToaster } from "@/features/shell/chrome/shell-toaster";

// No next/font/google import. It makes every production build depend on a live
// fetch to fonts.googleapis.com, and a build that fails when someone else's CDN
// is slow is not a property worth carrying for 32 weeks. D-27. Inter is
// self-hosted from a locked dependency instead — see src/styles/fonts.ts.

export const metadata: Metadata = {
  title: "BMMP",
  description: "Battery Material Management Platform",
};

/**
 * `suppressHydrationWarning` on `<html>` is required, not cosmetic:
 * `next-themes` writes `class` and `style` on that element from a pre-paint
 * script, before React hydrates, so every page would otherwise log a hydration
 * mismatch and the real ones would be lost in the noise.
 *
 * `ThemeProvider` mounts here, once, wrapping `{children}` inside `<body>` —
 * `UX_SPEC.md` §1.2 Rule 6 makes both themes a B1a deliverable, and the
 * generated `src/components/ui/sonner.tsx` calls `useTheme()`, so the toaster
 * needs it regardless.
 *
 * **One `Toaster`, above both route groups.** `UX_SPEC.md` §6.1 puts a toast on
 * the destination rather than on the page being left, and a destination may be
 * in either group — a denial redirect lands on `/` inside `(app)`, a lapsed
 * session lands on `/sign-in` inside `(auth)`. A second `Toaster` per group
 * would mean two portals and a toast that can fire into the hidden one.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          {children}
          <ShellToaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
