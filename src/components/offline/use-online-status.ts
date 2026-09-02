"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether the browser believes it has a network — `UX_SPEC.md` §2.10, E-10;
 * D-20.
 *
 * `navigator.onLine` plus the `online` / `offline` events, read through
 * `useSyncExternalStore` so hydration sees one value on both sides. **The
 * server snapshot is `true`**: the server has no network state to report and
 * a page that hydrated as "offline" would flash the banner at every reader
 * for a frame.
 *
 * The browser's answer is an upper bound, not a promise: `onLine === true`
 * means a network interface is up, not that a request will succeed. Every
 * request still handles its own failure (E-3); this hook only decides whether
 * a capture goes to the queue immediately or is attempted first.
 */

function subscribe(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function readOnline(): boolean {
  return navigator.onLine;
}

function serverSnapshot(): boolean {
  return true;
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, readOnline, serverSnapshot);
}
