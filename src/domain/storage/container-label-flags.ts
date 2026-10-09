import type { IsoTimestamp } from "@/types/common";

/**
 * The two label flags a container carries — Rules 4.19 and 4.22.
 *
 * **Comparisons of stored rows, never a condition invented on render.** A
 * container holding contents with no label in force cannot ship (Rule 4.22),
 * and a container whose printed start date differs from its current one is
 * mislabeled and must be relabelled first (Rule 4.19). `/containers/[id]`
 * shows both; `/shipments/new` refuses a container carrying either, and the
 * adapter refuses it again at commit — all three read this one function, so
 * the screen and the refusal cannot disagree about which container is which.
 */

export interface ContainerLabelFlags {
  /** Holds contents with no label in force (Rule 4.22). */
  readonly noCurrentLabel: boolean;
  /** The printed start differs from the container's current start (Rule 4.19). */
  readonly mislabelled: {
    readonly printed: IsoTimestamp;
    readonly current: IsoTimestamp;
  } | null;
}

export interface ContainerLabelFacts {
  /** Battery records currently in the container. */
  readonly contentCount: number;
  /** `container.current_container_label_id`. */
  readonly currentContainerLabelId: string | null;
  /** `container.accumulation_started_at`. */
  readonly accumulationStartedAt: IsoTimestamp | null;
  /**
   * The label the comparison reads: the one the container names as in force,
   * failing that the newest printed for it. Null where none was ever printed.
   */
  readonly label: { readonly accumulationStartedAt: IsoTimestamp } | null;
}

export function containerLabelFlags(
  facts: ContainerLabelFacts,
): ContainerLabelFlags {
  const { label, accumulationStartedAt } = facts;
  return {
    noCurrentLabel:
      facts.contentCount > 0 && facts.currentContainerLabelId === null,
    mislabelled:
      label !== null &&
      accumulationStartedAt !== null &&
      Date.parse(label.accumulationStartedAt) !==
        Date.parse(accumulationStartedAt)
        ? {
            printed: label.accumulationStartedAt,
            current: accumulationStartedAt,
          }
        : null,
  };
}

/**
 * The label a container's flags compare against — the one it names as in
 * force, failing that the newest printed for it. Superseded labels stay
 * readable on their own render; they are not the comparison.
 */
export function labelInForce<
  T extends { readonly id: string; readonly generatedAt: IsoTimestamp },
>(currentContainerLabelId: string | null, labels: readonly T[]): T | null {
  const named = labels.find((label) => label.id === currentContainerLabelId);
  if (named !== undefined) return named;
  const newest = [...labels].sort((a, b) =>
    a.generatedAt < b.generatedAt ? 1 : a.generatedAt > b.generatedAt ? -1 : 0,
  )[0];
  return newest ?? null;
}
