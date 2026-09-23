import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PostPreview } from "@/components/review/PostPreview";

describe("PostPreview", () => {
  it("moves through an ordered carousel while keeping slide one as the feed cover", () => {
    render(<PostPreview caption="편집한 문안" imageUrls={["one", "two", "three", "four", "five"]} />);

    expect(screen.getByText("1 / 5")).toBeVisible();
    expect(screen.getByLabelText("현재 슬라이드 미리보기")).toHaveStyle({ backgroundImage:'url("one")' });
    expect(screen.getByRole("button", { name:"이전 슬라이드" })).toBeDisabled();
    expect(screen.getByRole("button", { name:"다음 슬라이드" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name:"다음 슬라이드" }));
    expect(screen.getByText("2 / 5")).toBeVisible();
    expect(screen.getByLabelText("현재 슬라이드 미리보기")).toHaveStyle({ backgroundImage:'url("two")' });
    fireEvent.click(screen.getByRole("button", { name:"슬라이드 5 보기" }));
    expect(screen.getByText("5 / 5")).toBeVisible();
    expect(screen.getByLabelText("현재 슬라이드 미리보기")).toHaveStyle({ backgroundImage:'url("five")' });
    expect(screen.getByRole("button", { name:"다음 슬라이드" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name:"이전 슬라이드" }));
    expect(screen.getByText("4 / 5")).toBeVisible();
    expect(screen.getByLabelText("현재 슬라이드 미리보기")).toHaveStyle({ backgroundImage:'url("four")' });
    fireEvent.click(screen.getByRole("button", { name:"이전 슬라이드" }));
    fireEvent.click(screen.getByRole("button", { name:"이전 슬라이드" }));
    fireEvent.click(screen.getByRole("button", { name:"이전 슬라이드" }));
    expect(screen.getByText("1 / 5")).toBeVisible();
    expect(screen.getByLabelText("현재 슬라이드 미리보기")).toHaveStyle({ backgroundImage:'url("one")' });
    expect(screen.getByLabelText("피드 대표 이미지")).toHaveStyle({ backgroundImage:'url("one")' });
  });

  it("keeps a one-image draft usable", () => {
    render(<PostPreview caption="문안" imageUrls={["one"]} />);
    expect(screen.getByText("1 / 1")).toBeVisible();
    expect(screen.getByRole("button", { name:"이전 슬라이드" })).toBeDisabled();
    expect(screen.getByRole("button", { name:"다음 슬라이드" })).toBeDisabled();
  });
});
