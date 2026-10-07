// 파노라마(표지+2번째 장이 한 사진)에서 2번째 장 사진을 바꿨다가 다시 표지 사진으로 되돌리면, 두 장 모두 파노라마로 다시 그린다.
// (예전에는 2번째 장만 오른쪽 반쪽으로 그려지고 표지는 평소 디자인으로 남았다.)
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFallbackCarouselPlan } from "@/features/images/carousel";
import { addLibraryPhoto, buildPhotoCarousel, ensureGeneration, resetGenerationStore, setActiveSlide, swapSlidePhoto, useGenerationState } from "@/features/images/generationStore";

const photo=(n:number)=>`data:image/jpeg;base64,PHOTO${n}`;

describe("panorama swap",()=>{
  afterEach(()=>{vi.unstubAllGlobals();resetGenerationStore();});
  it("redraws both halves when the pair is restored",async()=>{
    const plan=createFallbackCarouselPlan({topic:"홍어 한 점",slideCount:5});
    const sent:Array<{slideIndex:number;panorama:string}>=[];let n=0;
    vi.stubGlobal("fetch",vi.fn(async(url:string,init?:RequestInit)=>{
      const body=typeof init?.body==="string"?JSON.parse(init.body):{};
      if(url==="/api/images/plan")return {ok:true,json:async()=>({plan,provider:"gemini"})};
      if(url==="/api/images/analyze")return {ok:false,json:async()=>({})};
      if(url==="/api/images/store-card")return {ok:true,json:async()=>({image:"data:image/jpeg;base64,STORE"})};
      sent.push({slideIndex:body.slideIndex,panorama:body.panorama??"-"});
      return {ok:true,json:async()=>({images:[`data:image/jpeg;base64,C${++n}`],source:"photo"})};
    }));
    const hook=renderHook(()=>useGenerationState());
    act(()=>{ensureGeneration("pano|5",{topic:"홍어 한 점",slideCount:5});[1,2,3].forEach(i=>addLibraryPhoto({id:`p${i}`,preview:photo(i),name:`사진${i}`}));});
    await act(async()=>{await buildPhotoCarousel({panorama:true});});
    await waitFor(()=>expect(hook.result.current.phase).toBe("idle"));
    expect(sent.slice(0,2)).toEqual([{slideIndex:1,panorama:"left"},{slideIndex:2,panorama:"right"}]);
    sent.length=0;
    act(()=>setActiveSlide(1));
    await act(async()=>{await swapSlidePhoto(1);});
    expect(sent).toEqual([{slideIndex:2,panorama:"-"},{slideIndex:1,panorama:"-"}]);
    sent.length=0;
    await act(async()=>{await swapSlidePhoto(0);});
    expect(sent).toEqual([{slideIndex:2,panorama:"right"},{slideIndex:1,panorama:"left"}]);
  });
});
