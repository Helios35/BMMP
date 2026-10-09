import "server-only";

import type { ReactElement } from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";

import { registerDocumentFonts } from "./fonts";

/**
 * The renderer — `TECHNICAL_SPEC.md` §8.1: **a validated payload in, bytes
 * out**, and nothing else.
 *
 * It takes a template already applied to its payload. It reads no data, makes
 * no decision and holds no clock: the template sets `creationDate` and
 * `producer` from the snapshot, every printed instant comes from the snapshot,
 * the fonts are the repository's own files, and nothing here mints an id. So
 * the same payload renders to the same bytes, every time — which is the only
 * reason a stored hash can prove anything (§8.4).
 *
 * **Server only.** A document is rendered where it is stored; the browser
 * receives stored bytes and never a renderer.
 */

/** Stored on every render (`ERD.md` §7.5). The version is the installed package's. */
export const RENDERER_NAME = "react-pdf";
export const RENDERER_VERSION = "4.9.0";

export interface RenderedPdf {
  readonly bytes: Uint8Array;
  readonly pageCount: number;
}

/**
 * Page objects in the file. pdfkit writes every page dictionary uncompressed
 * with `/Type /Page`; the page tree itself is `/Type /Pages`.
 */
function countPages(bytes: Uint8Array): number {
  const text = Buffer.from(bytes).toString("latin1");
  return text.match(/\/Type \/Page(?!s)/g)?.length ?? 0;
}

/**
 * One render at a time. Each render resets the font store it reads
 * (`registerDocumentFonts`), and resetting it under a render already in
 * flight would change that render's fonts halfway through.
 */
let tail: Promise<void> = Promise.resolve();

async function exclusively<T>(work: () => Promise<T>): Promise<T> {
  const previous = tail;
  let release: () => void = () => undefined;
  tail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await work();
  } finally {
    release();
  }
}

export async function renderPdf(
  document: ReactElement<DocumentProps>,
): Promise<RenderedPdf> {
  return exclusively(async () => {
    registerDocumentFonts();
    const buffer = await renderToBuffer(document);
    const bytes = new Uint8Array(buffer);
    return { bytes, pageCount: countPages(bytes) };
  });
}
