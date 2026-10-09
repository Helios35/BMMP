import type { ResolvedRule } from "@/domain/rules/resolve";

/**
 * The container label's required wording, as rule data — Rules 1.23, 4.18,
 * 5.21; `TAXONOMY.md` T-38.
 *
 * **The phrase is a rule version's payload, never a literal.** This module
 * knows the *shape* of `storage.container_label.v1` and nothing of what it
 * says; the words, their casing and their citation are the version's, and a
 * jurisdiction that requires different words carries a different version. A
 * payload whose schema or shape is not recognised reads as `null` — refused,
 * never half-read — because a half-read label is a wrong label (Rule 3.4).
 *
 * The version applied is the one in force **on the print date** (Rule 5.21),
 * so the caller resolves it for the day the label is generated.
 */

export const CONTAINER_LABEL_RULE_KEY = "storage.container_label";

const CONTAINER_LABEL_SCHEMA = "storage.container_label.v1";

export interface ContainerLabelRule {
  /** Printed verbatim, its own casing included (`TAXONOMY.md` §4.5). */
  readonly phrase: string;
}

export function readContainerLabelRule(
  resolved: ResolvedRule,
): ContainerLabelRule | null {
  if (resolved.ruleKey !== CONTAINER_LABEL_RULE_KEY) return null;
  if (resolved.version.payloadSchemaKey !== CONTAINER_LABEL_SCHEMA) return null;
  const payload: unknown = resolved.version.payload;
  if (typeof payload !== "object" || payload === null) return null;
  const { phrase } = payload as { readonly phrase?: unknown };
  if (typeof phrase !== "string" || phrase.trim() === "") return null;
  return { phrase };
}
