// 내 게시물에서 다시 연 게시물도 장별로 고칠 수 있게: 저장할 때 만들기 상태(구성안·밑바탕)를 함께 담고, 다시 열 때 되살린다.
// 예전에는 완성된 카드 그림만 저장해서 다시 열면 장 고치기·글자 고치기가 사라졌다(사장님 제보 2026-10-09).
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFallbackCarouselPlan } from "@/features/images/carousel";
import { addLibraryPhoto, approvedDeck, buildPhotoCarousel, canEditSlideText, ensureGeneration, redoSlideKind, resetGenerationStore, studioSnapshotOf, useGenerationState } from "@/features/images/generationStore";
import { StudioSnapshotSchema } from "@/features/drafts/studio";

const photo=(n:number)=>`data:image/jpeg;base64,PHOTO${n}`;
const card=(n:number)=>`data:image/jpeg;base64,CARD${n}`;

async function builtDeck(){
  const plan=createFallbackCarouselPlan({topic:"홍어 한 점",slideCount:5,track:"photo"});
  let n=0;
  vi.stubGlobal("fetch",vi.fn(async(url:string,init?:RequestInit)=>{
    if(url==="/api/images/plan")return {ok:true,json:async()=>({plan,provider:"gemini"})};
    if(url==="/api/images/store-card")return {ok:true,json:async()=>({image:card(900)})};
    if(url!=="/api/images/generate")return {ok:false,json:async()=>({})};
    const body=JSON.parse(String(init?.body));
    // 사진을 참고한 AI 장면은 AI 원본(밑바탕)을 함께 돌려준다.
    if(body.referenceImage)return {ok:true,json:async()=>({images:[card(100+ ++n)],baseImages:[[`data:image/jpeg;base64,BASE${n}`]],source:"ai-edited"})};
    return {ok:true,json:async()=>({images:[card(++n)],source:"photo"})};
  }));
  const hook=renderHook(()=>useGenerationState());
  act(()=>{ensureGeneration("d1|5",{topic:"홍어 한 점",slideCount:5,track:"photo"});[1,2].forEach(i=>addLibraryPhoto({id:`p${i}`,preview:photo(i),name:`사진${i}`}));});
  await act(async()=>{await buildPhotoCarousel();});
  await waitFor(()=>expect(hook.result.current.storeCard.image).toBeDefined());
  return hook;
}

describe("reopening a saved post keeps per-slide editing", () => {
  afterEach(()=>{vi.unstubAllGlobals();resetGenerationStore();});
  it("saves the plan and each slide's base, and restores them for the same saved pictures", async () => {
    const hook=await builtDeck();
    const live=hook.result.current;
    const snapshot=studioSnapshotOf(live)!;
    expect(StudioSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(snapshot.slides).toHaveLength(5);
    expect(snapshot.storeCard).toBe(true);
    expect(snapshot.slides.some(slide=>slide.bases?.length)).toBe(true);
    // 저장된 그림만 들고 다시 연다(내 게시물 → 수정): 홍보 카드까지 6장.
    const saved=approvedDeck(live).map(image=>({id:image.id,preview:image.preview,source:image.source}));
    const json=JSON.parse(JSON.stringify(snapshot));
    act(()=>{resetGenerationStore();ensureGeneration("d1|5",{topic:"홍어 한 점",slideCount:5,track:"photo"},saved,json);});
    const reopened=hook.result.current;
    expect(reopened.plan?.slides.map(slide=>slide.headline)).toEqual(live.plan!.slides.map(slide=>slide.headline));
    expect(reopened.slides).toHaveLength(5);
    expect(approvedDeck(reopened)).toHaveLength(6);
    for(let i=0;i<5;i++)expect(canEditSlideText(reopened,i),`slide ${i+1}`).toBe(true);
    // 그림 고치기도 된다: AI 장은 AI로, 사장님 사진 장은 다른 사진으로.
    const kinds=reopened.slides.map((_,i)=>redoSlideKind({...reopened,activeSlide:i}));
    expect(kinds).toContain("ai");
    expect(kinds.every(kind=>kind!==null)).toBe(true);
  });
  it("opens only the pictures, as before, when the saved state does not match them", async () => {
    const hook=await builtDeck();
    const snapshot=JSON.parse(JSON.stringify(studioSnapshotOf(hook.result.current)));
    const fewer=approvedDeck(hook.result.current).slice(0,3).map(image=>({id:image.id,preview:image.preview,source:image.source}));
    act(()=>{resetGenerationStore();ensureGeneration("d1|5",{topic:"홍어 한 점",slideCount:5},fewer,snapshot);});
    expect(hook.result.current.plan).toBeUndefined();
    expect(canEditSlideText(hook.result.current,0)).toBe(false);
  });
});
