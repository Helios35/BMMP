import type {
  HazardRankingComputation,
  HazardRankingInputs,
} from "@/domain/hazard/run";
import type { HazardRankingScheme } from "@/domain/hazard/scheme";
import type { HazardRankingBand } from "@/domain/taxonomy/hazard-ranking-band";
import type { HazardRankingScope } from "@/domain/taxonomy/hazard-ranking-scope";
import type { IsoTimestamp, Uuid } from "@/types/common";
import type { HazardRanking } from "@/types/condition";

import type { RequestContext } from "./context";
import type { Page, PageRequest } from "./repository";
import type { StorageWriteAttribution } from "./storage";

/**
 * The hazard ranking — `hazard_ranking`, argued for unit 17 in
 * `BUILD_NOTES_b2-11-risk-ranking.md` §3; Rules 10.19–10.26; T-33, T-34,
 * T-43, T-67; D-77.
 *
 * **The adapter fetches; the domain decides.** `inputs` gathers the rows a
 * run reads, `src/domain/hazard` computes the ranking from them, and `run`
 * writes what it concluded. Neither ever orders an item or picks a band, so
 * the Supabase twins are a reader and a writer and nothing more.
 */

export interface HazardRankingQuery extends PageRequest {
  readonly scopeType?: HazardRankingScope;
  readonly batteryRecordId?: Uuid;
  readonly containerId?: Uuid;
  readonly lotId?: Uuid;
  readonly isCurrent?: boolean;
  readonly band?: HazardRankingBand;
}

/** One run, as the domain computed it, and the request that set it running. */
export interface HazardRankingRunWrite {
  readonly computation: HazardRankingComputation;
  readonly attribution: StorageWriteAttribution;
}

export interface HazardRankingRunRecorded {
  readonly runId: Uuid;
  readonly computedAt: IsoTimestamp;
  readonly schemeVersion: string;
  /** Rows written — one per ranked item. */
  readonly ranked: number;
  readonly counts: Readonly<Record<HazardRankingScope, number>>;
}

export interface HazardRankingRepository {
  list(
    ctx: RequestContext,
    query: HazardRankingQuery,
  ): Promise<Page<HazardRanking>>;

  /**
   * Everything a run over this request's organization reads: its batteries,
   * their catalog entries, assessments, recall matches and check runs, its
   * containers and lots, and the names of the people the bases name. Read
   * only; the domain decides which are held.
   */
  inputs(ctx: RequestContext): Promise<HazardRankingInputs>;

  /**
   * **Rank now** — P2 and P6 only (Rule 10.24). Write one row per ranked
   * item, mark the organization's previous current rows not current, and
   * write one `hazard_ranking.computed` row naming the person: one
   * operation, or none of it (Rule 10.26). P5 is refused, as on every write.
   */
  run(
    ctx: RequestContext,
    input: HazardRankingRunWrite,
  ): Promise<HazardRankingRunRecorded>;
}

/** The job's reading half — every organization's inputs and the scheme in force. */
export interface HazardRankingPlan {
  readonly scheme: HazardRankingScheme;
  readonly organizations: readonly {
    readonly organizationId: Uuid;
    readonly inputs: HazardRankingInputs;
    /** Whether it has current rows — a run with nothing held still retires them. */
    readonly hasCurrentRankings: boolean;
  }[];
}
