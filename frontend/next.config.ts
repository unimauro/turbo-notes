import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone server bundle for a small, self-contained Docker image.
  output: "standalone",
  // Pin the workspace root: there are sibling lockfiles on dev machines and
  // in CI checkouts, and Turbopack would otherwise guess the wrong root.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
