import { activeAdapterName, data } from "@/data";
import { activeVisionProviderCode } from "@/lib/vision";

// Never prerendered. The adapter and the label reader are both resolved from
// the environment of the process serving the request, which is the only place
// either fail-closed guard is useful.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    status: "ok",
    adapter: data.describe(),
    activeAdapterName,
    // The provider's selection code, never a vendor name (D-25): a production
    // health check reporting `fixture` is the vision-side page-someone alert.
    visionProvider: activeVisionProviderCode,
  });
}
