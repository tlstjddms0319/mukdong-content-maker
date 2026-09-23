import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WizardShell } from "@/components/wizard/WizardShell";

describe("WizardShell", () => {
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
});
