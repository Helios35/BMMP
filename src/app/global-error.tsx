"use client";

import { useEffect } from "react";
import "@/styles/globals.css";
import { inter } from "@/styles/fonts";

import { presentError } from "@/features/shell/errors/error-presentation";

/**
 * The last boundary — `TECHNICAL_SPEC.md` §10.3, spec 01 §D2.
 *
 * **It replaces the root layout, so it renders its own `<html>` and `<body>`.**
 * That also means it cannot rely on anything the root layout mounts: no theme
 * provider, no toaster, no shell. Reaching this boundary means the layout itself
 * failed, so this file deliberately depends on as little as possible — no
 * router, no navigation component, a plain anchor rather than a `Link`.
 *
 * Same copy rules as every other surface: what failed, what state things are in,
 * what to do next; the reference on a 5xx and nothing else internal; no stack
 * trace and no tenant data (§10.3).
 */
export default function GlobalError({
  error,
}: {
  readonly error: Error & { digest?: string };
}) {
  useEffect(() => {
    console.error("[global] error", error);
  }, [error]);

  const presentation = presentError(error);
  const showsReference =
    presentation.showsReference &&
    error.digest !== undefined &&
    error.digest !== "";

  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <main
          role="alert"
          className="mx-auto flex w-full max-w-[72ch] flex-1 flex-col gap-4 px-4 py-12"
        >
          <h1 className="text-h1 lg:text-display">{presentation.title}</h1>
          <p className="text-body">{presentation.body}</p>
          {showsReference ? (
            <p className="text-caption text-muted-foreground">
              Reference{" "}
              <span data-error-reference className="font-mono select-all">
                {error.digest}
              </span>
            </p>
          ) : null}
          <p className="pt-2">
            <a
              href="/"
              className="inline-flex min-h-11 items-center rounded-md border border-input px-4 text-body focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              Reload the dashboard
            </a>
          </p>
        </main>
      </body>
    </html>
  );
}
