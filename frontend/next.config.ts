import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Mol* ships untranspiled ESM under lib/; Next must process it.
  transpilePackages: ["molstar"],
};

export default nextConfig;
