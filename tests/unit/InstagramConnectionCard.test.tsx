import { fireEvent,render,screen,waitFor } from "@testing-library/react";
import { afterEach,describe,expect,it,vi } from "vitest";
import { InstagramConnectionCard } from "@/components/settings/InstagramConnectionCard";

describe("InstagramConnectionCard",()=>{
  afterEach(()=>{vi.unstubAllGlobals();window.history.replaceState(null,"","/");});

  it("사장님 화면에는 실패 원인 대신 무엇을 누르면 되는지만, 관리자용에는 확인할 항목을 보여 준다",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({connected:false})}));
    window.history.replaceState(null,"","/settings?instagram=error&reason=token");
    const {unmount}=render(<InstagramConnectionCard/>);
    const plain=await screen.findByRole("alert");
    expect(plain).toHaveTextContent("다시 눌러 주세요");
    expect(plain).not.toHaveTextContent(/시크릿|Render|INSTAGRAM_/);
    unmount();
    render(<InstagramConnectionCard part="server"/>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Instagram 앱 시크릿");
  });

  it("서버가 알아낸 토큰 거절 원인(hint)이 있으면 관리자용에 그 항목만 콕 집어 안내한다",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({connected:false})}));
    window.history.replaceState(null,"","/settings?instagram=error&reason=token&hint=redirect");
    render(<InstagramConnectionCard part="server"/>);
    expect(await screen.findByRole("alert")).toHaveTextContent("INSTAGRAM_REDIRECT_URI");
  });

  it("연결 전에는 쉬운 안내와 연결 버튼을 보여준다",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({connected:false})}));
    render(<InstagramConnectionCard/>);
    expect(await screen.findByText("아직 연결되지 않았어요")).toBeInTheDocument();
    expect(screen.getByRole("link",{name:"인스타그램 연결하기"})).toHaveAttribute("href","/api/instagram/connect");
    // 사장님 화면에는 서버 설정 목록이 없다.
    expect(screen.queryByText("게시 서버 설정")).not.toBeInTheDocument();
  });

  it("연결에 필요한 서버 설정이 없으면 연결 버튼을 막고, 이유는 관리자용에서 보여준다",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({connected:false,setup:{appId:false,appSecret:false,redirectUri:false,mediaHttpsUrl:false,signingKey:false}})}));
    const {unmount}=render(<InstagramConnectionCard/>);
    expect(await screen.findByRole("button",{name:"인스타그램 연결하기"})).toBeDisabled();
    expect(screen.queryByRole("link",{name:"인스타그램 연결하기"})).not.toBeInTheDocument();
    expect(screen.getByText(/관리자용 설정/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("환경변수");
    unmount();
    render(<InstagramConnectionCard part="server"/>);
    expect(await screen.findByText(/서버 환경변수에 넣으면 연결할 수 있어요/)).toBeInTheDocument();
  });

  it("계정이 연결되어도 게시 서버 설정이 빠졌으면 관리자용에 항목을 따로 안내한다",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({
      connected:true,username:"mukdong",needsReconnect:false,
      setup:{appId:true,appSecret:true,redirectUri:true,mediaHttpsUrl:false,signingKey:false},
    })}));
    render(<><InstagramConnectionCard/><InstagramConnectionCard part="server"/></>);
    expect(await screen.findByText("@mukdong 연결됨")).toBeInTheDocument();
    expect(await screen.findByText("게시 서버 설정이 더 필요해요.")).toBeInTheDocument();
    expect(screen.getByText("공개 이미지 HTTPS 주소")).toBeInTheDocument();
    expect(screen.getByText("이미지 보안 키")).toBeInTheDocument();
  });

  it("반응 읽기 권한 없이 연결된 예전 연결이면 다시 연결을 안내한다",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({connected:true,username:"mukdong",expiresAt:"2026-12-01T00:00:00.000Z",needsReconnect:false,insights:false,setup:{appId:true,appSecret:true,redirectUri:true,mediaHttpsUrl:true,signingKey:true}})}));
    render(<InstagramConnectionCard/>);
    expect(await screen.findByText(/반응\(도달·저장·공유\)을 자동으로 가져오려면/)).toBeInTheDocument();
    expect(screen.getByRole("link",{name:"다시 연결"})).toHaveAttribute("href","/api/instagram/connect");
  });

  it("연결된 계정은 토큰 없이 사용자명만 보여주고, 한 번 물은 뒤 연결을 끊을 수 있다",async()=>{
    const request=vi.fn()
      .mockResolvedValueOnce({ok:true,json:async()=>({connected:true,username:"mukdong",expiresAt:"2026-10-01T00:00:00.000Z",needsReconnect:false,setup:{appId:true,appSecret:true,redirectUri:true,mediaHttpsUrl:true,signingKey:true}})})
      .mockResolvedValueOnce({ok:true,json:async()=>({connected:false})});
    vi.stubGlobal("fetch",request);
    vi.stubGlobal("confirm",vi.fn(()=>true));
    render(<InstagramConnectionCard/>);
    expect(await screen.findByText("@mukdong 연결됨")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("accessToken");
    fireEvent.click(screen.getByRole("button",{name:"연결 끊기"}));
    await waitFor(()=>expect(request).toHaveBeenCalledWith("/api/instagram/connection",{method:"DELETE"}));
    expect(await screen.findByText("아직 연결되지 않았어요")).toBeInTheDocument();
  });
});
