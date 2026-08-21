"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * Puts the `.dark` class on `<html>` — `UX_SPEC.md` §1.2 Rule 6.
 *
 * `src/styles/globals.css` declares `@custom-variant dark (&:is(.dark *))` and
 * defines every dark token under `.dark`, but **nothing was adding that class**,
 * so the product rendered light-only and the e2e theme assertion passed
 * vacuously. Rule 6 makes both themes a B1a deliverable and says a phone in a
 * dark storage room *defaults* to dark — that is `defaultTheme="system"` plus
 * `enableSystem`, following the operating system rather than a preference the
 * user has to find.
 *
 * **There is no user-facing toggle, deliberately.** No screen specification in
 * `UX_SPEC.md` §3 has one, and a control nobody specified is a decision made in
 * a component (`SITE_ARCHITECTURE.md` §7.1). If a toggle is wanted it is a
 * decision-log entry and a placement in a screen spec, not a prop added here.
 *
 * `disableTransitionOnChange` suppresses the colour transition on the switch, so
 * the whole page does not cross-fade when the system flips at sunset. Motion is
 * never a status (§1.6, §6.5).
 *
 * The dependency-free alternative — duplicating the entire `.dark` token block
 * inside `@media (prefers-color-scheme: dark)` — puts every colour in two
 * places and breaks §1.2 Rule 1, which is the more expensive mistake.
 * `next-themes` is already a dependency: it arrives with `sonner`, and the
 * generated `src/components/ui/sonner.tsx` calls `useTheme()` from it, so the
 * toaster needs this provider mounted regardless.
 *
 * **Mount it once, in `src/app/layout.tsx`, wrapping `{children}` inside
 * `<body>`, and put `suppressHydrationWarning` on `<html>`** — the pre-paint
 * script writes `class` and `style` on that element before React hydrates, and
 * without the attribute every page logs a hydration mismatch.
 */
export function ThemeProvider({ children }: { readonly children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
