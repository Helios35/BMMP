import "server-only";

import { mockAdapter } from "./mock";
import { supabaseAdapter } from "./supabase";
import type { DataAdapter } from "./contracts";

export type { DataAdapter, AdapterName, AdapterDescription } from "./contracts";

const ADAPTERS = { mock: mockAdapter, supabase: supabaseAdapter } as const;

/**
 * The two variables the selector reads. Narrower than NodeJS.ProcessEnv on
 * purpose: the guard is the thing under test, and a test should be able to hand
 * it an environment of exactly two keys.
 */
export interface AdapterEnvironment {
  DATA_ADAPTER?: string | undefined;
  VERCEL_ENV?: string | undefined;
  [key: string]: string | undefined;
}

/**
 * Resolve the adapter, or throw.
 *
 * Fails closed, and that is the point. A ternary defaulting to the mock means an
 * unset or misspelled variable silently serves fake data — in production, a fake
 * legal document with a real customer's name on it. CI structurally cannot catch
 * that, because CI cannot read the deployment platform's environment values, so
 * the guard runs in the process that serves the request. D-16.
 */
export function resolveAdapter(env: AdapterEnvironment = process.env): {
  name: keyof typeof ADAPTERS;
  adapter: DataAdapter;
} {
  const name = (env.DATA_ADAPTER ?? "").trim();

  if (!(name in ADAPTERS)) {
    throw new Error(
      `DATA_ADAPTER must be 'mock' or 'supabase'; got ${JSON.stringify(env.DATA_ADAPTER)}`,
    );
  }
  if (name === "mock" && env.VERCEL_ENV === "production") {
    throw new Error("DATA_ADAPTER=mock is refused in production.");
  }

  const key = name as keyof typeof ADAPTERS;
  return { name: key, adapter: ADAPTERS[key] };
}

const resolved = resolveAdapter();

/** Exported so a health endpoint can state which adapter is live. */
export const activeAdapterName = resolved.name;
export const data: DataAdapter = resolved.adapter;
