import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
});
