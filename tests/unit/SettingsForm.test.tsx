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
    expect(screen.getByRole("option", { name:"자동 (Higgsfield → Cloudflare → OpenAI)" })).toBeInTheDocument();
    expect(screen.getByText(/제공자 요금제에 따라 비용이 들 수 있어요/)).toBeInTheDocument();
    expect(screen.getByLabelText("캐러셀 장수")).toHaveValue("5");
    expect(screen.getByRole("option", { name:"5 (권장)" })).toBeInTheDocument();
    expect(screen.queryByDisplayValue(/sk-/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("캐러셀 장수"), { target:{ value:"3" } });
    fireEvent.click(screen.getByRole("button", { name:"권장값으로 되돌리기" }));
    expect(screen.getByLabelText("캐러셀 장수")).toHaveValue("5");
  });

  it("shows only the brand kit and keeps technical settings inside a closed 관리자용 설정", () => {
    const onSave=vi.fn();
    render(<SettingsForm onSave={onSave} adminCards={<p>저장소 점검 카드</p>}/>);
    const admin=screen.getByText("관리자용 설정").closest("details")!;
    expect(admin).not.toHaveAttribute("open");
    for(const label of ["문안 AI","이미지 AI","OpenAI 이미지 품질","문안 길이","캐러셀 장수","원격 누끼 사용"])expect(admin).toContainElement(screen.getByLabelText(label));
    expect(admin).toContainElement(screen.getByText("저장소 점검 카드"));
    expect(admin).toContainElement(screen.getByText(/Gemini (키 설정됨|키 필요)/));
    // 브랜드 키트(계정·로고)는 접지 않고 보인다. 계정만 고쳐 저장해도 다른 설정은 그대로 간다.
    const handle=screen.getByLabelText("Instagram 계정");
    expect(admin).not.toContainElement(handle);
    fireEvent.change(handle,{target:{value:"@mukdong_hongeo"}});
    fireEvent.click(screen.getByRole("button",{name:"계정 저장"}));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({brandHandle:"@mukdong_hongeo",textAiProvider:"automatic",carouselSlideCount:5}));
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
    // 저장만 되고 결과에 쓰이지 않던 "추후 적용할 옵션" 칸은 없앴다(사장님 화면을 줄이기).
    expect(screen.queryByText(/추후 적용할 옵션/)).not.toBeInTheDocument();
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

  it("keeps remote cutout off by default and saves the toggle with a monthly budget", () => {
    const onSave=vi.fn();
    render(<SettingsForm onSave={onSave} connections={{gemini:false,groq:false,cloudflare:false,openai:false,higgsfield:true}}/>);
    expect(screen.getByText(/누끼가 어려운 사진을 Higgsfield로 배경 제거합니다/)).toBeInTheDocument();
    expect(screen.getByLabelText("원격 누끼 사용")).not.toBeChecked();
    expect(screen.getByLabelText("원격 누끼 월 예산")).toBeDisabled();
    expect(screen.getByLabelText("원격 누끼 월 예산")).toHaveValue(20);
    fireEvent.click(screen.getByLabelText("원격 누끼 사용"));
    fireEvent.change(screen.getByLabelText("원격 누끼 월 예산"),{target:{value:"500"}});
    expect(screen.getByLabelText("원격 누끼 월 예산")).toHaveValue(200);
    fireEvent.change(screen.getByLabelText("원격 누끼 월 예산"),{target:{value:"8"}});
    fireEvent.click(screen.getByRole("button",{name:"설정 저장"}));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({remoteCutout:true,remoteCutoutMonthlyCredits:8}));
  });

  it("saves the chosen text provider", () => {
    const onSave=vi.fn();
    render(<SettingsForm onSave={onSave}/>);
    fireEvent.change(screen.getByLabelText("문안 AI"), { target:{ value:"groq" } });
    fireEvent.click(screen.getByRole("button", { name:"설정 저장" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ textAiProvider:"groq" }));
  });
});
