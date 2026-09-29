import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { DEFAULT_SETTINGS } from "@/features/settings/defaults";

describe("SettingsForm", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("shows safe defaults and restores them", () => {
    const save = vi.fn(); render(<SettingsForm onSave={save}/>);
    expect(screen.queryByLabelText("이미지 비율")).not.toBeInTheDocument();
    expect(screen.getByLabelText("문안 AI")).toHaveValue("automatic");
    expect(screen.getByRole("option", { name:"자동 (Gemini → Groq → Cloudflare)" })).toBeInTheDocument();
    expect(screen.getByLabelText("이미지 AI")).toHaveValue("automatic");
    expect(screen.getByRole("option", { name:"자동 (Cloudflare 우선)" })).toBeInTheDocument();
    expect(screen.getByText(/제공자 요금제에 따라 비용이 들 수 있어요/)).toBeInTheDocument();
    expect(screen.getByLabelText("캐러셀 장수")).toHaveValue("5");
    expect(screen.getByRole("option", { name:"5 (권장)" })).toBeInTheDocument();
    expect(screen.queryByDisplayValue(/sk-/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("캐러셀 장수"), { target:{ value:"3" } });
    fireEvent.click(screen.getByRole("button", { name:"권장값으로 되돌리기" }));
    expect(screen.getByLabelText("캐러셀 장수")).toHaveValue("5");
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
    expect(screen.queryByLabelText("이미지 비율")).not.toBeInTheDocument();
    expect(screen.getByText(/추후 적용할 옵션/)).toBeInTheDocument();
  });

  it("preserves inactive saved values when restoring active defaults", async () => {
    const onSave=vi.fn();
    render(<SettingsForm initialSettings={{...DEFAULT_SETTINGS,imageAspectRatio:"1:1",copyLength:"detailed",carouselSlideCount:3}} onSave={onSave}/>);
    fireEvent.click(screen.getByRole("button",{name:"권장값으로 되돌리기"}));
    fireEvent.click(screen.getByRole("button",{name:"설정 저장"}));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({carouselSlideCount:5,imageAiProvider:"automatic",imageAspectRatio:"1:1",copyLength:"medium",imageQuality:"medium",textAiProvider:"automatic"}));
  });

  it("shows every AI connection status without exposing keys", () => {
    render(<SettingsForm connections={{gemini:true,groq:false,cloudflare:true,openai:false}} />);
    expect(screen.getByText("Gemini 키 설정됨")).toBeInTheDocument();
    expect(screen.getByText("Groq 키 필요")).toBeInTheDocument();
    expect(screen.getByText("Cloudflare 키 설정됨")).toBeInTheDocument();
    expect(screen.getByText("OpenAI 키 필요")).toBeInTheDocument();
    expect(screen.queryByText(/token-123|sk-|gsk_/)).not.toBeInTheDocument();
  });

  it("saves the chosen text provider", () => {
    const onSave=vi.fn();
    render(<SettingsForm onSave={onSave}/>);
    fireEvent.change(screen.getByLabelText("문안 AI"), { target:{ value:"groq" } });
    fireEvent.click(screen.getByRole("button", { name:"설정 저장" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ textAiProvider:"groq" }));
  });
});
