import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WizardShell } from "@/components/wizard/WizardShell";
import { ensureGeneration, resetGenerationStore, startPlan } from "@/features/images/generationStore";

describe("WizardShell", () => {
  afterEach(()=>{vi.unstubAllGlobals();resetGenerationStore();});

  it("shows a badge while an image generation keeps running on another screen", () => {
    vi.stubGlobal("fetch",vi.fn(()=>new Promise(()=>{})));
    ensureGeneration("draft-1",{topic:"홍어",slideCount:3});
    void startPlan();
    render(<WizardShell step="topic" section="drafts"><h1>내 초안</h1></WizardShell>);
    expect(screen.getByText("이미지 생성 중")).toBeInTheDocument();
    expect(screen.getByRole("link",{name:"만들기"})).toBeInTheDocument();
  });

  it("shows four simple steps and the active step", () => {
    render(
      <WizardShell step="image">
        <p>이미지 선택</p>
      </WizardShell>,
    );

    expect(screen.getByText("이미지 선택")).toBeInTheDocument();
    expect(screen.getByLabelText("제작 단계")).toHaveTextContent("2 이미지");
    expect(screen.getByRole("navigation", { name: "주요 메뉴" })).toBeVisible();
  });

  it("allows completed steps and blocks unavailable forward steps", () => {
    const move=vi.fn();
    render(<WizardShell step="image" canVisit={["topic","image"]} onStepChange={move}><p>이미지</p></WizardShell>);
    fireEvent.click(screen.getByRole("button",{name:"1 주제"}));
    expect(move).toHaveBeenCalledWith("topic");
    expect(screen.getByRole("button",{name:"3 문안"})).toBeDisabled();
  });

  it("marks the drafts menu as current and hides creation steps on the drafts screen", () => {
    render(<WizardShell step="topic" section="drafts"><h1>내 초안</h1></WizardShell>);
    expect(screen.getByRole("link",{name:"내 초안"})).toHaveAttribute("aria-current","page");
    expect(screen.queryByLabelText("제작 단계")).not.toBeInTheDocument();
  });

  it("marks auxiliary pages current without creation steps", () => {
    for (const [section, label] of [["images", "이미지 제작실"], ["library", "콘텐츠 자료"], ["help", "도움말"]] as const) {
      const { unmount } = render(<WizardShell step="topic" section={section}><h1>{label}</h1></WizardShell>);
      expect(screen.getByRole("link", { name: label })).toHaveAttribute("aria-current", "page");
      expect(screen.queryByLabelText("제작 단계")).not.toBeInTheDocument();
      unmount();
    }
  });
});
