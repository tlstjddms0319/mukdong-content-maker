import { fireEvent,render,screen,waitFor } from "@testing-library/react";
import { afterEach,describe,expect,it,vi } from "vitest";
import { InstagramConnectionCard } from "@/components/settings/InstagramConnectionCard";

describe("InstagramConnectionCard",()=>{
  afterEach(()=>vi.unstubAllGlobals());

  it("연결 전에는 쉬운 안내와 연결 버튼을 보여준다",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({connected:false})}));
    render(<InstagramConnectionCard/>);
    expect(await screen.findByText("아직 연결되지 않았어요")).toBeInTheDocument();
    expect(screen.getByRole("link",{name:"Instagram 연결"})).toHaveAttribute("href","/api/instagram/connect");
  });

  it("연결된 계정은 토큰 없이 사용자명만 보여주고 해제할 수 있다",async()=>{
    const request=vi.fn()
      .mockResolvedValueOnce({ok:true,json:async()=>({connected:true,username:"mukdong",expiresAt:"2026-10-01T00:00:00.000Z",needsReconnect:false})})
      .mockResolvedValueOnce({ok:true,json:async()=>({connected:false})});
    vi.stubGlobal("fetch",request);
    render(<InstagramConnectionCard/>);
    expect(await screen.findByText("@mukdong 연결됨")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("accessToken");
    fireEvent.click(screen.getByRole("button",{name:"연결 해제"}));
    await waitFor(()=>expect(request).toHaveBeenCalledWith("/api/instagram/connection",{method:"DELETE"}));
    expect(await screen.findByText("아직 연결되지 않았어요")).toBeInTheDocument();
  });
});
