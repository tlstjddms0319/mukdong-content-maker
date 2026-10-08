import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFallbackCarouselPlan } from "@/features/images/carousel";
import { addLibraryPhoto, buildPhotoCarousel, canEditSlideText, editSlideText, ensureGeneration, resetGenerationStore, slideTextProblem, useGenerationState } from "@/features/images/generationStore";

const photo="data:image/jpeg;base64,AAAA";
const card=(n:number)=>`data:image/jpeg;base64,CARD${n}`;

describe("slide text editing", () => {
  afterEach(()=>{vi.unstubAllGlobals();resetGenerationStore();});

  it("checks the same limits as the carousel plan", () => {
    expect(slideTextProblem({headline:"  ",points:[]})).toBe("제목을 적어 주세요.");
    expect(slideTextProblem({headline:"가".repeat(43),points:[]})).toContain("42자");
    expect(slideTextProblem({headline:"제목",points:["하나","둘","셋","넷","다섯"]})).toContain("4줄");
    expect(slideTextProblem({headline:"제목",points:["가".repeat(41)]})).toContain("1번째 짧은 글");
    expect(slideTextProblem({headline:"제목",points:["하나","","둘"]})).toBeNull();
  });

  it("redraws one photo slide with the edited text, without an image AI, and updates the plan", async () => {
    const plan=createFallbackCarouselPlan({topic:"홍어 한 점",slideCount:3});
    const bodies:Array<Record<string,unknown>>=[];
    let n=0;
    vi.stubGlobal("fetch",vi.fn(async(url:string,init?:RequestInit)=>{
      if(url==="/api/images/plan")return {ok:true,json:async()=>({plan,provider:"gemini"})};
      bodies.push(JSON.parse(String(init?.body)));
      return {ok:true,json:async()=>({images:[card(++n)],source:"photo"})};
    }));
    const { result }=renderHook(()=>useGenerationState());
    act(()=>{ensureGeneration("d|3",{topic:"홍어 한 점",slideCount:3});addLibraryPhoto({id:"p1",preview:photo,name:"사진"});});
    await act(async()=>{await buildPhotoCarousel();});
    await waitFor(()=>expect(result.current.slides).toHaveLength(3));
    expect(canEditSlideText(result.current,0)).toBe(true);
    const before=result.current.slides[0];
    await act(async()=>{await editSlideText(0,{headline:"  고친 표지 제목  ",points:[]});});
    const last=bodies.at(-1)!;
    expect(last).toMatchObject({slideIndex:1,photos:[photo],photoKind:"real",slide:{headline:"고친 표지 제목"}});
    expect(result.current.plan!.slides[0].headline).toBe("고친 표지 제목");
    expect(result.current.slides[0]).toMatchObject({preview:card(n),source:before.source,role:before.role});
    expect(result.current.slides[0].id).not.toBe(before.id);
    expect(result.current.cover?.preview).toBe(card(n));
    expect(result.current.approved).toBe(false);
    // 한도를 넘으면 요청하지 않고 이유를 보여 준다.
    const calls=bodies.length;
    await act(async()=>{await editSlideText(1,{headline:"가".repeat(50),points:[]});});
    expect(bodies).toHaveLength(calls);
    expect(result.current.error).toContain("42자");
  });

  it("cannot redraw a restored AI card that has no base photo", () => {
    const { result }=renderHook(()=>useGenerationState());
    act(()=>{ensureGeneration("e|5",{topic:"홍어",slideCount:5},[{id:"x",preview:card(1),source:"ai-generated"}]);});
    expect(canEditSlideText(result.current,0)).toBe(false);
  });
});
