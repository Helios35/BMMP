import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

import type { RequestContext } from "@/data/contracts/context";
import type {
  ShipmentTransportDetails,
  StorageWriteAttribution,
} from "@/data/contracts";
import { mockAdapter, mockStore } from "@/data/mock";
import * as ID from "@/data/mock/fixtures/ids";
import type { ResolvedRule } from "@/domain/rules/resolve";
import { ACCUMULATION_RULE_KEY } from "@/domain/storage/placement";
import type { Uuid } from "@/types/common";
import type { Container } from "@/types/storage";

/**
 * What the document-engine suites share — in-memory test data on a freshly
 * reset store, never an edited fixture. Every "now" is fixed.
 */

export const AT = "2026-10-09T17:00:00.000Z";
export const LATER = "2026-10-12T15:30:00.000Z";
const SOUND_START_DAY = "2026-07-28";

export const NO_ATTRIBUTION: StorageWriteAttribution = {
  requestId: null,
  ipAddress: null,
  userAgent: null,
};

export function ctx(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    userId: ID.USER.danaHandler,
    organizationId: ID.ORG.cascade,
    role: "compliance_handler",
    isPlatformAdmin: false,
    correlationId: "test-corr-documents-0001",
    ...overrides,
  };
}

export const HANDLER = ctx();
export const MANAGER = ctx({
  userId: ID.USER.martaManager,
  role: "facility_manager",
});

export function transport(
  overrides: Partial<ShipmentTransportDetails> = {},
): ShipmentTransportDetails {
  return {
    transportMode: "ground",
    destinationFacilityName: "Basin Materials Recovery",
    destinationAddress: {
      line1: "77 Terminal Road",
      line2: null,
      city: "Moses Lake",
      region: "WA",
      postalCode: "98837",
      country: "US",
    },
    destinationIdentifier: "WA-RECV-000318",
    carrierName: "Coleridge Hauling",
    transporterIdentifier: null,
    ...overrides,
  };
}

/** Cascade's number, verified by a person inside its interval. In memory only. */
export function verifyCascadeNumber(): void {
  const s = mockStore();
  s.organizations.replaceAll(
    s.organizations.all().map((org) =>
      org.id === ID.ORG.cascade
        ? {
            ...org,
            emergencyVerifiedAt: "2026-09-01T16:00:00.000Z",
            emergencyVerifiedBy: ID.USER.martaManager,
          }
        : org,
    ),
  );
}

async function accumulationRuleOn(day: string): Promise<ResolvedRule> {
  const resolution = await mockAdapter.ruleVersions.resolve(HANDLER, {
    ruleKeys: [ACCUMULATION_RULE_KEY],
    jurisdictionId: ID.JURISDICTION.washington,
    asOf: day,
  });
  if (!resolution.ok) throw new Error(`no accumulation rule on ${day}`);
  const rule = resolution.resolved.rules[ACCUMULATION_RULE_KEY];
  if (rule === undefined) throw new Error("rule missing");
  return rule;
}

/** A new, unlabelled container holding sound-drum packs, its start carried from the drum. */
export async function newContainerHolding(
  recordIds: readonly Uuid[],
  location: string,
): Promise<Container> {
  const fresh = await mockAdapter.containers.create(HANDLER, {
    containerType: "light_category_sound",
    lotId: null,
    shipmentId: null,
    capacityKg: "900.000",
    capacityVolumeM3: null,
    siteAddress: null,
    siteTimeZone: "America/Los_Angeles",
    storageLocation: location,
    status: "open",
    sealedAt: null,
    closedAt: null,
  });
  await mockAdapter.containers.moveContents(HANDLER, {
    operation: "move",
    sourceContainerId: ID.CONTAINER.soundDrum,
    targetContainerId: fresh.id,
    batteryRecordIds: recordIds,
    at: AT,
    accumulationRule: await accumulationRuleOn(SOUND_START_DAY),
    attribution: NO_ATTRIBUTION,
  });
  return mockStore().containers.getOrThrow(HANDLER, fresh.id);
}

export function auditRows(eventType: string, entityId?: Uuid) {
  return mockStore()
    .auditEvents.all()
    .filter(
      (row) =>
        row.eventType === eventType &&
        (entityId === undefined || row.entityId === entityId),
    );
}

/** The bytes stored behind a render, straight from the object store. */
export function storedBytes(path: string): Uint8Array {
  const stored = mockStore().objects.get(`documents:${path}`);
  if (stored === undefined) throw new Error(`no bytes at ${path}`);
  return stored.bytes;
}

/** Every page's text, joined — what a person reading the PDF reads. */
export async function pdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocument({
    data: new Uint8Array(bytes),
    verbosity: 0,
  }).promise;
  const pages: string[] = [];
  for (let index = 1; index <= pdf.numPages; index += 1) {
    const page = await pdf.getPage(index);
    const content = await page.getTextContent();
    pages.push(
      content.items.map((item) => ("str" in item ? item.str : "")).join(" "),
    );
  }
  await pdf.loadingTask.destroy();
  return pages.join("\n");
}
