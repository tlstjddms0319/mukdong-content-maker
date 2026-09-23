// @vitest-environment node
import { scryptSync } from "node:crypto";
import { Auth, skipCSRFCheck, type AuthConfig } from "@auth/core";
import { NextRequest, type NextFetchEvent } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ownerAuthConfig } from "@/features/auth/authOptions";
import { proxy } from "@/proxy";

const authState = vi.hoisted(() => ({ session: null as unknown }));
vi.mock("@/auth", () => ({
  auth: (handler: (request: NextRequest & { auth: unknown }) => Response) =>
    async (request: NextRequest) => handler(Object.assign(request, { auth: authState.session })),
}));

const origin = "http://localhost:3000";
const secret = "test-only-owner-auth-secret-32-chars";
const start = new Date("2026-09-22T00:00:00.000Z");
const config: AuthConfig = { ...ownerAuthConfig, secret, trustHost: true, basePath: "/api/auth", skipCSRFCheck };

function sessionCookie(response: Response): string {
  const header = response.headers.getSetCookie().find((value) => value.startsWith("authjs.session-token="));
  expect(header).toBeDefined();
  return header!.split(";")[0];
}

async function ownerLogin(): Promise<string> {
  const response = await Auth(new Request(`${origin}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ password: "owner-password", callbackUrl: "/drafts" }),
  }), config);
  expect(response.status).toBe(302);
  return sessionCookie(response);
}

async function session(cookie: string): Promise<{ user?: { id?: string } } & Record<string, unknown>> {
  const response = await Auth(new Request(`${origin}/api/auth/session`, {
    headers: { cookie },
  }), config);
  return response.json();
}

describe("owner Auth.js session", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(start);
    const salt = Buffer.from("owner-session-test-salt");
    const digest = scryptSync("owner-password", salt, 64);
    vi.stubEnv("AUTH_SECRET", secret);
    vi.stubEnv("OWNER_PASSWORD_HASH", `scrypt:${salt.toString("base64url")}:${digest.toString("base64url")}`);
  });

  afterEach(() => {
    authState.session = null;
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("maps the verified owner identity into the session used by proxy", async () => {
    const cookie = await ownerLogin();
    authState.session = await session(cookie);
    expect((authState.session as { user?: { id?: string } }).user?.id).toBe("owner");
    const response = await proxy(new NextRequest(`${origin}/drafts`), {} as NextFetchEvent);
    expect(response?.status).toBe(200);
    expect(response?.headers.get("location")).toBeNull();
  });

  it("rejects the owner session after eight hours despite a refresh at seven hours", async () => {
    const originalCookie = await ownerLogin();
    vi.setSystemTime(new Date(start.getTime() + 7 * 60 * 60 * 1000));
    const refreshResponse = await Auth(new Request(`${origin}/api/auth/session`, {
      headers: { cookie: originalCookie },
    }), config);
    const refreshedSession = await refreshResponse.json();
    expect(refreshedSession.user?.name).toBe("관리자");
    expect(refreshedSession.expires).toBe(new Date(start.getTime() + 8 * 60 * 60 * 1000).toISOString());
    const refreshedCookie = sessionCookie(refreshResponse);

    vi.setSystemTime(new Date(start.getTime() + 8 * 60 * 60 * 1000));
    authState.session = await session(refreshedCookie);
    expect(authState.session).toBeNull();
    const response = await proxy(new NextRequest(`${origin}/drafts`), {} as NextFetchEvent);
    expect(response?.headers.get("location")).toBe(`${origin}/login?next=%2Fdrafts`);
  });
});
