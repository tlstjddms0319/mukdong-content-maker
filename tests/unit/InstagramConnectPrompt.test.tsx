import { fireEvent,render,screen,waitFor } from "@testing-library/react";
import { afterEach,describe,expect,it,vi } from "vitest";
import { InstagramConnectPrompt } from "@/components/settings/InstagramConnectPrompt";

const setup={appId:true,appSecret:true,redirectUri:true,mediaHttpsUrl:true,signingKey:true,persistentStorage:true};
const respond=(value:unknown)=>vi.fn().mockResolvedValue({ok:true,json:async()=>value});

describe("InstagramConnectPrompt",()=>{
  afterEach(()=>{vi.unstubAllGlobals();sessionStorage.clear();});

  it("로그인 뒤 연결이 없으면 바로 연결 창을 띄운다",async()=>{
    vi.stubGlobal("fetch",respond({connected:false,setup}));
    render(<InstagramConnectPrompt/>);
    expect(await screen.findByRole("dialog")).toHaveTextContent("인스타그램을 연결할까요?");
    expect(screen.getByRole("link",{name:"지금 연결"})).toHaveAttribute("href","/api/instagram/connect");
  });

  it("나중에를 누르면 이 탭에서는 다시 띄우지 않는다",async()=>{
    const request=respond({connected:false,setup});
    vi.stubGlobal("fetch",request);
    const {unmount}=render(<InstagramConnectPrompt/>);
    fireEvent.click(await screen.findByRole("button",{name:"나중에"}));
    expect(screen.queryByRole("dialog")).toBeNull();
    unmount();
    render(<InstagramConnectPrompt/>);
    await waitFor(()=>expect(request).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("이미 연결돼 있거나 서버 설정이 없어 연결할 수 없으면 띄우지 않는다",async()=>{
    const connected=respond({connected:true,username:"mukdong",expiresAt:"2099-01-01T00:00:00.000Z",needsReconnect:false,setup});
    vi.stubGlobal("fetch",connected);
    const {unmount}=render(<InstagramConnectPrompt/>);
    await waitFor(()=>expect(connected).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).toBeNull();
    unmount();
    vi.stubGlobal("fetch",respond({connected:false,setup:{...setup,appSecret:false}}));
    render(<InstagramConnectPrompt/>);
    await new Promise(resolve=>setTimeout(resolve,20));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("기간이 끝난 연결은 다시 연결을 권하고, 임시 저장소면 풀리는 이유를 알린다",async()=>{
    vi.stubGlobal("fetch",respond({connected:true,username:"mukdong",expiresAt:"2000-01-01T00:00:00.000Z",needsReconnect:true,setup:{...setup,persistentStorage:false}}));
    render(<InstagramConnectPrompt/>);
    const dialog=await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("@mukdong");
    expect(dialog).toHaveTextContent("영구 저장소");
    expect(screen.getByRole("link",{name:"다시 연결"})).toBeInTheDocument();
  });
});
