import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WizardShell } from "@/components/wizard/WizardShell";
import { addLibraryPhoto, buildPhotoCarousel, ensureGeneration, resetGenerationStore } from "@/features/images/generationStore";

describe("WizardShell", () => {
  afterEach(()=>{vi.unstubAllGlobals();resetGenerationStore();});

  it("shows a badge while a post keeps being made on another screen", () => {
    vi.stubGlobal("fetch",vi.fn(()=>new Promise(()=>{})));
    ensureGeneration("draft-1",{topic:"홍어",slideCount:3});
    addLibraryPhoto({id:"p1",preview:"data:image/jpeg;base64,AAAA",name:"사진"});
    void buildPhotoCarousel();
    render(<WizardShell step="topic" section="drafts"><h1>내 게시물</h1></WizardShell>);
    expect(screen.getByText("만드는 중")).toBeInTheDocument();
    expect(screen.getByRole("link",{name:"만들기"})).toBeInTheDocument();
  });

  it("shows three simple steps and the active step", () => {
    render(<WizardShell step="image"><p>만들기 화면</p></WizardShell>);
    expect(screen.getByText("만들기 화면")).toBeInTheDocument();
    const steps=screen.getByLabelText("만드는 순서");
    expect(steps).toHaveTextContent("1 무엇을 올릴까요");
    expect(steps).toHaveTextContent("2 만들기");
    expect(steps).toHaveTextContent("3 확인하고 올리기");
    expect(steps).not.toHaveTextContent("문안");
    // 좁은 휴대폰에서는 짧은 이름(1 주제 · 2 만들기 · 3 올리기)이 보이고, 버튼 이름은 폭과 상관없이 긴 이름이다.
    expect([...steps.querySelectorAll(".step-short")].map(item=>item.textContent)).toEqual(["1 주제","2 만들기","3 올리기"]);
    expect([...steps.querySelectorAll(".step-full")].map(item=>item.textContent)).toEqual(["1 무엇을 올릴까요","2 만들기","3 확인하고 올리기"]);
    for(const name of ["1 무엇을 올릴까요","2 만들기","3 확인하고 올리기"])expect(screen.getByRole("button",{name})).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "주요 메뉴" })).toBeVisible();
  });

  it("allows completed steps and blocks unavailable forward steps", () => {
    const move=vi.fn();
    render(<WizardShell step="image" canVisit={["topic","image"]} onStepChange={move}><p>만들기</p></WizardShell>);
    fireEvent.click(screen.getByRole("button",{name:"1 무엇을 올릴까요"}));
    expect(move).toHaveBeenCalledWith("topic");
    expect(screen.getByRole("button",{name:"3 확인하고 올리기"})).toBeDisabled();
  });

  it("keeps three menus in sight and the rest under 더보기", () => {
    render(<WizardShell step="topic" section="drafts"><h1>내 게시물</h1></WizardShell>);
    const nav=screen.getByRole("navigation",{name:"주요 메뉴"});
    expect(screen.getByRole("link",{name:"내 게시물"})).toHaveAttribute("aria-current","page");
    for(const label of ["만들기","내 게시물","설정"])expect(screen.getByRole("link",{name:label})).toBeVisible();
    // 가끔 쓰는 화면은 접힌 더보기 안에 있다.
    const more=screen.getByText("더보기").closest("details")!;
    expect(more).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("더보기"));
    for(const [label,href] of [["한 달 계획","/plan"],["콘텐츠 자료","/library"],["이미지 모음","/images"],["도움말","/help"]]){const link=screen.getByRole("link",{name:label});expect(link).toHaveAttribute("href",href);expect(more).toContainElement(link);}
    expect(nav).not.toHaveTextContent("이미지 제작실");
    expect(screen.queryByLabelText("만드는 순서")).not.toBeInTheDocument();
  });

  it("marks auxiliary pages current inside 더보기 without creation steps", () => {
    for (const [section, label] of [["images", "이미지 모음"], ["library", "콘텐츠 자료"], ["help", "도움말"], ["plan", "한 달 계획"]] as const) {
      const { unmount } = render(<WizardShell step="topic" section={section}><h1>{label}</h1></WizardShell>);
      fireEvent.click(screen.getByText("더보기"));
      expect(screen.getByRole("link", { name: label })).toHaveAttribute("aria-current", "page");
      expect(screen.getByText("더보기")).toHaveAttribute("aria-current","location");
      expect(screen.queryByLabelText("만드는 순서")).not.toBeInTheDocument();
      unmount();
    }
  });
});
