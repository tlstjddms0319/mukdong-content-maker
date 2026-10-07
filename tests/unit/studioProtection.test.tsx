// 이미지 단계에서 만든 것을 지키는지: 같은 모드 다시 누르기, 완성 뒤 디자인 바꾸기, 사진 캐러셀이 중간에 멈췄을 때 이어 만들기, 새 장 추가 실패.
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFallbackCarouselPlan } from "@/features/images/carousel";
import { addLibraryPhoto, addSlide, approvedDeck, buildPhotoCarousel, chooseMode, ensureGeneration, photoDeckIncomplete, resetGenerationStore, resumePhotoCarousel, setTheme, useGenerationState } from "@/features/images/generationStore";

const photo=(n:number)=>`data:image/jpeg;base64,PHOTO${n}`;
const card=(n:number)=>`data:image/jpeg;base64,CARD${n}`;

// 사진 3장으로 5장 캐러셀. failAt번째 카드 요청에서 한 번 실패하게 할 수 있다.
function stubServer({failAt,slideFails=false}:{failAt?:number;slideFails?:boolean}={}){
  const plan=createFallbackCarouselPlan({topic:"홍어 한 점",slideCount:5});
  let n=0,failed=false;
  const storeCards:Array<Record<string,unknown>>=[];
  vi.stubGlobal("fetch",vi.fn(async(url:string,init?:RequestInit)=>{
    if(url==="/api/images/plan")return {ok:true,json:async()=>({plan,provider:"gemini"})};
    if(url==="/api/images/analyze")return {ok:false,json:async()=>({})};
    if(url==="/api/images/store-card"){storeCards.push(JSON.parse(String(init?.body)));return {ok:true,json:async()=>({image:card(900+storeCards.length)})};}
    if(url==="/api/images/slide")return slideFails?{ok:false,json:async()=>({message:"새 장 문구를 짓지 못했어요."})}:{ok:true,json:async()=>({draft:{headline:"새 장",points:["하나"]}})};
    n++;
    if(failAt&&n===failAt&&!failed){failed=true;return {ok:false,status:502,json:async()=>({message:"서버가 잠시 응답하지 않았어요."})};}
    return {ok:true,json:async()=>({images:[card(n)],source:"photo"})};
  }));
  return {plan,storeCards};
}
async function start(){
  const hook=renderHook(()=>useGenerationState());
  act(()=>{ensureGeneration("protect|5",{topic:"홍어 한 점",slideCount:5});chooseMode("photo");[1,2,3].forEach(i=>addLibraryPhoto({id:`p${i}`,preview:photo(i),name:`사진${i}`}));});
  return hook;
}

describe("image studio keeps finished work",()=>{
  afterEach(()=>{vi.unstubAllGlobals();resetGenerationStore();});

  it("does nothing when the already selected mode card is tapped again",async()=>{
    stubServer();
    const hook=await start();
    await act(async()=>{await buildPhotoCarousel();});
    await waitFor(()=>expect(hook.result.current.slides).toHaveLength(5));
    act(()=>chooseMode("photo"));
    expect(hook.result.current.slides).toHaveLength(5);
    expect(hook.result.current.plan).toBeDefined();
  });

  it("keeps the store card when a design picker changes after the deck is done",async()=>{
    const {storeCards}=stubServer();
    const hook=await start();
    await act(async()=>{await buildPhotoCarousel();});
    await waitFor(()=>expect(approvedDeck(hook.result.current)).toHaveLength(6));
    act(()=>setTheme("minimal"));
    // 디자인 고르기는 다음에 만들 때부터 적용된다. 이미 그린 홍보 카드가 빠지지 않는다(예전: 5장만 넘어가 "5 / 6"으로 게시).
    expect(approvedDeck(hook.result.current)).toHaveLength(6);
    expect(storeCards).toHaveLength(1);
  });

  it("resumes a photo carousel that stopped halfway without redrawing finished cards",async()=>{
    stubServer({failAt:4});
    const hook=await start();
    await act(async()=>{await buildPhotoCarousel();});
    await waitFor(()=>expect(hook.result.current.phase).toBe("idle"));
    expect(hook.result.current.slides).toHaveLength(3);
    expect(hook.result.current.error).toContain("응답하지 않았어요");
    expect(photoDeckIncomplete(hook.result.current)).toBe(true);
    const firstThree=hook.result.current.slides.map(slide=>slide.id);
    await act(async()=>{await resumePhotoCarousel();});
    await waitFor(()=>expect(hook.result.current.slides).toHaveLength(5));
    expect(hook.result.current.slides.slice(0,3).map(slide=>slide.id)).toEqual(firstThree);
    expect(hook.result.current.error).toBe("");
    expect(photoDeckIncomplete(hook.result.current)).toBe(false);
  });

  it("tells the editor when a new slide could not be added",async()=>{
    stubServer({slideFails:true});
    const hook=await start();
    await act(async()=>{await buildPhotoCarousel();});
    await waitFor(()=>expect(hook.result.current.slides).toHaveLength(5));
    let added=true;
    await act(async()=>{added=await addSlide({headline:"막걸리 한 잔",points:["곁들이기"],source:"text"});});
    expect(added).toBe(false);
    expect(hook.result.current.slides).toHaveLength(5);
  });
});
