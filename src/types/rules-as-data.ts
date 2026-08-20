import type {
  Attributed,
  Created,
  IsoDate,
  IsoTimestamp,
  JsonObject,
  TenantScoped,
  Timestamped,
  Uuid,
} from "@/types/common";
import type { ApplicationClass } from "@/domain/taxonomy/application-class";
import type { FormatCategory } from "@/domain/taxonomy/format-category";
import type { JurisdictionLevel } from "@/domain/taxonomy/jurisdiction-level";
import type { JurisdictionRuleDomain } from "@/domain/taxonomy/jurisdiction-rule-domain";
import type { RuleVersionStatus } from "@/domain/taxonomy/rule-version-status";
import type { AppliedRuleVersion } from "@/domain/rules/outcome";

/**
 * Rules as data — `ERD.md` §4.
 *
 * `jurisdiction` · `jurisdiction_rule` · `rule_version` · `format_classification`.
 *
 * **The three platform tables carry no `organization_id`**: they are readable by
 * every authenticated user and writable only by P6. Reference rows ship as
 * numbered migrations, not as `seed.sql` — production needs them.
 *
 * This is what makes `PROJECT_SETUP_BMMP.md` §8.1 mechanical rather than
 * aspirational. **Every threshold, deadline, citation and fire-code limit in the
 * product is a `rule_version` row**, and a hard-coded state threshold is a review
 * rejection.
 */

/** A governing scope. Self-referencing, forming a chain from most specific upward. */
export interface Jurisdiction extends Timestamped {
  readonly id: Uuid;
  /**
   * Stable identifier — `US`, `US-WA`, `US-NY-nyc` (T-40).
   *
   * **Never parsed for meaning in code.** Do not infer a state from a substring
   * and do not branch on a specific code: branching on `US-CA` is a hard-coded
   * jurisdiction rule wearing a disguise (Rule 1.23; T-40).
   */
  readonly code: string;
  readonly name: string;
  /** T-40. Resolution order is `local` → `state` → `federal`. */
  readonly level: JurisdictionLevel;
  /** Null only at the root. */
  readonly parentJurisdictionId: Uuid | null;
  /** ISO 3166-1 alpha-2. */
  readonly countryCode: string;
  /** ISO 3166-2. */
  readonly subdivisionCode: string | null;
  readonly effectiveOn: IsoDate | null;
  readonly expiresOn: IsoDate | null;
}

/**
 * The **stable identity** of a rule, independent of any version of its content.
 *
 * A decision points at this conceptually; `rule_version` is what it points at
 * legally.
 */
export interface JurisdictionRule extends Timestamped, Attributed {
  readonly id: Uuid;
  readonly jurisdictionId: Uuid;
  /** Stable machine key, unique within the jurisdiction. `src/domain` resolves by this. */
  readonly ruleKey: string;
  /** T-41. Which `BUSINESS_RULES.md` section it serves. */
  readonly domain: JurisdictionRuleDomain;
  /** Human name, shown in the reasoning trail. */
  readonly title: string;
  readonly description: string | null;
  /**
   * Which categories it governs. `null` means all.
   *
   * **Includes the medium-format category covering scooter and mobility packs
   * from the first reference-data migration** — not added at B3 (`_ANCHORS.md`
   * §0; Rules 8.3, 11.2).
   *
   * The database column is `applies_to_application_classs` — the triple `s` is
   * how `ERD.md` §4.2 spells it, and it is reported as a defect in this unit's
   * build-notes rather than corrected here, because a canonical name is not a
   * builder's to change.
   */
  readonly appliesToApplicationClasses: readonly ApplicationClass[] | null;
  /** Deactivation never deletes. */
  readonly isActive: boolean;
}

/**
 * The versioned payload. **The table that makes an audit two years later
 * possible.**
 *
 * Three constraints do the real work, and none of them lives in application
 * code: `citation` is `not null`, a GiST exclusion constraint forbids two
 * published versions of one rule from overlapping in time, and `UPDATE` is
 * permitted only while `published_at is null`. Amending a published rule means
 * publishing a new version with a new effective date — **history is never
 * rewritten** (Rule 12.22).
 */
export interface RuleVersion extends Created {
  readonly id: Uuid;
  readonly jurisdictionRuleId: Uuid;
  /** e.g. an ordinal or an adoption year. */
  readonly versionLabel: string;
  /** Inclusive. */
  readonly effectiveOn: IsoDate;
  /** Exclusive. Null means open-ended. */
  readonly expiresOn: IsoDate | null;
  /** **Mandatory.** A rule that cannot be cited cannot be created. */
  readonly citation: string;
  readonly citationUrl: string | null;
  /** Where the text was read from. */
  readonly sourceDocumentRef: string | null;
  /**
   * Thresholds, operators, units, alert offsets, retention periods.
   * **The only place these values exist.**
   */
  readonly payload: JsonObject;
  /** Which Zod schema validates `payload`. */
  readonly payloadSchemaKey: string;
  readonly supersedesRuleVersionId: Uuid | null;
  /** T-42. Only a published status is resolvable by a decision. */
  readonly status: RuleVersionStatus;
  /** Null = draft. Non-null = frozen. */
  readonly publishedAt: IsoTimestamp | null;
  /** P6 only. */
  readonly publishedBy: Uuid | null;
  readonly createdBy: Uuid | null;
}

/**
 * The per-jurisdiction, per-rule-version size/format result for one battery —
 * **APPEND-ONLY**.
 *
 * **This is not a column on `battery_record`, and it must never become one.**
 * The same physical battery falls into a different statutory band in one state
 * than in another. That is not an edge case; it is the entire premise of Phase
 * B1b's multi-state obligation engine (Rules 8.1, 8.2), and a single
 * `battery_record.format_category` column can only ever hold one state's answer,
 * which makes every other state's answer wrong. `TAXONOMY.md` T-06 states this
 * as a review rejection.
 *
 * A new rule version writes a **new row**; existing rows are never mutated,
 * because the classification that produced a filed document must stay readable
 * exactly as it was (Rule 12.22).
 */
export interface FormatClassification extends TenantScoped, Created {
  readonly id: Uuid;
  readonly batteryRecordId: Uuid;
  /** **Which state's answer this row is.** The reason one battery has several rows. */
  readonly jurisdictionId: Uuid;
  /** The threshold rule that assigns the band. */
  readonly jurisdictionRuleId: Uuid;
  /** **The version that produced this result.** Part of the key. */
  readonly ruleVersionId: Uuid;
  /** T-06. Includes `medium_format` from the first migration. */
  readonly formatCategory: FormatCategory;
  /** The confirmed chemistry, mass, energy and removability values evaluated, frozen. */
  readonly inputsSnapshot: JsonObject;
  /** Every applied rule with its citation **as it read that day**. */
  readonly evaluationTrace: readonly AppliedRuleVersion[];
  /** Copied from the rule version. **Never written into logic** (Rule 1.23). */
  readonly citation: string;
  /** P6 may record an override; P1 may not (T-06). */
  readonly isOverride: boolean;
  /** Required in effect when `isOverride`. */
  readonly overrideReason: string | null;
  readonly determinedAt: IsoTimestamp;
  /** Null when system-assigned. */
  readonly determinedBy: Uuid | null;
  /** Cleared when a newer rule version supersedes. */
  readonly isCurrent: boolean;
  readonly supersedesFormatClassificationId: Uuid | null;
}
