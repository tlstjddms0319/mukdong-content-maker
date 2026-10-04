import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReelMaker } from "@/components/reels/ReelMaker";

describe("ReelMaker",()=>{
  it("tells the owner to switch browsers when recording is not available",async()=>{
    // jsdom에는 MediaRecorder가 없다.
    render(<ReelMaker cards={["data:image/jpeg;base64,AAAA"]} topic="홍어"/>);
    expect(await screen.findByRole("alert")).toHaveTextContent("영상 녹화를 지원하지 않아요");
    expect(screen.getByRole("button",{name:"릴스 영상 만들기"})).toBeDisabled();
  });
  it("offers the AI intro only when the cover has a source photo",()=>{
    const {rerender}=render(<ReelMaker cards={["a"]} topic="홍어"/>);
    expect(screen.queryByText(/AI 움직이는 표지/)).not.toBeInTheDocument();
    rerender(<ReelMaker cards={["a"]} coverSource="data:image/jpeg;base64,AAAA" topic="홍어"/>);
    expect(screen.getByText(/AI 움직이는 표지/)).toBeInTheDocument();
  });
});
