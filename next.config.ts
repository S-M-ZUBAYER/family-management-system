import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vinext also checks ordinary multipart POSTs through its action parser.
  // Permit the 25 MiB media limit plus multipart overhead; route limits remain.
  experimental: { serverActions: { bodySizeLimit: "26mb" } },
};

export default nextConfig;
