import { scryptSync } from "node:crypto";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const password = "test-owner-password";
const salt = Buffer.from("test-owner-salt-2026");
const hash = `scrypt:${salt.toString("base64url")}:${scryptSync(password, salt, 64).toString("base64url")}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: "http://127.0.0.1:3001/login",
    reuseExistingServer: false,
    env: {
      AUTH_URL: "http://127.0.0.1:3001",
      AUTH_SECRET: "test-only-auth-secret-32-chars-minimum",
      OWNER_PASSWORD_HASH: hash,
      DATA_DIR: path.join(process.cwd(), ".superpowers/sdd/2026-09-22-owner-access/e2e-data"),
    },
  },
  use: { baseURL: "http://127.0.0.1:3001" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
