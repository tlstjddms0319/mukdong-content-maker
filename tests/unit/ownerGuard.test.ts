// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth }));

import { ownerApiError } from "@/features/auth/guard";
import { GET as getDraft, PATCH as updateDraft } from "@/app/api/drafts/route";
import { POST as publish } from "@/app/api/instagram/publish/route";

describe("owner server guard", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_SECRET", "test-auth-secret");
    vi.stubEnv("OWNER_PASSWORD_HASH", "test-hash");
    auth.mockReset().mockResolvedValue(null);
  });

  it("returns 503 without owner configuration, before checking session", async () => {
    vi.stubEnv("AUTH_SECRET", "");
    const denied = await ownerApiError();
    expect(denied?.status).toBe(503);
    expect(denied?.headers.get("Cache-Control")).toBe("no-store");
    expect(auth).not.toHaveBeenCalled();
  });

  it("returns 401 for anonymous private API requests", async () => {
    const denied = await ownerApiError();
    expect(denied?.status).toBe(401);
    expect(denied?.headers.get("Cache-Control")).toBe("no-store");
  });

  it("allows only an owner session", async () => {
    auth.mockResolvedValueOnce({ user: { id: "someone-else" } }).mockResolvedValueOnce({ user: { id: "owner" } });
    expect((await ownerApiError())?.status).toBe(401);
    expect(await ownerApiError()).toBeNull();
  });

  it("rejects direct draft and publish calls before request validation", async () => {
    const draft = await getDraft(new Request("http://localhost/api/drafts"));
    expect(draft.status).toBe(401);
    const planned=await updateDraft(new Request("http://localhost/api/drafts",{method:"PATCH",body:"not json"}));
    expect(planned.status).toBe(401);
    const result = await publish(new Request("http://localhost/api/instagram/publish", { method: "POST", body: "not json" }));
    expect(result.status).toBe(401);
  });

  it("places the owner guard at the start of every private route and page", () => {
    const routes = ["topics", "images/analyze", "images/plan", "images/generate", "copy", "media/upload", "drafts", "drafts/thumbnail", "instagram/publication", "settings", "instagram/connect", "instagram/connection", "instagram/status", "instagram/publish"];
    for (const route of routes) {
      const source = readFileSync(path.join(process.cwd(), "src/app/api", route, "route.ts"), "utf8");
      const handlers = source.split("\n").filter((line) => /^export async function (?:GET|POST|PUT|PATCH|DELETE)\(/.test(line));
      expect(handlers.length, route).toBeGreaterThan(0);
      for (const handler of handlers) expect(handler, route).toMatch(/\)\s*\{\s*const denied=await ownerApiError\(\); if\(denied\)return denied;/);
    }
    for (const page of ["page.tsx", "drafts/page.tsx", "settings/page.tsx"]) {
      const source = readFileSync(path.join(process.cwd(), "src/app", page), "utf8");
      expect(source, page).toMatch(/export default async function [^(]+\(\)\s*\{\s*await requireOwnerPage\(\);/);
    }
  });
});
