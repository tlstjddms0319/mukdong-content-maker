// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { isPublicException } from "@/features/auth/routes";
import { signMediaUrl } from "@/features/instagram/publicMedia";

const state = vi.hoisted(() => ({
  owner: false,
  readDraft: vi.fn(),
  saveConnection: vi.fn(async (value) => value),
  exchangeCode: vi.fn(async () => ({ accessToken: "token", expiresIn: 3600 })),
  getProfile: vi.fn(async () => ({ id: "ig-owner", username: "owner" })),
  publishContainer: vi.fn(),
}));

vi.mock("@/features/auth/guard", () => ({ ownerApiError: async () => state.owner ? null : NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "expected-state" }) }) }));
vi.mock("@/features/drafts/repository", () => ({ createDraftRepository: () => ({ readDraft: state.readDraft }) }));
vi.mock("@/features/instagram/repository", () => ({ createInstagramRepository: () => ({ saveConnection: state.saveConnection }) }));
vi.mock("@/features/instagram/metaClient", () => ({ exchangeInstagramCode: state.exchangeCode, getInstagramProfile: state.getProfile, instagramPublishingClient: { publishContainer: state.publishContainer } }));

import { GET as callback } from "@/app/api/instagram/callback/route";
import { GET as media } from "@/app/api/media/public/[draftId]/route";
import { GET as connect } from "@/app/api/instagram/connect/route";
import { POST as publish } from "@/app/api/instagram/publish/route";

describe("owner auth public exceptions", () => {
  beforeEach(() => {
    state.owner = false;
    for (const key of ["readDraft", "saveConnection", "exchangeCode", "getProfile", "publishContainer"] as const) state[key].mockClear();
    state.readDraft.mockResolvedValue(null);
    vi.stubEnv("MEDIA_SIGNING_SECRET", "test-media-secret");
    vi.stubEnv("INSTAGRAM_APP_ID", "app-id");
    vi.stubEnv("INSTAGRAM_APP_SECRET", "app-secret");
    vi.stubEnv("INSTAGRAM_REDIRECT_URI", "https://example.com/api/instagram/callback");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("matches only the exact OAuth callback and one signed-media path segment", () => {
    expect(isPublicException("/api/instagram/callback")).toBe(true);
    expect(isPublicException("/api/media/public/draft-id")).toBe(true);
    expect(isPublicException("/api/instagram/connect")).toBe(false);
    expect(isPublicException("/api/media/public/draft-id/extra")).toBe(false);
  });

  it("lets a valid OAuth state complete without app login, but rejects a mismatched state before exchange", async () => {
    const good = await callback(new Request("http://localhost/api/instagram/callback?code=code&state=expected-state"));
    expect(new URL(good.headers.get("location")!).searchParams.get("instagram")).toBe("connected");
    expect(state.exchangeCode).toHaveBeenCalledTimes(1);
    expect(state.saveConnection).toHaveBeenCalledTimes(1);
    const bad = await callback(new Request("http://localhost/api/instagram/callback?code=code&state=wrong-state"));
    expect(new URL(bad.headers.get("location")!).searchParams.get("instagram")).toBe("error");
    expect(state.exchangeCode).toHaveBeenCalledTimes(1);
  });

  it("checks signed media before reading a draft and refuses altered or expired links", async () => {
    const draftId = "11111111-1111-4111-8111-111111111111";
    const url = new URL(signMediaUrl({ draftId, expiresAt: Math.floor(Date.now() / 1000) + 600, baseUrl: "https://example.com", secret: "test-media-secret" }));
    expect((await media(new Request(url), { params: Promise.resolve({ draftId }) })).status).toBe(404);
    expect(state.readDraft).toHaveBeenCalledTimes(1);
    url.searchParams.set("sig", "altered");
    expect((await media(new Request(url), { params: Promise.resolve({ draftId }) })).status).toBe(403);
    const expired = signMediaUrl({ draftId, expiresAt: Math.floor(Date.now() / 1000) - 1, baseUrl: "https://example.com", secret: "test-media-secret" });
    expect((await media(new Request(expired), { params: Promise.resolve({ draftId }) })).status).toBe(403);
    expect(state.readDraft).toHaveBeenCalledTimes(1);
  });

  it("blocks anonymous connect and publish, and requires explicit approval after login", async () => {
    expect((await connect()).status).toBe(401);
    const request = () => new Request("http://localhost/api/instagram/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draftId: "11111111-1111-4111-8111-111111111111", approved: false }) });
    expect((await publish(request())).status).toBe(401);
    state.owner = true;
    expect((await publish(request())).status).toBe(400);
    expect(state.publishContainer).not.toHaveBeenCalled();
  });
});
