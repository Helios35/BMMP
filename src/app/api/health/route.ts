import { activeAdapterName, data } from "@/data";

// Never prerendered. The adapter is resolved from the environment of the process
// serving the request, which is the only place the fail-closed guard is useful.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    status: "ok",
    adapter: data.describe(),
    activeAdapterName,
  });
}
