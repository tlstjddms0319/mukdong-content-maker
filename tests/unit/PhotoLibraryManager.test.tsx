import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PhotoLibraryManager } from "@/components/images/PhotoLibraryManager";

afterEach(()=>vi.unstubAllGlobals());
const quality=(flags:string[])=>({luminance:.5,saturation:.3,cast:.1,sharpness:1.2,longSide:1400,flags});
const asset=(id:string,name:string,createdAt:string,q:ReturnType<typeof quality>|null)=>({id,name,tags:["홍어"],kind:"photo",credit:"직접 촬영",preview:"data:image/jpeg;base64,YQ==",createdAt,lastUsedAt:null,useCount:0,quality:q});

it("shows quality badges and can put good cover photos first",async()=>{
  const assets=[
    asset("11111111-1111-4111-8111-111111111111","어두운 사진","2026-10-03T00:00:00.000Z",quality(["dark","blurry"])),
    asset("22222222-2222-4222-8222-222222222222","예전 사진","2026-10-02T00:00:00.000Z",null),
    asset("33333333-3333-4333-8333-333333333333","좋은 사진","2026-10-01T00:00:00.000Z",quality([])),
  ];
  vi.stubGlobal("fetch",vi.fn(async()=>({ok:true,status:200,json:async()=>({assets})})));
  render(<PhotoLibraryManager/>);
  const dark=await screen.findByRole("listitem",{name:"어두운 사진"});
  expect(within(dark).getByText("어두움")).toBeInTheDocument();
  expect(within(dark).getByText("흔들림")).toBeInTheDocument();
  expect(within(screen.getByRole("listitem",{name:"좋은 사진"})).getByText("표지 추천")).toBeInTheDocument();
  // 예전 사진(품질 없음)은 배지가 없다.
  expect(within(screen.getByRole("listitem",{name:"예전 사진"})).queryByLabelText("사진 상태")).toBeNull();
  const names=()=>within(screen.getByRole("list",{name:""})).getAllByRole("listitem").map(item=>item.getAttribute("aria-label"));
  expect(names()).toEqual(["어두운 사진","예전 사진","좋은 사진"]);
  fireEvent.click(screen.getByLabelText(/표지로 좋은 사진 먼저/));
  expect(names()).toEqual(["좋은 사진","어두운 사진","예전 사진"]);
});

it("uploads store hongeo photos as AI reference photos from their own box",async()=>{
  const existing={...asset("44444444-4444-4444-8444-444444444444","홍어회","2026-10-04T00:00:00.000Z",null),tags:["홍어회","AI 참고"]};
  const posted:FormData[]=[];
  vi.stubGlobal("fetch",vi.fn(async(_url:string,init?:RequestInit)=>{
    if(init?.method==="POST"){
      const body=init.body as FormData;posted.push(body);
      return {ok:true,status:201,json:async()=>({asset:{...existing,id:`55555555-5555-4555-8555-55555555555${posted.length}`,name:String(body.get("name"))}})};
    }
    return {ok:true,status:200,json:async()=>({assets:[existing,{...asset("66666666-6666-4666-8666-666666666666","과메기","2026-10-03T00:00:00.000Z",null),tags:["과메기"]}]})};
  }));
  render(<PhotoLibraryManager/>);
  const box=await screen.findByRole("region",{name:"홍어회 참고 사진"});
  // 이미 있는 홍어회 사진만 센다(과메기는 세지 않음).
  expect(await within(box).findByText(/지금 1장/)).toBeInTheDocument();
  const files=[new File(["a"],"IMG_1.jpg",{type:"image/jpeg"}),new File(["b"],"IMG_2.jpg",{type:"image/jpeg"})];
  fireEvent.change(within(box).getByLabelText("홍어회 사진 고르기"),{target:{files}});
  expect(await within(box).findByText(/2장을 올렸어요/)).toBeInTheDocument();
  expect(posted).toHaveLength(2);
  expect(posted.map(form=>[form.get("name"),form.get("tags"),form.get("kind")])).toEqual([["홍어회","홍어회,AI 참고","photo"],["홍어회","홍어회,AI 참고","photo"]]);
  expect(within(box).getByText(/지금 3장/)).toBeInTheDocument();
});
