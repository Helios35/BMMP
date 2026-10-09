import {
  CHEMISTRIES,
  CHEMISTRY_LABELS,
  type Chemistry,
} from "@/domain/taxonomy/chemistry";
import { isTaxonomyValue } from "@/domain/taxonomy/lookup";

/**
 * A container label's contents description — Rule 4.18; `TECHNICAL_SPEC.md`
 * §8.3 ("the chemistry text"); T-38.
 *
 * **The distinct confirmed chemistries of what is in the container, by their
 * taxonomy labels, in the taxonomy's own order** — the owner's call in
 * `b1a-06`, because Rule 4.18 assigns the vocabulary to `TAXONOMY.md` and
 * `TAXONOMY.md` defines none; the chemistry set is the vocabulary T-38 and §8.3
 * name. A chemistry arriving that the label does not name is a material change
 * (Rule 4.21).
 *
 * **A battery whose chemistry no person has confirmed cannot be described**,
 * so it blocks the label rather than being printed as "not confirmed" —
 * chemistry is never inferred (`_ANCHORS.md` §7.2).
 */

export interface ContentsDescriptionItem {
  readonly recordNumber: string;
  /** T-01 as stored. */
  readonly chemistry: string | null;
  /** A person confirmed it (Rules 2.15, 2.34). */
  readonly chemistryConfirmed: boolean;
}

export type ContentsDescription =
  | { readonly ok: true; readonly description: string }
  | { readonly ok: false; readonly findings: readonly string[] };

export function describeContainerContents(
  contents: readonly ContentsDescriptionItem[],
): ContentsDescription {
  if (contents.length === 0) {
    return {
      ok: false,
      findings: [
        "This container holds no batteries, so there is nothing to describe.",
      ],
    };
  }
  const findings: string[] = [];
  const present = new Set<Chemistry>();
  for (const item of [...contents].sort((a, b) =>
    a.recordNumber.localeCompare(b.recordNumber),
  )) {
    const chemistry = item.chemistry;
    if (
      chemistry === null ||
      chemistry === "unknown" ||
      !item.chemistryConfirmed
    ) {
      findings.push(
        `${item.recordNumber} has no confirmed chemistry, so the contents cannot be described. Its chemistry is confirmed on the review queue.`,
      );
      continue;
    }
    if (!isTaxonomyValue(CHEMISTRIES, chemistry)) {
      findings.push(
        `${item.recordNumber}'s stored chemistry (${chemistry}) is not one this version can name, so the contents cannot be described.`,
      );
      continue;
    }
    present.add(chemistry);
  }
  if (findings.length > 0) return { ok: false, findings };
  return {
    ok: true,
    description: CHEMISTRIES.filter((chemistry) => present.has(chemistry))
      .map((chemistry) => CHEMISTRY_LABELS[chemistry])
      .join("; "),
  };
}
