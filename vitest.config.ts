import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.{test,spec}.{ts,tsx}"],
    // 혼자 1~2초인 이미지 합성·화면 테스트가 전체 실행(파일 145개 동시)에서는 CPU를 나눠 써 5초 기본 제한을 넘기곤 했다.
    testTimeout: 15_000,
  },
});
