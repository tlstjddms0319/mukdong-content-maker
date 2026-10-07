import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 로컬 AUTH_URL이 127.0.0.1일 때도 개발 서버 자동 새로고침(HMR)이 막히지 않게 한다. 개발 서버에만 적용된다.
  allowedDevOrigins: ["127.0.0.1"],
  outputFileTracingIncludes: {"/api/images/generate":["./assets/fonts/*","./assets/design/**/*"],"/api/images/compose":["./assets/fonts/*","./assets/design/**/*"],"/api/images/store-card":["./assets/fonts/*","./assets/design/**/*","./assets/store/*"],"/api/store/poster":["./assets/store/*"]},
};

export default nextConfig;
