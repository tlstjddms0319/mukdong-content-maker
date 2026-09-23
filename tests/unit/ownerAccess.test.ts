import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { NextRequest, type NextFetchEvent } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isPublicException, safeReturnPath } from "@/features/auth/routes";
import { proxy } from "@/proxy";
import LoginPage from "@/app/login/page";
import { WizardShell } from "@/components/wizard/WizardShell";

const authState = vi.hoisted(() => ({ session: null as unknown }));
vi.mock("@/auth", () => ({
  auth: (handler: (request: NextRequest & { auth: unknown }) => Response) =>
    async (request: NextRequest) => handler(Object.assign(request, { auth: authState.session })),
}));
vi.mock("next-auth", () => ({ AuthError: class AuthError extends Error {} }));

describe("owner access", () => {
  beforeEach(() => {
    authState.session = null;
  });
  afterEach(() => vi.unstubAllEnvs());

  it("returns only to a local path after login", () => {
    expect(safeReturnPath("/drafts")).toBe("/drafts");
    expect(safeReturnPath("//evil.example")).toBe("/");
    expect(safeReturnPath("https://evil.example")).toBe("/");
    expect(safeReturnPath("/\\evil.example")).toBe("/");
    expect(safeReturnPath("/\n/evil.example")).toBe("/");
    expect(safeReturnPath(null)).toBe("/");
  });

  it("only exempts the exact OAuth callback and one-segment signed media path", () => {
    expect(isPublicException("/api/instagram/callback")).toBe(true);
    expect(isPublicException("/api/media/public/draft-id")).toBe(true);
    expect(isPublicException("/api/media/public/draft-id/other")).toBe(false);
    expect(isPublicException("/api/instagram/publish")).toBe(false);
  });

  it("redirects an anonymous protected page to login with its local return path", async () => {
    vi.stubEnv("AUTH_SECRET", "test-secret");
    vi.stubEnv("OWNER_PASSWORD_HASH", "test-hash");
    const response = await proxy(new NextRequest("http://localhost:3000/drafts?page=2"), {} as NextFetchEvent);
    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toBe("http://localhost:3000/login?next=%2Fdrafts%3Fpage%3D2");
  });

  it("allows an authenticated owner through the protected page proxy", async () => {
    vi.stubEnv("AUTH_SECRET", "test-secret");
    vi.stubEnv("OWNER_PASSWORD_HASH", "test-hash");
    authState.session = { user: { id: "owner" } };
    const response = await proxy(new NextRequest("http://localhost:3000/drafts"), {} as NextFetchEvent);
    expect(response?.status).toBe(200);
    expect(response?.headers.get("location")).toBeNull();
  });

  it("keeps the login page reachable and gives setup guidance when configuration is missing", async () => {
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("OWNER_PASSWORD_HASH", "");
    const page = await LoginPage({ searchParams: Promise.resolve({}) });
    render(page);
    expect(screen.getByRole("heading", { name: "관리자 로그인" })).toBeInTheDocument();
    expect(screen.getByText(/설정이 필요/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "로그인" })).not.toBeInTheDocument();
  });

  it("offers logout from the application shell", () => {
    render(WizardShell({ step: "topic", children: createElement("p", null, "초안") }));
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeInTheDocument();
  });
});
