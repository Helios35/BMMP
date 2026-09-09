import type { FieldSource } from "@/components/provenance/field-source-badge";
import type { OutstandingItem } from "@/domain/intake/commit-gate";
import type { Chemistry } from "@/domain/taxonomy/chemistry";
import type { ConfidenceBand } from "@/domain/taxonomy/confidence-band";
import type { LabelFieldCode } from "@/domain/taxonomy/label-field-code";
import type { ActionResult } from "@/lib/action-result";
import type { IsoDate, IsoTimestamp, TimeZone, Uuid } from "@/types/common";
import type { DraftFieldStatus } from "@/types/intake";

/**
 * The props of `ExtractionReviewCard` — the design's §8.1, verbatim.
 *
 * **The card is decoupled.** It holds no data access, knows no route and
 * imports nothing from `next/navigation`: everything it shows arrives as a
 * prop and everything it does goes out through {@link ExtractionReviewActions}.
 * `/batteries/new` step 2 and `/review` render the identical component
 * (`UX_SPEC.md` §2.1 — *"the review queue is not a second implementation"*),
 * and the only way to keep that true is for the card to know nothing about
 * either of them.
 *
 * Every action returns an {@link ActionResult}. The card awaits it and
 * **re-renders from the server's answer, never from its own guess**: confirming
 * a hard-gated field and committing a record are the two things §6.4 forbids
 * rendering optimistically, so a row reads as confirmed only once the props
 * say so.
 */

/**
 * The only two sources chemistry may have (Rules 2.9, 2.10).
 *
 * Mirrors `ChemistryFieldSource` in `src/features/battery-record/field-source.ts`
 * rather than importing it — a shared component does not reach into a feature
 * folder — and the union is the enforcement either way: the chemistry row is
 * typed against these two members, so nothing in this folder can render
 * *Read from label* or *Detected from image* beside a chemistry. A camera never
 * identifies chemistry, and copy implying it did is a defect
 * (`_ANCHORS.md` §7.2).
 */
export type ChemistryFieldSource = Extract<
  FieldSource,
  "matched_from_catalog" | "entered_by"
>;

/** How a row edits. `readonly` rows carry a note saying where the value is set. */
export type ReviewFieldInput =
  | { readonly kind: "text" }
  | { readonly kind: "mono" }
  | {
      readonly kind: "select";
      readonly options: readonly {
        readonly value: string;
        readonly label: string;
      }[];
    }
  | { readonly kind: "tristate" }
  | { readonly kind: "readonly"; readonly note: string };

/** The date-code row's decode, beside the raw code (Rule 2.24). */
export interface ReviewFieldDecode {
  readonly date: IsoDate | null;
  readonly precisionLabel: string | null;
  /** True renders the literal **Undecodable** — never an approximate date. */
  readonly undecodable: boolean;
}

export interface ReviewFieldView {
  readonly fieldCode: LabelFieldCode;
  /** From `LABEL_FIELD_CODE_LABELS`, resolved by the caller. */
  readonly label: string;
  readonly value: string | null;
  /** What the extraction read, retained beside a correction (D-7). */
  readonly originalValue: string | null;
  /** Characters the model reported, shown when the value failed validation (Rule 2.12). */
  readonly rawText: string | null;
  readonly source: FieldSource;
  readonly confidenceBand: ConfidenceBand | null;
  /** The provider's raw digits. Rendered small and never as a percentage. */
  readonly rawConfidence: string | null;
  readonly isHardGated: boolean;
  readonly isRequired: boolean;
  readonly status: DraftFieldStatus;
  readonly confirmedByName: string | null;
  readonly confirmedAt: IsoTimestamp | null;
  readonly input: ReviewFieldInput;
  readonly decoded?: ReviewFieldDecode;
}

export interface CatalogCandidateView {
  readonly catalogEntryId: Uuid;
  readonly title: string;
  readonly chemistryLabel: string;
  readonly specs: readonly string[];
  /** "manufacturer + part number" — the panel prefixes *Matched on*. */
  readonly matchedOnLabel: string;
  /** Compared by the gate; never rendered as a number. */
  readonly matchScore: number;
}

export interface ReviewImage {
  readonly src: string | null;
  readonly alt: string;
  readonly width: number;
  readonly height: number;
}

export type ReviewCardState =
  "default" | "loading" | "error" | "empty" | "disabled";

export type CatalogMatchState = "default" | "loading" | "error" | "empty";

/**
 * Everything the card can do, as async functions the route supplies.
 *
 * Every one returns an {@link ActionResult}: the card renders a failure inline
 * beside the control that asked (§10.3) and never replaces the page.
 */
export interface ExtractionReviewActions {
  confirmField(
    fieldCode: LabelFieldCode,
    value: string | null,
  ): Promise<ActionResult<unknown>>;
  rejectField(fieldCode: LabelFieldCode): Promise<ActionResult<unknown>>;
  /** Manual entry — pending until confirmed (Rule 2.21, two acts). */
  enterValue(
    fieldCode: LabelFieldCode,
    value: string | null,
  ): Promise<ActionResult<unknown>>;
  /** `null` declines every candidate and takes the manual path (Rule 2.20). */
  selectCandidate(catalogEntryId: Uuid | null): Promise<ActionResult<unknown>>;
  enterChemistry(chemistry: Chemistry): Promise<ActionResult<unknown>>;
  rejectRead(): Promise<ActionResult<unknown>>;
  saveToQueue(): Promise<ActionResult<unknown>>;
  /**
   * Void with a stated reason (Rule 2.23). Rendered in `review` mode, or in any
   * mode the route supplies it for.
   */
  voidItem?(reason: string): Promise<ActionResult<unknown>>;
  continue(): Promise<ActionResult<unknown>>;
  /**
   * Receives the codes the card computed as eligible — pending, High band, and
   * **never one of the three hard-gated fields** (Rules 2.15, 2.17).
   */
  confirmAllHighConfidence(
    fieldCodes: readonly LabelFieldCode[],
  ): Promise<ActionResult<unknown>>;
  retryExtraction(): Promise<ActionResult<unknown>>;
  enterManually(): Promise<ActionResult<unknown>>;
  retakePhoto(): Promise<ActionResult<unknown>>;
  searchCatalog(): Promise<ActionResult<unknown>>;
  proposeEntry(): Promise<ActionResult<unknown>>;
}

export interface ExtractionReviewGate {
  readonly isReviewRequired: boolean;
  readonly fieldsBelowThreshold: number;
  /** T-52 as stored. An unrecognised code renders as stored, in mono. */
  readonly reasonCodes: readonly string[];
}

export interface ExtractionReviewCardProps {
  readonly sessionId: Uuid;
  readonly readAt: IsoTimestamp | null;
  readonly timeZone: TimeZone;
  readonly state: ReviewCardState;
  readonly errorMessage?: string;
  readonly disabledReason?: string;
  readonly gate: ExtractionReviewGate;
  readonly fields: readonly ReviewFieldView[];
  readonly candidates: readonly CatalogCandidateView[];
  readonly selectedCatalogEntryId: Uuid | null;
  readonly catalogMatchState: CatalogMatchState;
  /** E-5's second line — the record cannot ship until the product is in the catalog. */
  readonly cannotShipNote: boolean;
  readonly cropThumbnail: ReviewImage | null;
  readonly originalPhoto: ReviewImage | null;
  readonly ownsCondition: boolean;
  /** From `outstandingCommitItems` / `canContinueFromReview` — never composed here. */
  readonly outstanding: readonly OutstandingItem[];
  /** Three or more rows in the High band (§2.1.4(4)). */
  readonly bulkConfirmAvailable: boolean;
  readonly primaryLabel: string;
  /**
   * The primary's in-flight label — a present participle, never a bare
   * spinner (§6.3). Defaults to the neutral *Saving…* when the route does not
   * name the act.
   */
  readonly primaryPendingLabel?: string;
  readonly mode: "intake" | "review";
  /**
   * When extraction started, so the loading copy can change after the slow
   * threshold (§2.1.6) without the card reading a clock of its own.
   */
  readonly loadingSince?: IsoTimestamp | null;
  /**
   * `false` lets a route host the action bar and its checklist in
   * `MobileActionBar` instead of the card's own sticky bar. Default `true`.
   */
  readonly renderActionBar?: boolean;
  readonly actions: ExtractionReviewActions;
}
