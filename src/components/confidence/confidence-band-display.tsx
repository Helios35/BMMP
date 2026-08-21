import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleHelp,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  CONFIDENCE_BAND_LABELS,
  CONFIDENCE_BANDS,
  type ConfidenceBand,
} from "@/domain/taxonomy/confidence-band";
import type { StatusIntent } from "@/components/status/status-intent";
import { INTENT_SURFACE_CLASSES } from "@/components/status/intent-classes";

/**
 * `ConfidenceBandDisplay` — the per-field extraction confidence on
 * `ExtractionReviewCard` (`UX_SPEC.md` §2.1.2).
 *
 * **Four states, not three** (D-22): High, Medium, Low and None. **The band
 * label is the primary signal and the numeric value is secondary** — so a
 * threshold change is a configuration change and not a redesign, and so nobody
 * reads two decimal places as precision the extraction does not have.
 *
 * Three things this component will not do:
 *
 * - **It never renders the raw score as a percentage** (T-10, D-22). The score
 *   is a provider's number in 0..1, stored for audit; a `%` next to it implies a
 *   calibration nobody has established.
 * - **It never carries a threshold.** The cutoffs are platform configuration
 *   owned by P6 — a tenant may raise them and can never lower them (D-22) — and
 *   the *existence* of the gate is not configurable at all (Rules 2.13, 2.17).
 * - **It is never placed near, combined with, or styled like a condition, damage
 *   or hazard signal** (`UX_SPEC.md` §0). Confidence is a property of a text
 *   extraction from an image. It says nothing about the battery.
 */

/** §2.1.2 — `ok` / `attention` / `critical` / `neutral`, in that order. */
const BAND_INTENTS: Readonly<Record<ConfidenceBand, StatusIntent>> = {
  high: "ok",
  medium: "attention",
  low: "critical",
  not_extracted: "neutral",
};

const BAND_ICONS: Readonly<Record<ConfidenceBand, LucideIcon>> = {
  high: CircleCheck,
  medium: TriangleAlert,
  low: CircleAlert,
  not_extracted: CircleDashed,
};

function isConfidenceBand(value: string): value is ConfidenceBand {
  return (CONFIDENCE_BANDS as readonly string[]).includes(value);
}

export interface ConfidenceBandDisplayProps {
  /** The **stored** T-10 value. `null` renders the not-yet-evaluated state. */
  readonly band: string | null | undefined;
  /**
   * The provider's raw score, `0..1`, as its exact digits.
   *
   * Rendered small, beneath the band, as the secondary signal. Omit it and the
   * band still reads correctly — which is the point of the band being primary.
   */
  readonly rawConfidence?: string | null;
  /**
   * True for T-09's hard-gated fields — model, chemistry code and assessed
   * condition. **No band auto-commits these, at any score** (Rule 2.15), so the
   * display says so rather than letting a `High` badge imply otherwise.
   */
  readonly isHardGated?: boolean;
  readonly className?: string;
}

export function ConfidenceBandDisplay({
  band,
  rawConfidence,
  isHardGated = false,
  className,
}: ConfidenceBandDisplayProps) {
  // Empty — the field has not been through an extraction yet. Distinct from
  // `not_extracted`, which means a run happened and read nothing.
  if (band === null || band === undefined || band === "") {
    return (
      <div className={cn("flex flex-col gap-0.5", className)}>
        <Badge
          variant="outline"
          data-confidence-state="empty"
          className={cn(
            "h-7 gap-1.5 rounded-md border px-2 text-sm font-medium",
            INTENT_SURFACE_CLASSES.neutral,
          )}
        >
          <CircleDashed aria-hidden="true" />
          <span>Not evaluated</span>
        </Badge>
      </div>
    );
  }

  // Error — a band this build does not recognise. Rendered as stored, never
  // coerced (TAXONOMY.md §5.8).
  if (!isConfidenceBand(band)) {
    return (
      <div className={cn("flex flex-col gap-0.5", className)}>
        <Badge
          variant="outline"
          data-confidence-state="unrecognised"
          title="Retired or unrecognised confidence band"
          className={cn(
            "h-7 gap-1.5 rounded-md border px-2 text-sm font-medium",
            INTENT_SURFACE_CLASSES.neutral,
          )}
        >
          <CircleHelp aria-hidden="true" />
          <span className="font-mono">{band}</span>
        </Badge>
      </div>
    );
  }

  const intent = BAND_INTENTS[band];
  const Icon = BAND_ICONS[band];

  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <Badge
        variant="outline"
        data-confidence-state="default"
        data-band={band}
        data-intent={intent}
        className={cn(
          "h-7 gap-1.5 rounded-md border px-2 text-sm font-medium",
          INTENT_SURFACE_CLASSES[intent],
        )}
      >
        <Icon aria-hidden="true" />
        {/* The band label is the primary signal (D-22). */}
        <span>{CONFIDENCE_BAND_LABELS[band]}</span>
      </Badge>

      {/* Secondary, and never a percentage. */}
      {typeof rawConfidence === "string" && rawConfidence !== "" ? (
        <span
          data-confidence-score
          className="tabular text-caption text-muted-foreground"
        >
          {`Score ${rawConfidence}`}
        </span>
      ) : null}

      {isHardGated ? (
        <span data-confidence-hard-gated className="text-caption font-medium">
          Always confirmed by a person
        </span>
      ) : null}
    </div>
  );
}

/** The loading state, at the display's exact height — never a jumping layout. */
export function ConfidenceBandDisplaySkeleton({
  className,
}: {
  readonly className?: string;
}) {
  return (
    <div
      data-confidence-state="loading"
      className={cn("flex flex-col gap-0.5", className)}
    >
      <Skeleton className="h-7 w-24 rounded-md" />
      <Skeleton className="h-[1.125rem] w-16 rounded-md" />
    </div>
  );
}
