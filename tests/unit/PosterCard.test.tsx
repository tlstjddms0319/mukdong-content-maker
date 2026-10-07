// 설정 화면 "맨 뒤 홍보 포스터" 카드: 지금 포스터 미리보기·출처, 올리기, 직접 올린 것만 되돌리기.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PosterCard } from "@/components/settings/PosterCard";

const reply=(body:unknown,ok=true)=>({ok,json:async()=>body});
const PREVIEW="data:image/jpeg;base64,AAAA";

describe("promo poster settings card", () => {
  afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});

  it("shows the bundled poster and uploads a new one", async () => {
    const fetchMock=vi.fn()
      .mockResolvedValueOnce(reply({source:"bundled",updatedAt:null,preview:PREVIEW}))
      .mockResolvedValueOnce(reply({source:"custom",updatedAt:"2026-10-07T03:00:00Z",preview:PREVIEW}));
    vi.stubGlobal("fetch",fetchMock);
    const {container}=render(<PosterCard/>);
    expect(await screen.findByText("기본 포스터")).toBeInTheDocument();
    expect(screen.getByAltText("지금 쓰는 홍보 포스터 미리보기")).toHaveAttribute("src",PREVIEW);
    // 기본 포스터일 때는 되돌리기 버튼이 없다.
    expect(screen.queryByRole("button",{name:"기본 포스터로 되돌리기"})).not.toBeInTheDocument();
    const input=container.querySelector("input[type=file]") as HTMLInputElement;
    fireEvent.change(input,{target:{files:[new File(["x"],"poster.png",{type:"image/png"})]}});
    expect(await screen.findByText("직접 올린 포스터")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("새 포스터로 바꿨어요");
    const [url,init]=fetchMock.mock.calls[1];
    expect(url).toBe("/api/store/poster");
    expect(init.method).toBe("POST");
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
    expect(screen.getByRole("button",{name:"기본 포스터로 되돌리기"})).toBeInTheDocument();
  });

  it("reverts a custom poster after confirmation and shows server errors", async () => {
    vi.spyOn(window,"confirm").mockReturnValue(true);
    const fetchMock=vi.fn()
      .mockResolvedValueOnce(reply({source:"custom",updatedAt:"2026-10-07T03:00:00Z",preview:PREVIEW}))
      .mockResolvedValueOnce(reply({message:"기본 포스터로 되돌리지 못했어요."},false))
      .mockResolvedValueOnce(reply({source:"bundled",updatedAt:null,preview:PREVIEW}));
    vi.stubGlobal("fetch",fetchMock);
    render(<PosterCard/>);
    const button=await screen.findByRole("button",{name:"기본 포스터로 되돌리기"});
    fireEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent("기본 포스터로 되돌리지 못했어요.");
    fireEvent.click(screen.getByRole("button",{name:"기본 포스터로 되돌리기"}));
    await waitFor(()=>expect(screen.getByText("기본 포스터")).toBeInTheDocument());
    expect(fetchMock.mock.calls[2][1].method).toBe("DELETE");
    expect(screen.queryByRole("button",{name:"기본 포스터로 되돌리기"})).not.toBeInTheDocument();
  });
});
