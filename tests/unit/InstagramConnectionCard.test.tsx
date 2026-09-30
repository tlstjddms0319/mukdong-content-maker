import { fireEvent,render,screen,waitFor } from "@testing-library/react";
import { afterEach,describe,expect,it,vi } from "vitest";
import { InstagramConnectionCard } from "@/components/settings/InstagramConnectionCard";

describe("InstagramConnectionCard",()=>{
  afterEach(()=>{vi.unstubAllGlobals();window.history.replaceState(null,"","/");});

  it("Instagram에서 돌아온 실패 사유를 확인할 항목으로 안내한다",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({connected:false})}));
    window.history.replaceState(null,"","/settings?instagram=error&reason=token");
    render(<InstagramConnectionCard/>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Instagram 앱 시크릿");
  });

  it("연결 전에는 쉬운 안내와 연결 버튼을 보여준다",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({connected:false})}));
    render(<InstagramConnectionCard/>);
    expect(await screen.findByText("아직 연결되지 않았어요")).toBeInTheDocument();
    expect(screen.getByRole("link",{name:"Instagram 연결"})).toHaveAttribute("href","/api/instagram/connect");
  });

  it("연결에 필요한 서버 설정이 없으면 연결 버튼을 막고 이유를 보여준다",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({connected:false,setup:{appId:false,appSecret:false,redirectUri:false,mediaHttpsUrl:false,signingKey:false}})}));
    render(<InstagramConnectionCard/>);
    expect(await screen.findByRole("button",{name:"Instagram 연결"})).toBeDisabled();
    expect(screen.queryByRole("link",{name:"Instagram 연결"})).not.toBeInTheDocument();
    expect(screen.getByText(/서버 환경변수에 넣으면 연결할 수 있어요/)).toBeInTheDocument();
  });

  it("계정이 연결되어도 게시 서버 설정이 빠졌으면 항목을 따로 안내한다",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({
      connected:true,username:"mukdong",needsReconnect:false,
      setup:{appId:true,appSecret:true,redirectUri:true,mediaHttpsUrl:false,signingKey:false},
    })}));
    render(<InstagramConnectionCard/>);

    expect(await screen.findByText("@mukdong 연결됨")).toBeInTheDocument();
    expect(screen.getByText("게시 서버 설정이 더 필요해요.")).toBeInTheDocument();
    expect(screen.getByText("공개 이미지 HTTPS 주소")).toBeInTheDocument();
    expect(screen.getByText("이미지 보안 키")).toBeInTheDocument();
    expect(screen.queryByText("게시 준비가 되었어요.")).not.toBeInTheDocument();
  });

  it("연결된 계정은 토큰 없이 사용자명만 보여주고 해제할 수 있다",async()=>{
    const request=vi.fn()
      .mockResolvedValueOnce({ok:true,json:async()=>({connected:true,username:"mukdong",expiresAt:"2026-10-01T00:00:00.000Z",needsReconnect:false,setup:{appId:true,appSecret:true,redirectUri:true,mediaHttpsUrl:true,signingKey:true}})})
      .mockResolvedValueOnce({ok:true,json:async()=>({connected:false})});
    vi.stubGlobal("fetch",request);
    render(<InstagramConnectionCard/>);
    expect(await screen.findByText("@mukdong 연결됨")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("accessToken");
    fireEvent.click(screen.getByRole("button",{name:"연결 해제"}));
    await waitFor(()=>expect(request).toHaveBeenCalledWith("/api/instagram/connection",{method:"DELETE"}));
    expect(await screen.findByText("아직 연결되지 않았어요")).toBeInTheDocument();
    expect(screen.getByText("필수 설정 항목이 모두 채워졌어요.")).toBeInTheDocument();
  });
});
