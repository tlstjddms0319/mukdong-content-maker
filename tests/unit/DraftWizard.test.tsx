import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DraftWizard } from "@/components/wizard/DraftWizard";

describe("DraftWizard", () => {
  it("keeps the edited caption through final review", () => {
    render(<DraftWizard />);
    fireEvent.click(screen.getByRole("button", { name:"이미지 선택" }));
    fireEvent.click(screen.getByRole("button", { name:"AI 이미지 생성" }));
    fireEvent.click(screen.getAllByRole("button", { name:"이 이미지 사용" })[0]);
    fireEvent.click(screen.getByRole("button", { name:"문안 만들기" }));
    fireEvent.change(screen.getByLabelText("게시물 문안"), { target:{ value:"최종으로 편집한 문안" } });
    fireEvent.click(screen.getByRole("button", { name:"최종 화면 보기" }));
    expect(document.querySelector(".preserved-caption")).toHaveTextContent("최종으로 편집한 문안");
  });
});
