import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { DEFAULT_SETTINGS } from "@/features/settings/defaults";

describe("SettingsForm", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("shows safe defaults and restores them", () => {
    const save = vi.fn(); render(<SettingsForm onSave={save}/>);
    expect(screen.getByLabelText("이미지 비율")).toHaveValue("4:5");
    expect(screen.getByLabelText("문안 AI")).toHaveValue("gemini");
    expect(screen.getByLabelText("이미지 AI")).toHaveValue("automatic");
    expect(screen.getByRole("option", { name:"자동 (Cloudflare 우선)" })).toBeInTheDocument();
    expect(screen.getByText("무료 할당량을 먼저 사용해요. 계정 요금제에 따라 초과 사용은 과금될 수 있어요.")).toBeInTheDocument();
    expect(screen.getByLabelText("캐러셀 장수")).toHaveValue("5");
    expect(screen.getByRole("option", { name:"5 (권장)" })).toBeInTheDocument();
    expect(screen.queryByDisplayValue(/sk-/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("이미지 비율"), { target:{ value:"1:1" } });
    fireEvent.click(screen.getByRole("button", { name:"권장값으로 되돌리기" }));
    expect(screen.getByLabelText("이미지 비율")).toHaveValue("4:5");
  });

  it("saves validated defaults through the settings API", async () => {
    const request = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", request);
    render(<SettingsForm />);
    fireEvent.click(screen.getByRole("button", { name:"설정 저장" }));
    expect(await screen.findByRole("status")).toHaveTextContent("저장했어요.");
    expect(request).toHaveBeenCalledWith("/api/settings", expect.objectContaining({ method:"PUT" }));
  });

  it("starts with previously saved settings", () => {
    render(<SettingsForm initialSettings={{ ...DEFAULT_SETTINGS, imageAspectRatio:"1:1", copyLength:"detailed" }} />);
    expect(screen.getByLabelText("이미지 비율")).toHaveValue("1:1");
    expect(screen.getByLabelText("문안 길이")).toHaveValue("detailed");
  });

  it("shows Cloudflare and OpenAI connection status without exposing keys", () => {
    render(<SettingsForm connections={{gemini:true,cloudflare:true,openai:false}} />);
    expect(screen.getByText("Cloudflare 이미지 연결됨")).toBeInTheDocument();
    expect(screen.getByText("OpenAI 키 필요")).toBeInTheDocument();
    expect(screen.queryByText(/token-123|sk-/)).not.toBeInTheDocument();
  });
});
