import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionExpiryNotice } from "@/components/states/SessionExpiryNotice";

describe("SessionExpiryNotice", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("shows a login notice when an app API answers 401, and stays quiet otherwise", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response("{}", { status: url.includes("/api/drafts") ? 401 : 200 })));
    const { unmount } = render(<SessionExpiryNotice />);
    await window.fetch("/api/topics");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await window.fetch("/api/drafts");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("로그인이 만료됐어요"));
    expect(screen.getByRole("link", { name: "새 탭에서 로그인" })).toHaveAttribute("target", "_blank");
    unmount();
  });
});
