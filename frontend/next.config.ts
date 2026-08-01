import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Mol* ships untranspiled ESM under lib/; Next must process it.
  transpilePackages: ["molstar"],

  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Mol*'s viewer entry reaches its MP4-export extension through
      // apps/viewer/app -> options -> extensions -> mp4-export -> h264-mp4-encoder,
      // an emscripten build that calls require("fs"). There is no `fs` in a browser
      // bundle, so webpack fails the build even though nothing here exports video.
      //
      // Resolving `fs` to false hands webpack an empty module for it. That is safe
      // precisely because the code path is never taken: the viewer is loaded through
      // next/dynamic with ssr:false and we never enable MP4 export. Stubbing the
      // import is what lets the rest of the extension graph resolve.
      config.resolve = config.resolve ?? {};
      config.resolve.fallback = { ...config.resolve.fallback, fs: false };
    }
    return config;
  },
};

export default nextConfig;
