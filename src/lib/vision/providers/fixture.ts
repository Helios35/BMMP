import { createHash } from "node:crypto";

import type { ProposableFindingType } from "@/domain/photo-checks/damage-proposals";
import type { LabelLookModelOutcome } from "@/domain/photo-checks/label-look";

import {
  DAMAGE_PROPOSAL_SCHEMA_VERSION,
  LABEL_EXTRACTION_SCHEMA_VERSION,
  LABEL_FIELD_KEYS,
  LABEL_LOOK_SCHEMA_VERSION,
  VisionProviderError,
  type BoundingBox,
  type DamageProposalResult,
  type ExtractionRequest,
  type LabelExtractionResult,
  type LabelFieldKey,
  type LabelFieldResult,
  type LabelLookRequest,
  type LabelLookResult,
  type PhotoImage,
  type RegionDetection,
  type RegionRequest,
  type VisionProvider,
} from "../provider";

/**
 * The fixture label reader — the CI and `DATA_ADAPTER=mock` default
 * (`TECHNICAL_SPEC.md` §11.1 step 3, §12.2).
 *
 * Canned answers keyed by the uploaded file's name, so the e2e suite is
 * deterministic, offline and free: no test spends money or needs a network.
 * **Nothing here looks at the pixels.** The scenario is the last
 * hyphen-separated token of the file name's stem (`label-low.png` → `low`),
 * case-insensitive, and anything unrecognised — including no file name at
 * all — reads as the clean label.
 *
 * The clean answer mirrors the mock database's completed vehicle intake
 * (`src/data/mock/fixtures`: Northvale NV-TP400-96S), so a record made through
 * the real intake flow on this provider matches the catalog entry the fixtures
 * already carry and lands where the seeded records landed.
 *
 * Two things this provider never does, on purpose:
 *
 * - **It never proposes `assessed_condition`.** Condition is assessed by a
 *   person looking at the battery, never read off a label (T-09, Rule 6.1).
 *   The key is answered — every T-09 key always is — as unread.
 * - **It never returns a chemistry.** `chemistry_code` is the characters printed
 *   on the label, e.g. `Li-ion NMC`, and by itself sets nothing. Chemistry on a
 *   record comes from a matched catalog entry or a person (Rules 2.9, 2.10).
 *
 * Latency is not simulated; the mock data layer owns latency
 * (`MOCK_LATENCY_MS`) and two places simulating it would double it.
 */

export const FIXTURE_PROVIDER_CODE = "fixture";
export const FIXTURE_MODEL_IDENTIFIER = "fixture-label-reader";
export const FIXTURE_PROMPT_VERSION = "2026-08-01";

export const FIXTURE_SCENARIOS = [
  "clean",
  "low",
  "nomatch",
  "unreadable",
  "fail",
  "manualcrop",
  "scooter",
  "mismatch",
] as const;

export type FixtureScenario = (typeof FIXTURE_SCENARIOS)[number];

const DEFAULT_SCENARIO: FixtureScenario = "clean";

function isFixtureScenario(value: string): value is FixtureScenario {
  return (FIXTURE_SCENARIOS as readonly string[]).includes(value);
}

/**
 * `some/dir/label-Low.PNG` → `low`. The directory and extension are dropped,
 * then the last hyphen-separated token of what remains decides.
 */
export function scenarioForFileName(fileName: string | null): FixtureScenario {
  if (fileName === null) return DEFAULT_SCENARIO;
  const base = fileName.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const token = stem.split("-").pop()?.trim().toLowerCase() ?? "";
  return isFixtureScenario(token) ? token : DEFAULT_SCENARIO;
}

// --- the region ---------------------------------------------------------------

/**
 * The detected label region, stated in a 4:3 reference frame and scaled to the
 * request's own dimensions, so the box lands on the same part of the picture
 * whatever size was uploaded.
 */
const REFERENCE_FRAME = { width: 2048, height: 1536 } as const;
const REFERENCE_BOX: BoundingBox = { x: 604, y: 512, width: 812, height: 384 };
const REGION_CONFIDENCE = 0.94;

export function scaleReferenceBox(width: number, height: number): BoundingBox {
  const sx = width / REFERENCE_FRAME.width;
  const sy = height / REFERENCE_FRAME.height;
  return {
    x: Math.round(REFERENCE_BOX.x * sx),
    y: Math.round(REFERENCE_BOX.y * sy),
    width: Math.round(REFERENCE_BOX.width * sx),
    height: Math.round(REFERENCE_BOX.height * sy),
  };
}

// --- the answers ----------------------------------------------------------------

type FieldAnswer = LabelFieldResult<string>;
type FieldAnswers = { readonly [K in LabelFieldKey]: FieldAnswer };

/** Unread: null value, no confidence to speak of, and nothing pretending otherwise. */
const UNREAD: FieldAnswer = { value: null, confidence: 0 };

function read(value: string, confidence: number, rawText = value): FieldAnswer {
  return { value, confidence, evidence: { rawText } };
}

/**
 * The completed vehicle intake in the fixtures, read cleanly. The scores mirror
 * `label_extraction` rows the fixtures already hold for the same label.
 */
const CLEAN: FieldAnswers = {
  manufacturer: read(
    "Northvale Cell Systems",
    0.97412,
    "NORTHVALE CELL SYSTEMS",
  ),
  model: read("NV-TP400-96S", 0.96108),
  chemistry_code: read("Li-ion NMC", 0.95217),
  voltage: read("355.2 V", 0.95003, "355.2V"),
  capacity_ah: read("220 Ah", 0.94655, "220Ah"),
  energy_wh: read("78100 Wh", 0.94012, "78100Wh"),
  date_code: read("2144", 0.93408),
  serial_number: read("NVTP4000000091447", 0.95531),
  certification_marks: read("UN38.3, CE", 0.9418, "UN38.3 CE"),
  transport_test_marking: read("present", 0.93726, "UN38.3"),
  assessed_condition: UNREAD,
};

/** The same label read through a scuff: the model's zeros came back as letters. */
const LOW: FieldAnswers = {
  ...CLEAN,
  model: read("NV-TP4OO-96S", 0.52),
  serial_number: read("NVTP4000000091447", 0.61, "NVTP40000000914 7"),
};

/** A pack no catalog entry describes. Every field reads cleanly; nothing matches. */
const NOMATCH: FieldAnswers = {
  manufacturer: read("Kestrel Power", 0.96844, "KESTREL POWER"),
  model: read("KP-48V30-LFP", 0.9591),
  chemistry_code: read("LiFePO4", 0.95322),
  voltage: read("48 V", 0.96101, "48V"),
  capacity_ah: read("30 Ah", 0.95487, "30Ah"),
  energy_wh: read("1440 Wh", 0.94973, "1440Wh"),
  date_code: read("2309", 0.93855),
  serial_number: read("KP4830-2309-00512", 0.9462),
  certification_marks: read("UN38.3, CE", 0.94108, "UN38.3 CE"),
  transport_test_marking: read("present", 0.93591, "UN38.3"),
  assessed_condition: UNREAD,
};

/** Nothing legible. The characters the model reported on the model line are kept for the reviewer (Rule 2.12). */
const UNREADABLE: FieldAnswers = {
  manufacturer: UNREAD,
  model: { value: null, confidence: 0, evidence: { rawText: "▮▮▮" } },
  chemistry_code: UNREAD,
  voltage: UNREAD,
  capacity_ah: UNREAD,
  energy_wh: UNREAD,
  date_code: UNREAD,
  serial_number: UNREAD,
  certification_marks: UNREAD,
  transport_test_marking: UNREAD,
  assessed_condition: UNREAD,
};

/**
 * The mobility-device pack the fixtures carry (Ridgeline RM-24V50-AGM). A
 * sealed lead-acid scooter battery carries no lithium transport-test marking,
 * so that field reads as absent — a clean read of a label that does not have it.
 */
const SCOOTER: FieldAnswers = {
  manufacturer: read("Ridgeline Mobility", 0.96733, "RIDGELINE MOBILITY"),
  model: read("RM-24V50-AGM", 0.9584),
  chemistry_code: read("Sealed lead-acid", 0.95106, "SEALED LEAD-ACID"),
  voltage: read("24 V", 0.96412, "24V"),
  capacity_ah: read("50 Ah", 0.9577, "50Ah"),
  energy_wh: read("1200 Wh", 0.94886, "1200Wh"),
  date_code: read("0322", 0.93902),
  serial_number: read("RM2450-0322-01187", 0.94517),
  certification_marks: read("CE", 0.94235),
  transport_test_marking: read("not_present", 0.93654, ""),
  assessed_condition: UNREAD,
};

/**
 * The vehicle pack's label with a voltage its catalog entry does not carry:
 * the part number resolves the entry exactly (Rule 2.18) and every field
 * reads cleanly, but the printed voltage is not the entry's within the
 * configured tolerance — a relabelled pack, a wrong match or a misprint.
 * Rule 2.35 routes it to review on that alone (T-52 `label_catalog_mismatch`).
 */
const MISMATCH: FieldAnswers = {
  ...CLEAN,
  voltage: read("400 V", 0.95211, "400V"),
};

const ANSWERS_BY_SCENARIO: Readonly<
  Record<Exclude<FixtureScenario, "fail">, FieldAnswers>
> = {
  clean: CLEAN,
  low: LOW,
  nomatch: NOMATCH,
  unreadable: UNREADABLE,
  manualcrop: CLEAN,
  scooter: SCOOTER,
  mismatch: MISMATCH,
};

/**
 * Answer only what was asked. A key that was not requested is returned unread,
 * never with a value — the schema refuses a value for an unrequested key as a
 * fabrication (EC-7), and the fixture is held to the same rule as any vendor.
 */
function answerRequested(
  answers: FieldAnswers,
  requestedFields: readonly LabelFieldKey[],
): FieldAnswers {
  const requested = new Set<LabelFieldKey>(requestedFields);
  const entries = LABEL_FIELD_KEYS.map(
    (key) => [key, requested.has(key) ? answers[key] : UNREAD] as const,
  );
  return Object.fromEntries(entries) as Record<LabelFieldKey, FieldAnswer>;
}

// --- the photo checks (b2-10; Rules 2.36, 2.37, 6.25) ------------------------------
//
// Keyed on the file name's last hyphen token, like the label read, and with the
// same rule for anything unrecognised: **an unknown file name proposes nothing
// and looks like the reference**, so every fixture image that existed before
// these checks keeps landing exactly where it did. The fingerprint is the one
// exception to keying on the name — it comes from the bytes (see below).

export const FIXTURE_PHOTO_CHECK_MODEL_IDENTIFIER = "fixture-photo-checker";
export const FIXTURE_PHOTO_CHECK_PROMPT_VERSION = "2026-11-10";

/** The token that keys each answer. Never rename a fixture image (STATE §6). */
export const DAMAGE_PROPOSAL_SCENARIOS = {
  /** `damage-swelling.png` — two suggestions: one in the damaged set, one cosmetic. */
  swelling: ["swelling", "surface_marking"],
} as const satisfies Readonly<Record<string, readonly ProposableFindingType[]>>;

/** `damage-unavailable.png` — the service cannot be reached (Rule 6.26). */
export const DAMAGE_PROPOSAL_FAILURE_TOKEN = "unavailable";

export const LABEL_LOOK_SCENARIOS = {
  /** `label-different.png` — reads as the clean label, looks different from its reference. */
  different: "looks_different",
  /** `label-uncomparable.png` — the model could not compare the two. */
  uncomparable: "cannot_compare",
} as const satisfies Readonly<Record<string, LabelLookModelOutcome>>;

/** `label-lookfail.png` — the look check's service cannot be reached. */
export const LABEL_LOOK_FAILURE_TOKEN = "lookfail";

function tokenOf(fileName: string | null): string {
  if (fileName === null) return "";
  const base = fileName.split(/[\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  return stem.split("-").pop()?.trim().toLowerCase() ?? "";
}

function hasKey<K extends string>(
  record: Readonly<Record<K, unknown>>,
  key: string,
): key is K {
  return Object.prototype.hasOwnProperty.call(record, key);
}

/** The scheme every fixture fingerprint carries. Configuration states closeness for it. */
export const FIXTURE_FINGERPRINT_SCHEME = "fixture64";

/**
 * The seeded copy target's label photo fingerprint — `src/data/mock/fixtures`
 * seeds a record's label photo with exactly this value, and a unit test holds
 * the two together.
 */
export const FIXTURE_COPY_TARGET_FINGERPRINT = "fixture64:9e3c5a1f7b2d4c80";

/**
 * `label-resaved.png` — a re-saved copy of the seeded target: two bits away
 * from it, so it is close without being the same fingerprint, and its bytes are
 * not the target's, so it is never the exact check's.
 */
export const FIXTURE_RESAVED_FINGERPRINT = "fixture64:9e3c5a1f7b2d4c83";
export const FINGERPRINT_RESAVED_TOKEN = "resaved";

/**
 * **From the bytes, never the file name** — many e2e uploads share
 * `label-clean.png`, each with its own unique `tEXt` chunk, and a fingerprint
 * from the name would make every one of them a copy of every other. The first
 * 64 bits of the SHA-256 of the stored bytes: a fixed function of the image,
 * so the same bytes always give the same fingerprint, and two different
 * uploads differ in about half their bits. The one scenario file is the
 * exception that lets a spec prove a look-alike.
 */
export function fixtureFingerprint(image: PhotoImage): string {
  if (tokenOf(image.fileName) === FINGERPRINT_RESAVED_TOKEN) {
    return FIXTURE_RESAVED_FINGERPRINT;
  }
  const digest = createHash("sha256").update(image.bytes).digest("hex");
  return `${FIXTURE_FINGERPRINT_SCHEME}:${digest.slice(0, 16)}`;
}

export const fixtureProvider: VisionProvider = {
  code: FIXTURE_PROVIDER_CODE,

  async proposeDamageFindings(
    image: PhotoImage,
  ): Promise<DamageProposalResult> {
    const token = tokenOf(image.fileName);
    if (token === DAMAGE_PROPOSAL_FAILURE_TOKEN) {
      throw new VisionProviderError(
        "unavailable",
        "The photo checker is unavailable.",
      );
    }
    return {
      schemaVersion: DAMAGE_PROPOSAL_SCHEMA_VERSION,
      findings: hasKey(DAMAGE_PROPOSAL_SCENARIOS, token)
        ? [...DAMAGE_PROPOSAL_SCENARIOS[token]]
        : [],
      providerCode: FIXTURE_PROVIDER_CODE,
      modelIdentifier: FIXTURE_PHOTO_CHECK_MODEL_IDENTIFIER,
      promptVersion: FIXTURE_PHOTO_CHECK_PROMPT_VERSION,
      usage: null,
    };
  },

  async compareLabelToReference(
    req: LabelLookRequest,
  ): Promise<LabelLookResult> {
    const token = tokenOf(req.photo.fileName);
    if (token === LABEL_LOOK_FAILURE_TOKEN) {
      throw new VisionProviderError(
        "unavailable",
        "The photo checker is unavailable.",
      );
    }
    return {
      schemaVersion: LABEL_LOOK_SCHEMA_VERSION,
      outcome: hasKey(LABEL_LOOK_SCENARIOS, token)
        ? LABEL_LOOK_SCENARIOS[token]
        : "looks_consistent",
      providerCode: FIXTURE_PROVIDER_CODE,
      modelIdentifier: FIXTURE_PHOTO_CHECK_MODEL_IDENTIFIER,
      promptVersion: FIXTURE_PHOTO_CHECK_PROMPT_VERSION,
      usage: null,
    };
  },

  async fingerprintPhoto(image: PhotoImage): Promise<string> {
    return fixtureFingerprint(image);
  },

  async detectLabelRegion(req: RegionRequest): Promise<RegionDetection | null> {
    if (scenarioForFileName(req.fileName) === "manualcrop") return null;
    return {
      box: scaleReferenceBox(req.width, req.height),
      confidence: REGION_CONFIDENCE,
    };
  },

  async extractLabelFields(
    req: ExtractionRequest,
  ): Promise<LabelExtractionResult> {
    const scenario = scenarioForFileName(req.fileName);
    if (scenario === "fail") {
      throw new VisionProviderError(
        "unavailable",
        "The label reader is unavailable.",
      );
    }

    const fields = answerRequested(
      ANSWERS_BY_SCENARIO[scenario],
      req.requestedFields,
    );
    return {
      schemaVersion: LABEL_EXTRACTION_SCHEMA_VERSION,
      fields,
      providerCode: FIXTURE_PROVIDER_CODE,
      modelIdentifier: FIXTURE_MODEL_IDENTIFIER,
      promptVersion: FIXTURE_PROMPT_VERSION,
      rawResponse: fields,
      usage: null,
    };
  },
};
