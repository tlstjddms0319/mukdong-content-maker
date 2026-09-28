import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {"/api/images/generate":["./assets/fonts/*"],"/api/images/compose":["./assets/fonts/*"]},
};

export default nextConfig;
