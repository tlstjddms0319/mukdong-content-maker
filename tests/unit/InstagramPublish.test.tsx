import { fireEvent,render,screen,waitFor } from "@testing-library/react";
import { afterEach,describe,expect,it,vi } from "vitest";
import { InstagramPublish } from "@/components/review/InstagramPublish";

const props={draftId:"11111111-1111-4111-8111-111111111111",caption:"홍어 삼합을 소개합니다",imageUrls:["first", "second", "third"]};
const connected=(publish:unknown,record:unknown={state:"none",label:""})=>vi.fn(async(url:string)=>url==="/api/instagram/status"?{ok:true,json:async()=>({connected:true,username:"mukdong"})}
  :url.startsWith("/api/instagram/publication")?{ok:true,json:async()=>record}
  :{ok:true,json:async()=>publish});
describe("InstagramPublish",()=>{
  afterEach(()=>vi.unstubAllGlobals());
  it("연결되지 않으면 버튼을 흐리게 두고 설정에서 연결하라고 한 줄로 알려 준다",async()=>{
    const ready=vi.fn();
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({connected:false})}));
    render(<InstagramPublish {...props} onReady={ready}/>);
    expect(await screen.findByText("설정에서 인스타그램을 연결하면 바로 올릴 수 있어요")).toBeInTheDocument();
    expect(screen.getByRole("button",{name:"인스타그램에 바로 올리기"})).toBeDisabled();
    expect(ready).toHaveBeenCalledWith(false);
  });
  it("한 번 더 물은 뒤에만, 고친 글을 먼저 저장하고 올린다",async()=>{
    const request=connected({status:"published",mediaId:"post-1"});
    const confirm=vi.fn(()=>true),save=vi.fn(async()=>true);
    vi.stubGlobal("fetch",request);vi.stubGlobal("confirm",confirm);
    render(<InstagramPublish {...props} onBeforePublish={save}/>);
    const button=await screen.findByRole("button",{name:"인스타그램에 바로 올리기"});
    await waitFor(()=>expect(button).toBeEnabled());
    expect(screen.getByText("@mukdong 계정에 올라가요")).toBeInTheDocument();
    await waitFor(()=>expect(request).toHaveBeenCalledTimes(2));
    expect(request.mock.calls.some(([url])=>url==="/api/instagram/publish")).toBe(false);
    fireEvent.click(button);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("사진 3장"));
    await waitFor(()=>expect(request).toHaveBeenCalledWith("/api/instagram/publish",expect.objectContaining({method:"POST"})));
    expect(save).toHaveBeenCalled();
    const call=request.mock.calls.find(([url])=>url==="/api/instagram/publish") as unknown as [string,RequestInit];
    const body=JSON.parse(String(call[1].body));expect(body).toEqual({draftId:props.draftId,approved:true,caption:props.caption});expect(body).not.toHaveProperty("imageUrls");expect(body).not.toHaveProperty("images");expect(body).not.toHaveProperty("mediaIds");
    expect(await screen.findByText("인스타그램에 올렸어요.")).toBeInTheDocument();
  });
  it("확인 창에서 취소하면 올리지 않는다",async()=>{
    const request=connected({status:"published"});
    vi.stubGlobal("fetch",request);vi.stubGlobal("confirm",vi.fn(()=>false));
    render(<InstagramPublish {...props}/>);
    const button=await screen.findByRole("button",{name:"인스타그램에 바로 올리기"});
    await waitFor(()=>expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(request.mock.calls.some(([url])=>url==="/api/instagram/publish")).toBe(false);
  });
  it("고친 글을 저장하지 못하면 올리지 않는다",async()=>{
    const request=connected({status:"published"});
    vi.stubGlobal("fetch",request);vi.stubGlobal("confirm",vi.fn(()=>true));
    render(<InstagramPublish {...props} onBeforePublish={async()=>false}/>);
    const button=await screen.findByRole("button",{name:"인스타그램에 바로 올리기"});
    await waitFor(()=>expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent("올리지 않았어요");
    expect(request.mock.calls.some(([url])=>url==="/api/instagram/publish")).toBe(false);
  });
  it("이미 올린 게시물은 '올렸어요' 대신 다시 올리지 않았다고 알려 준다",async()=>{
    vi.stubGlobal("fetch",connected({status:"published",alreadyPublished:true,mediaId:"post-old"}));vi.stubGlobal("confirm",vi.fn(()=>true));
    render(<InstagramPublish {...props}/>);
    const button=await screen.findByRole("button",{name:"인스타그램에 바로 올리기"});
    await waitFor(()=>expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(await screen.findByText("이미 올린 게시물이에요.")).toBeInTheDocument();
    expect(screen.queryByText("인스타그램에 올렸어요.")).not.toBeInTheDocument();
  });
  it("올린 기록이 있으면 처음부터 버튼 대신 안내를 보여 준다",async()=>{
    vi.stubGlobal("fetch",connected({},{state:"published",label:"게시됨"}));
    render(<InstagramPublish {...props}/>);
    expect(await screen.findByText("이미 올린 게시물이에요.")).toBeInTheDocument();
    expect(screen.queryByRole("button",{name:"인스타그램에 바로 올리기"})).not.toBeInTheDocument();
  });
});
