import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImageStudio } from "@/components/images/ImageStudio";

describe("ImageStudio", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("offers three simple modes and explicit approval", () => {
    const onApprove = vi.fn();
    render(<ImageStudio onApprove={onApprove} />);
    expect(screen.getByRole("button", { name: "실제 사진 사용" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "AI 이미지 생성" }));
    fireEvent.click(screen.getAllByRole("button", { name: "이 이미지 사용" })[0]);
    expect(onApprove).toHaveBeenCalled();
  });

  it("returns the generated preview when the user approves it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok:true, json:async()=>({ images:["data:image/png;base64,AQ==","two","three"] }) }));
    const onApprove = vi.fn(); render(<ImageStudio onApprove={onApprove}/>);
    fireEvent.click(screen.getByRole("button", { name:"AI 이미지 생성" }));
    fireEvent.click(screen.getByRole("button", { name:"후보 3장 생성하기" }));
    await screen.findByText("생성된 후보 1");
    fireEvent.click(screen.getAllByRole("button", { name:"이 이미지 사용" })[0]);
    expect(onApprove).toHaveBeenCalledWith(expect.objectContaining({ preview:"data:image/png;base64,AQ==" }));
  });
});
