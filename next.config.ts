import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The PDF renderer runs on the server only (TECHNICAL_SPEC.md §8.1). Kept
  // external so it loads with its own React reconciler from node_modules
  // rather than through the server-component bundle, and never reaches a
  // client bundle.
  serverExternalPackages: ["@react-pdf/renderer"],
  // The fonts every document is set in are files committed to the repo and
  // read from disk at render time (§8.1); a deployment must carry them.
  outputFileTracingIncludes: {
    "/**": ["./src/lib/pdf/fonts/**"],
  },
};

export default nextConfig;
