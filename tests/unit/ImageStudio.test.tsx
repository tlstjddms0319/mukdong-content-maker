import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ImageStudio } from "@/components/images/ImageStudio";

describe("ImageStudio", () => {
  it("offers three simple modes and explicit approval", () => {
    const onApprove = vi.fn();
    render(<ImageStudio onApprove={onApprove} />);
    expect(screen.getByRole("button", { name: "실제 사진 사용" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "AI 이미지 생성" }));
    fireEvent.click(screen.getAllByRole("button", { name: "이 이미지 사용" })[0]);
    expect(onApprove).toHaveBeenCalled();
  });
});
