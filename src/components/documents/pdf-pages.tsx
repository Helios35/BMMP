"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * The stored PDF, drawn page by page — `UX_SPEC.md` §2.8; `TECHNICAL_SPEC.md`
 * §8.4.
 *
 * **It draws the bytes that were stored at issue, and makes none.** The
 * document is fetched from its stream route and painted with pdf.js; nothing
 * here renders a document from data, so what is on screen and what prints is
 * the issued file. Because the pages are part of this page rather than a
 * browser plugin, **a marking laid over them prints with them** — a voided
 * or superseded render cannot be printed clean from here (`UX_SPEC.md`
 * §3.14) — and the document shows on a phone that has no PDF viewer.
 *
 * Every page is drawn at twice the PDF's own resolution so the printed copy
 * stays sharp; on screen it scales to the canvas width.
 */

/** Twice 72 dpi — sharp on a high-density screen and on paper. */
const RENDER_SCALE = 2;

const DRAW_FAILED = "This document could not be drawn. Download it instead.";

export interface PdfPagesProps {
  /** The stream route for the render's stored bytes. */
  readonly src: string;
  /** Names the document for assistive technology. */
  readonly label: string;
  /** Drawn over every page — a void or supersession stamp. It prints. */
  readonly overlay?: ReactNode;
}

type PagesState =
  | { readonly kind: "loading" }
  | { readonly kind: "failed"; readonly message: string }
  | { readonly kind: "ready"; readonly pageCount: number };

async function problemDetail(response: Response): Promise<string> {
  const fallback = "This document could not be loaded.";
  if (!response.headers.get("content-type")?.includes("json")) return fallback;
  const body: unknown = await response.json();
  if (typeof body === "object" && body !== null && "detail" in body) {
    const { detail } = body as { readonly detail: unknown };
    if (typeof detail === "string" && detail !== "") return detail;
  }
  return fallback;
}

export function PdfPages({ src, label, overlay }: PdfPagesProps): ReactElement {
  const [state, setState] = useState<PagesState>({ kind: "loading" });
  const pdf = useRef<PDFDocumentProxy | null>(null);
  const canvases = useRef<HTMLCanvasElement[]>([]);

  // Fetch the stored bytes once per source and open them.
  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      const response = await fetch(src, { credentials: "same-origin" });
      if (!response.ok) {
        const message = await problemDetail(response);
        if (!cancelled) setState({ kind: "failed", message });
        return;
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      const opened = await pdfjs.getDocument({ data: bytes }).promise;
      if (cancelled) {
        await opened.loadingTask.destroy();
        return;
      }
      pdf.current = opened;
      setState({ kind: "ready", pageCount: opened.numPages });
    }
    load().catch((error: unknown) => {
      console.error(
        "[documents] the stored document could not be opened",
        error,
      );
      if (!cancelled) setState({ kind: "failed", message: DRAW_FAILED });
    });
    return () => {
      cancelled = true;
      void pdf.current?.loadingTask.destroy();
      pdf.current = null;
    };
  }, [src]);

  // Draw every page once its canvas is in the DOM.
  useEffect(() => {
    const opened = pdf.current;
    if (state.kind !== "ready" || opened === null) return;
    let cancelled = false;
    async function draw(document: PDFDocumentProxy): Promise<void> {
      for (let index = 0; index < document.numPages; index += 1) {
        const canvas = canvases.current[index];
        if (cancelled || canvas === undefined) return;
        const page = await document.getPage(index + 1);
        const viewport = page.getViewport({ scale: RENDER_SCALE });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        await page.render({ canvas, viewport }).promise;
      }
    }
    draw(opened).catch((error: unknown) => {
      console.error(
        "[documents] the stored document could not be drawn",
        error,
      );
      if (!cancelled) setState({ kind: "failed", message: DRAW_FAILED });
    });
    return () => {
      cancelled = true;
    };
  }, [state]);

  if (state.kind === "loading") {
    return (
      <div data-pdf-pages="loading" className="flex flex-col gap-4">
        <Skeleton className="mx-auto aspect-[8.5/11] w-full max-w-3xl rounded-md" />
      </div>
    );
  }
  if (state.kind === "failed") {
    return (
      <p
        role="alert"
        data-pdf-pages="failed"
        className="mx-auto max-w-3xl rounded-md border border-border bg-background p-6 text-body"
      >
        {state.message}
      </p>
    );
  }
  return (
    <div
      data-pdf-pages="ready"
      data-page-count={state.pageCount}
      role="document"
      aria-label={label}
      className="mx-auto flex w-full max-w-3xl flex-col gap-4"
    >
      {Array.from({ length: state.pageCount }, (_, index) => (
        <div
          key={index}
          data-pdf-page={index + 1}
          className="relative overflow-hidden rounded-md border border-border bg-white"
        >
          <canvas
            ref={(element) => {
              if (element !== null) canvases.current[index] = element;
            }}
            aria-hidden="true"
            className="block h-auto w-full"
          />
          {overlay}
        </div>
      ))}
    </div>
  );
}
