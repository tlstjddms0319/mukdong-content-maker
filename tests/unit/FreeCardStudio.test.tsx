import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FreeCardStudio } from "@/components/images/FreeCardStudio";

afterEach(()=>vi.unstubAllGlobals());
const card={id:"11111111-1111-4111-8111-111111111111",preview:"data:image/jpeg;base64,YQ==",source:"design",layout:"text",assetIds:[]};
it("composes with no assets or paid routes and collects a card for the draft",async()=>{
  const request=vi.fn(async(url:string)=>({ok:true,json:async()=>url==="/api/images/assets"?{assets:[]}:{card}}));
  vi.stubGlobal("fetch",request);const approve=vi.fn();
  render(<FreeCardStudio topic="수육에는 왜 김치를 곁들일까?" onApprove={approve}/>);
  await screen.findByText("아직 등록한 사진이 없어요. 글자형 카드는 바로 만들 수 있어요.");
  fireEvent.click(screen.getByRole("button",{name:"카드 미리보기 만들기"}));
  await screen.findByRole("button",{name:"이 카드 추가"});
  fireEvent.click(screen.getByRole("button",{name:"이 카드 추가"}));
  fireEvent.click(screen.getByRole("button",{name:"카드 1장 사용"}));
  expect(approve).toHaveBeenCalledWith([expect.objectContaining({source:"design",preview:card.preview})]);
  expect(request.mock.calls.map(([url])=>url)).toEqual(["/api/images/assets","/api/images/compose"]);
});
it("invalidates a composed preview when its title changes",async()=>{
  vi.stubGlobal("fetch",vi.fn(async(url:string)=>({ok:true,json:async()=>url==="/api/images/assets"?{assets:[]}:{card}})));
  render(<FreeCardStudio topic="질문?" onApprove={()=>{}}/>);
  await screen.findByText("아직 등록한 사진이 없어요. 글자형 카드는 바로 만들 수 있어요.");
  fireEvent.click(screen.getByRole("button",{name:"카드 미리보기 만들기"}));
  await screen.findByRole("button",{name:"이 카드 추가"});
  fireEvent.change(screen.getByLabelText("카드 제목"),{target:{value:"바꾼 질문?"}});
  await waitFor(()=>expect(screen.queryByRole("button",{name:"이 카드 추가"})).not.toBeInTheDocument());
});
