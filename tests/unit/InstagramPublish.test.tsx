import { fireEvent,render,screen,waitFor } from "@testing-library/react";
import { afterEach,describe,expect,it,vi } from "vitest";
import { InstagramPublish } from "@/components/review/InstagramPublish";

const props={draftId:"11111111-1111-4111-8111-111111111111",caption:"홍어 삼합을 소개합니다",imageUrls:["first", "second", "third"]};
describe("InstagramPublish",()=>{
  afterEach(()=>vi.unstubAllGlobals());
  it("연결되지 않으면 게시 버튼 대신 설정 링크를 보여준다",async()=>{vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({connected:false})}));render(<InstagramPublish {...props}/>);expect(await screen.findByRole("link",{name:"Instagram 연결하기"})).toHaveAttribute("href","/settings");expect(screen.queryByRole("button",{name:/게시/})).not.toBeInTheDocument();});
  it("사용자가 명시적으로 누른 뒤에만 첫 썸네일과 장수를 보여주고 게시한다",async()=>{const request=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({connected:true,username:"mukdong"})}).mockResolvedValueOnce({ok:true,json:async()=>({status:"published",mediaId:"post-1"})});vi.stubGlobal("fetch",request);render(<InstagramPublish {...props}/>);const button=await screen.findByRole("button",{name:"승인하고 Instagram에 게시"});expect(screen.getByText("이미지 3장")).toBeInTheDocument();expect(screen.getByLabelText("게시 대표 이미지")).toHaveStyle({backgroundImage:'url("first")'});expect(request).toHaveBeenCalledTimes(1);fireEvent.click(button);await waitFor(()=>expect(request).toHaveBeenCalledWith("/api/instagram/publish",expect.objectContaining({method:"POST"})));const body=JSON.parse(String(request.mock.calls[1][1].body));expect(body).toEqual({draftId:props.draftId,approved:true,caption:props.caption});expect(body).not.toHaveProperty("imageUrls");expect(body).not.toHaveProperty("images");expect(body).not.toHaveProperty("mediaIds");expect(await screen.findByText("게시 완료")).toBeInTheDocument();});
});
