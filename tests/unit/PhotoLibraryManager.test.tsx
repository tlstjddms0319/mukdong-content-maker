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
