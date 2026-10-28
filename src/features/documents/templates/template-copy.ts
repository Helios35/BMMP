/**
 * The captions the document templates print beside payload values.
 *
 * **Captions only.** No regulatory phrase, emergency text, certification
 * statement, citation or artwork is written here or anywhere under
 * `templates/` (Rules 1.23, 5.21): those are rule-version payloads, and the
 * templates print them from the payload, verbatim. These are the words that
 * name a field, the same words the on-screen pages use.
 */

export const CAPTIONS = {
  shipper: "Shipper",
  consignee: "Consignee",
  carrier: "Carrier",
  transportMode: "Transport mode",
  basicDescription: "Basic description",
  packages: "Packages",
  totalQuantity: "Total quantity",
  records: "Records",
  emergencyPhone: "24-hour emergency contact",
  emergencyInformation: "Emergency response information",
  certification: "Shipper certification",
  signature: "Signature",
  signedOn: "Date",
  issuedAt: "Issued",
  draftPreparedAt: "Draft prepared",
  accumulationStart: "Accumulation start date",
  siteTime: "Site time",
  contents: "Contents",
  container: "Container",
  handler: "Handler",
  scanToOpen: "Scan to open this container's record",
  ddrShipment: "Shipment",
  ddrRecords: "Records on the damaged, defective or recalled path",
  ddrRecord: "Record",
  ddrChemistry: "Chemistry",
  ddrFlags: "DDR flags",
  ddrFindings: "Confirmed findings",
  ddrAssessedBy: "Confirmed by",
  ddrContainer: "Quarantine container",
  ddrMarking: "Marking text",
  ddrPackaging: "Packaging",
  ddrPackingLevel: "Packing level",
  ddrMarkingHeight: "Marking minimum height",
  ddrAir: "Air transport",
  ddrNone: "None",
  documentId: "Document",
  verificationCode: "Verification code",
  page: "Page",
  pageOf: "of",
} as const;
