import { describe, expect, it } from "vitest";
import * as taxonomy from "@/domain/taxonomy";
import {
  isTaxonomyValue,
  labelFor,
  optionsFor,
  readTaxonomyValue,
} from "@/domain/taxonomy/lookup";

/**
 * The taxonomy contract — `TAXONOMY.md` §4.4 and §5.
 *
 * These assert the properties that make the label-to-database mapping safe, and
 * they are written against **every** system rather than a sample, because the
 * failure this section guards against is exactly one system drifting while the
 * rest stay correct.
 */

/** Every `(values, labels)` pair the taxonomy exports, discovered rather than listed. */
function systems(): readonly {
  name: string;
  values: readonly string[];
  labels: Readonly<Record<string, string>>;
}[] {
  const exported = taxonomy as unknown as Record<string, unknown>;
  const found: {
    name: string;
    values: readonly string[];
    labels: Readonly<Record<string, string>>;
  }[] = [];

  for (const [key, value] of Object.entries(exported)) {
    if (!key.endsWith("_LABELS")) continue;
    const labels = value as Readonly<Record<string, string>>;
    // Find the value list that goes with this label lookup. The naming rule is
    // TAXONOMY.md §4.1: the constant is UPPER_SNAKE_CASE and plural, the lookup
    // is the same concept suffixed _LABELS.
    const candidates = Object.entries(exported).filter(
      ([otherKey, otherValue]) =>
        otherKey !== key &&
        !otherKey.endsWith("_LABELS") &&
        Array.isArray(otherValue) &&
        (otherValue as readonly unknown[]).every(
          (item) => typeof item === "string",
        ) &&
        (otherValue as readonly string[]).length ===
          Object.keys(labels).length &&
        (otherValue as readonly string[]).every((item) => item in labels),
    );
    const [match] = candidates;
    if (match === undefined) continue;
    found.push({
      name: key.replace(/_LABELS$/, ""),
      values: match[1] as readonly string[],
      labels,
    });
  }
  return found;
}

const SYSTEMS = systems();

describe("the taxonomy", () => {
  it("exports a value list and a label lookup for every classification system", () => {
    // 47 systems, T-01 through T-47. A system that loses its pairing here is a
    // system a screen will silently render without a label.
    expect(SYSTEMS.length).toBeGreaterThanOrEqual(47);
  });

  it.each(SYSTEMS.map((system) => [system.name, system] as const))(
    "%s labels exactly its own values, and no others",
    (_name, system) => {
      expect(Object.keys(system.labels).sort()).toEqual(
        [...system.values].sort(),
      );
    },
  );

  it.each(SYSTEMS.map((system) => [system.name, system] as const))(
    "%s stored values are lower snake_case ASCII (§5.2)",
    (_name, system) => {
      for (const value of system.values) {
        // ASCII only, lower-case, underscores only — no hyphens, spaces, dots,
        // slashes, accents or capitals (§4.4 rule 8). Audit event types are the
        // one documented shape carrying a dot, `<entity>.<past_tense_verb>`,
        // and both sides are still lower snake_case; the next test checks it.
        expect(value, `${value} is not lower snake_case`).toMatch(
          /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)?$/,
        );
        // §4.4 rule 9 — if a value needs more than 40 characters, the concept
        // is wrong.
        expect(
          value.length,
          `${value} exceeds the 40-character ceiling`,
        ).toBeLessThanOrEqual(40);
      }
    },
  );

  it("audit event types are <entity>.<past_tense_verb>, both sides lower snake_case", () => {
    for (const value of taxonomy.AUDIT_EVENT_TYPES) {
      expect(value).toMatch(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/);
    }
  });

  it.each(SYSTEMS.map((system) => [system.name, system] as const))(
    "%s carries no threshold, unit, date or currency in a value name (§4.4 rule 3)",
    (_name, system) => {
      for (const value of system.values) {
        // `band_1`..`band_4` and `un3480` are the documented exceptions: an
        // ordinal that *is* the meaning, and an industry-standard identifier.
        if (/^band_[1-4]$/.test(value)) continue;
        if (/^un\d{4}$/.test(value)) continue;
        expect(
          /\d/.test(value),
          `${value} carries a number — a threshold belongs to jurisdiction_rule, not to a stored value`,
        ).toBe(false);
      }
    },
  );

  it.each(SYSTEMS.map((system) => [system.name, system] as const))(
    "%s labels are never the stored value, and never contain it (§4.5)",
    (_name, system) => {
      for (const value of system.values) {
        const label = system.labels[value] as string;
        // Empty and pending states get real labels — `unknown` reads "Chemistry
        // not confirmed", never "Unknown", "N/A" or an em dash. A user who sees
        // "—" learns nothing (§4.5).
        expect(label.length).toBeGreaterThan(0);
        expect(label).not.toBe(value);
        // The forbidden shape is "Light waste category (light_category)" — the
        // machine value shown to a human. Short values are skipped because a
        // substring test on `i` or `a` matches ordinary prose: T-19's roman
        // numerals and T-31's single letters are external identifiers and are
        // the documented exception to §4.4 rule 7.
        if (value.length >= 3) {
          expect(
            label.includes(value),
            `"${label}" leaks the stored value ${value}`,
          ).toBe(false);
        }
      }
    },
  );

  it("carries labels no string transform could produce (§5.1)", () => {
    // Some labels do read like a sentence-cased value — "Proposed" for
    // `proposed` — and that is fine. The point is that a transform *cannot*
    // serve as the mapping, because plenty of labels contain an em dash, a
    // slash, a bracket or an external identifier's own casing. One counter-
    // example per system would be noise; the population-level fact is the one
    // that matters, and it is what makes a lookup mandatory rather than tidy.
    const underivable = SYSTEMS.flatMap((system) =>
      system.values.filter(
        (value) =>
          (system.labels[value] as string)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_|_$/g, "") !== value,
      ),
    );
    expect(underivable.length).toBeGreaterThan(40);
    // The worked example from §5.5: UN3480 is the label, un3480 is the value.
    expect(taxonomy.UN_TRANSPORT_IDENTIFIER_LABELS.un3480).toBe("UN3480");
  });

  it("stores no persona ID as a role value (§5.7)", () => {
    for (const role of taxonomy.ROLE_CODES) {
      expect(role).not.toMatch(/^p[1-6]$/i);
    }
    // The persona mapping exists for documentation and resolves the other way.
    expect(taxonomy.ROLE_PERSONA_IDS.compliance_handler).toBe("P1");
    expect(taxonomy.ROLE_PERSONA_IDS.platform_admin).toBe("P6");
  });

  it("carries the two systems that must exist at B1a (_ANCHORS.md §0)", () => {
    // Built narrow, B3 is a rebuild rather than a four-week activation.
    expect(taxonomy.APPLICATION_CLASSES).toContain("small_mobility");
    expect(taxonomy.FORMAT_CATEGORIES).toContain("medium_format");
  });

  it("gives the extraction confidence band four states, not three (D-22)", () => {
    expect(taxonomy.CONFIDENCE_BANDS).toEqual([
      "high",
      "medium",
      "low",
      "not_extracted",
    ]);
    expect(taxonomy.CONFIDENCE_BAND_LABELS.not_extracted).toBe("None");
  });

  it("names the elapsed condition `overdue` on all three columns that carry it", () => {
    // One condition, one word, so no builder infers a fourth state from a
    // fourth name (TAXONOMY.md v1.2, T-24/T-26/T-27).
    expect(taxonomy.CONTAINER_STATUSES).toContain("overdue");
    expect(taxonomy.STORAGE_CLOCK_STATUSES).toContain("overdue");
    expect(taxonomy.STORAGE_CLOCK_ALERT_BANDS).toContain("overdue");
    // `expired` was retired at v1.2 and is never reused for a new meaning.
    expect(taxonomy.STORAGE_CLOCK_STATUSES).not.toContain("expired");
  });

  it("keeps no offset in a storage-clock alert band label (§5.4)", () => {
    // The worked example: renaming the notice is a copy edit that migrates
    // nothing, because the stored value never carried the number.
    for (const band of taxonomy.STORAGE_CLOCK_ALERT_BANDS) {
      expect(taxonomy.STORAGE_CLOCK_ALERT_BAND_LABELS[band]).not.toMatch(/\d/);
    }
  });

  it("makes T-23 a composite of classification outcome and condition (Rule 4.28)", () => {
    expect(taxonomy.CONTAINER_TYPES).toHaveLength(6);
    for (const type of taxonomy.CONTAINER_TYPES) {
      const pair = taxonomy.CONTAINER_TYPE_DIMENSIONS[type];
      expect(pair.wasteClassification).toMatch(
        /^(light_category|fully_regulated)$/,
      );
      expect(pair.condition).toMatch(/^(sound|ddr|hold)$/);
    }
    // The four flat values retired at v1.2 are never reused.
    expect(taxonomy.CONTAINER_TYPES).not.toContain("damaged_defective");
    expect(taxonomy.CONTAINER_TYPES).not.toContain("quarantine_hold");
  });

  it("splits damage findings two ways and only two ways (Rule 6.4)", () => {
    const classified = new Set([
      ...taxonomy.DAMAGED_OR_DEFECTIVE_FINDING_TYPES,
      ...taxonomy.COSMETIC_FINDING_TYPES,
      "none_observed",
    ]);
    expect([...taxonomy.DAMAGE_FINDING_TYPES].sort()).toEqual(
      [...classified].sort(),
    );
    // The three-way middle band was the builder judgment Rule 6.4 removes.
    for (const finding of taxonomy.DAMAGED_OR_DEFECTIVE_FINDING_TYPES) {
      expect(taxonomy.COSMETIC_FINDING_TYPES).not.toContain(finding);
    }
  });

  it("hard-gates model, chemistry code and assessed condition (Rule 2.15)", () => {
    expect([...taxonomy.HARD_GATED_LABEL_FIELD_CODES].sort()).toEqual([
      "assessed_condition",
      "chemistry_code",
      "model",
    ]);
  });

  it("has no probability, likelihood or risk-score value anywhere (Principle 4)", () => {
    // The absence is the enforcement, in the schema and here.
    const forbidden = /probability|likelihood|risk_score|ignition|chance/;
    for (const system of SYSTEMS) {
      for (const value of system.values) {
        expect(forbidden.test(value), `${system.name}.${value}`).toBe(false);
      }
      for (const label of Object.values(system.labels)) {
        expect(
          /probability|likelihood|risk of fire|chance of/i.test(label),
          `${system.name}: "${label}"`,
        ).toBe(false);
      }
    }
  });
});

describe("reading a stored value", () => {
  it("recognises a live value and returns its label", () => {
    const read = readTaxonomyValue(
      taxonomy.CONTAINER_STATUSES,
      taxonomy.CONTAINER_STATUS_LABELS,
      "overdue",
    );
    expect(read).toEqual({
      recognised: true,
      storedValue: "overdue",
      label: "Overdue",
    });
  });

  it("renders an unrecognised value as stored, and never coerces it (§5.8)", () => {
    // A retired value in historical data, or a newer deployment's. Silently
    // reading it as something else fabricates a compliance record.
    const read = readTaxonomyValue(
      taxonomy.CONTAINER_STATUSES,
      taxonomy.CONTAINER_STATUS_LABELS,
      "expired",
    );
    expect(read).toEqual({ recognised: false, storedValue: "expired" });
    expect(isTaxonomyValue(taxonomy.CONTAINER_STATUSES, "expired")).toBe(false);
  });

  it("returns options in the value list's order, which is the display order (§5.7)", () => {
    const options = optionsFor(
      taxonomy.CONFIDENCE_BANDS,
      taxonomy.CONFIDENCE_BAND_LABELS,
    );
    expect(options.map((option) => option.value)).toEqual([
      ...taxonomy.CONFIDENCE_BANDS,
    ]);
    // Not alphabetical by stored value — that order is meaningless to a user.
    expect(options[0]?.label).toBe("High");
  });

  it("round-trips a value through storage and back to a label (§5.5)", () => {
    const stored = "un3480";
    expect(isTaxonomyValue(taxonomy.UN_TRANSPORT_IDENTIFIERS, stored)).toBe(
      true,
    );
    expect(labelFor(taxonomy.UN_TRANSPORT_IDENTIFIER_LABELS, "un3480")).toBe(
      "UN3480",
    );
    // The stored value never surfaces to a human; the label never reaches
    // storage. The only place they meet is the lookup.
    expect(stored).not.toBe("UN3480");
  });
});
