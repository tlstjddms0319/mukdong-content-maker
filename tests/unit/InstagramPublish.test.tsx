import { fireEvent,render,screen,waitFor } from "@testing-library/react";
import { afterEach,describe,expect,it,vi } from "vitest";
import { InstagramPublish } from "@/components/review/InstagramPublish";

const props={draftId:"11111111-1111-4111-8111-111111111111",caption:"홍어 삼합을 소개합니다",imageUrls:["first", "second", "third"]};
describe("InstagramPublish",()=>{
  afterEach(()=>vi.unstubAllGlobals());
  it("연결되지 않으면 추후 연동 안내만 보여준다",async()=>{vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({connected:false})}));render(<InstagramPublish {...props}/>);expect(await screen.findByText(/설정 화면에서 Instagram을 연결하면/)).toBeInTheDocument();expect(screen.queryByRole("link",{name:"Instagram 연결하기"})).not.toBeInTheDocument();expect(screen.queryByRole("button",{name:/게시/})).not.toBeInTheDocument();});
  it("사용자가 명시적으로 누른 뒤에만 첫 썸네일과 장수를 보여주고 게시한다",async()=>{
    // 연결 상태 → 게시 기록(아직 없음) → 게시 순서로 부른다. 주소로 응답을 고른다.
    const request=vi.fn(async(url:string)=>url==="/api/instagram/status"?{ok:true,json:async()=>({connected:true,username:"mukdong"})}
      :url.startsWith("/api/instagram/publication")?{ok:true,json:async()=>({state:"none",label:""})}
      :{ok:true,json:async()=>({status:"published",mediaId:"post-1"})});
    vi.stubGlobal("fetch",request);render(<InstagramPublish {...props}/>);
    const button=await screen.findByRole("button",{name:"승인하고 Instagram에 게시"});
    expect(screen.getByText("이미지 3장")).toBeInTheDocument();expect(screen.getByLabelText("게시 대표 이미지")).toHaveStyle({backgroundImage:'url("first")'});
    await waitFor(()=>expect(request).toHaveBeenCalledTimes(2));
    expect(request.mock.calls.some(([url])=>url==="/api/instagram/publish")).toBe(false);
    fireEvent.click(button);
    await waitFor(()=>expect(request).toHaveBeenCalledWith("/api/instagram/publish",expect.objectContaining({method:"POST"})));
    const call=request.mock.calls.find(([url])=>url==="/api/instagram/publish") as unknown as [string,RequestInit];
    const body=JSON.parse(String(call[1].body));expect(body).toEqual({draftId:props.draftId,approved:true,caption:props.caption});expect(body).not.toHaveProperty("imageUrls");expect(body).not.toHaveProperty("images");expect(body).not.toHaveProperty("mediaIds");
    expect(await screen.findByText("게시 완료")).toBeInTheDocument();
  });
  it("이미 게시한 초안은 '게시 완료' 대신 다시 올리지 않았다고 알려 준다",async()=>{
    const request=vi.fn(async(url:string)=>url==="/api/instagram/status"?{ok:true,json:async()=>({connected:true,username:"mukdong"})}
      :url.startsWith("/api/instagram/publication")?{ok:true,json:async()=>({state:"none",label:""})}
      :{ok:true,json:async()=>({status:"published",alreadyPublished:true,mediaId:"post-old"})});
    vi.stubGlobal("fetch",request);render(<InstagramPublish {...props}/>);
    fireEvent.click(await screen.findByRole("button",{name:"승인하고 Instagram에 게시"}));
    expect(await screen.findByText("이미 게시된 초안이에요.")).toBeInTheDocument();
    expect(screen.queryByText("게시 완료")).not.toBeInTheDocument();
  });
  it("게시 기록이 '게시됨'이면 처음부터 버튼 대신 안내를 보여 준다",async()=>{
    vi.stubGlobal("fetch",vi.fn(async(url:string)=>url==="/api/instagram/status"?{ok:true,json:async()=>({connected:true,username:"mukdong"})}:{ok:true,json:async()=>({state:"published",label:"게시됨"})}));
    render(<InstagramPublish {...props}/>);
    expect(await screen.findByText("이미 게시된 초안이에요.")).toBeInTheDocument();
    expect(screen.queryByRole("button",{name:"승인하고 Instagram에 게시"})).not.toBeInTheDocument();
  });
});
