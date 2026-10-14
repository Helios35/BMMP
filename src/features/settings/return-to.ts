/**
 * E-11's round trip — **Set it now** → `/settings/organization` → back to the
 * shipment draft the person left (`UX_SPEC.md` E-11; `SITE_ARCHITECTURE.md`
 * E-11).
 *
 * The way back travels as `?returnTo=` and is read back **only** if it is one
 * of the two places a draft lives: step 3 of `/shipments/new` for a named
 * shipment, or that shipment's own page. Anything else — another host, another
 * route, a scheme, a doubled slash — reads as no way back at all. An open
 * redirect on the page that holds the 24-hour number is not a convenience.
 *
 * Pure: strings in, strings out.
 */

const ID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

const STEP_THREE = new RegExp(`^/shipments/new\\?shipment=(${ID})&step=3$`);
const SHIPMENT_PAGE = new RegExp(`^/shipments/(${ID})$`);

export const RETURN_TO_PARAM = "returnTo";

/** Where **Set it now** sends a person, carrying the draft they came from. */
export function emergencyContactSettingsHref(returnTo: string): string {
  return `/settings/organization?${RETURN_TO_PARAM}=${encodeURIComponent(returnTo)}#emergency-contact`;
}

/** Step 3 of a named shipment — the draft P6 (and P1) builds on. */
export function shipmentStepThreeHref(shipmentId: string): string {
  return `/shipments/new?shipment=${shipmentId}&step=3`;
}

/**
 * The way back, if `value` is one — or `null`.
 *
 * `searchParams` hands a repeated key over as an array; a repeated `returnTo`
 * is not a way back either.
 */
export function readShipmentReturn(
  value: string | readonly string[] | undefined,
): string | null {
  if (typeof value !== "string") return null;
  const path = value.trim();
  if (STEP_THREE.test(path) || SHIPMENT_PAGE.test(path)) return path;
  return null;
}
