import type { JsonObject, JsonValue } from "@/types/common";

/**
 * Reading a stored `jsonb` column for display, without ever losing what it held.
 *
 * Three columns in this unit are free-shaped by design — `inputs_snapshot`,
 * `damage_assessment.finding_detail` and `storage_event.payload`. They are
 * evidence rather than presentation, so the rule here is the same as the rule
 * for an unrecognised taxonomy value: **render what is stored; never coerce it,
 * never blank it, never drop part of it.**
 *
 * `unknown` and narrow — `any` is not permitted, and a cast here would be the
 * one place a malformed snapshot could crash a detail page.
 */

export interface SnapshotEntry {
  readonly key: string;
  readonly text: string;
}

/** A scalar as text, a container as its JSON. Nothing is summarised away. */
export function jsonText(value: JsonValue): string {
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) return value.map(jsonText).join(", ");
  return JSON.stringify(value);
}

/** Every key of a snapshot object, in stored order. */
export function snapshotEntries(
  value: JsonObject | null,
): readonly SnapshotEntry[] {
  if (value === null) return [];
  return Object.keys(value).map((key) => ({
    key,
    text: jsonText(value[key] ?? null),
  }));
}

/**
 * A keyed object, or not.
 *
 * A hand-written predicate rather than an inline `Array.isArray` check: the
 * stored shape is `JsonObject | readonly JsonValue[]`, and TypeScript does not
 * narrow a *readonly* array out of a union on the negative branch. A predicate
 * says what is true once, in one place, instead of a cast at every call.
 */
function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A `JsonValue` that may be an object, as entries.
 *
 * `finding_detail` is typed `JsonValue`, so it may legitimately be a string, an
 * array or an object. Anything that is not an object has no keys and reads as a
 * single line instead.
 */
export function detailEntries(
  value: JsonValue | null,
): readonly SnapshotEntry[] {
  if (value === null || !isJsonObject(value)) return [];
  return snapshotEntries(value);
}

/** The single line for a `JsonValue` that carries no keys. */
export function detailLine(value: JsonValue | null): string | null {
  if (value === null || isJsonObject(value)) return null;
  return jsonText(value);
}
