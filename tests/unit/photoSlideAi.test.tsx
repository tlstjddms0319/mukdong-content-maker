// 장 고치기의 사장님 사진 장: 그 사진을 AI로 다듬거나(source), 그 사진으로 새로 그리거나(dish), 원래 사진으로 되돌린다.
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFallbackCarouselPlan } from "@/features/images/carousel";
import { addLibraryPhoto, buildPhotoCarousel, editSlidePhoto, editSlideText, ensureGeneration, photoSlideOptions, redoSlideKind, resetGenerationStore, restoreSlidePhoto, setActiveSlide, setAiFill, useGenerationState } from "@/features/images/generationStore";

const photo="data:image/jpeg;base64,HONGEO";
const card=(n:number)=>`data:image/jpeg;base64,CARD${n}`;

function stub(){
  const plan=createFallbackCarouselPlan({topic:"홍어회는 왜 결이 보일까?",slideCount:5});
  const bodies:Array<Record<string,unknown>>=[];
  let n=0;
  vi.stubGlobal("fetch",vi.fn(async(url:string,init?:RequestInit)=>{
    if(url==="/api/images/plan")return {ok:true,json:async()=>({plan,provider:"gemini"})};
    if(url==="/api/images/store-card")return {ok:true,json:async()=>({image:card(900)})};
    if(url!=="/api/images/generate")return {ok:false,json:async()=>({})};
    const body=JSON.parse(String(init?.body));bodies.push(body);
    if(body.referenceImage)return {ok:true,json:async()=>({images:[card(100+ ++n)],baseImages:[["data:image/jpeg;base64,BASE"]],source:"ai-edited"})};
    return {ok:true,json:async()=>({images:[card(++n)],source:body.photos?"photo":"design"})};
  }));
  return bodies;
}
async function build(){
  const hook=renderHook(()=>useGenerationState());
  // 내 사진만 쓰기: 사진 1장으로 표지를 그리고 남은 장은 확대·글자 카드(AI 비용 없음).
  act(()=>{ensureGeneration("photo-ai|5",{topic:"홍어회는 왜 결이 보일까?",slideCount:5,track:"photo"});setAiFill(false);addLibraryPhoto({id:"p1",preview:photo,name:"홍어회"});});
  await act(async()=>{await buildPhotoCarousel();});
  await waitFor(()=>expect(hook.result.current.slides).toHaveLength(5));
  act(()=>setActiveSlide(0));
  return hook;
}

describe("owner photo slide in 장 고치기", () => {
  afterEach(()=>{vi.unstubAllGlobals();resetGenerationStore();});

  it("offers AI retouch and redraw even when the post has a single photo", async () => {
    stub();
    const hook=await build();
    expect(hook.result.current.slides[0].source).toBe("photo");
    expect(redoSlideKind(hook.result.current)).toBe("photo");
    expect(photoSlideOptions(hook.result.current)).toEqual({ai:true,swap:false,restore:false});
  });

  it("retouches the same photo with the owner's request and can go back to the original photo", async () => {
    const bodies=stub();
    const hook=await build();
    bodies.length=0;
    await act(async()=>{await editSlidePhoto("retouch","더 밝게");});
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({referenceImage:photo,referenceMode:"source",refinement:"더 밝게",slideIndex:1});
    const edited=hook.result.current;
    expect(edited.slides[0].source).toBe("ai-edited");
    expect(edited.cover?.id).toBe(edited.slides[0].id);
    // 원래 사진 배치는 남겨 두어 되돌릴 수 있다.
    expect(edited.photoAssignment[0]).toEqual([0]);
    expect(redoSlideKind(edited)).toBe("photo");
    expect(photoSlideOptions(edited)).toEqual({ai:true,swap:false,restore:true});

    // 다듬은 장의 글자만 고치면 원래 사진이 아니라 AI 결과 위에 다시 그린다.
    bodies.length=0;
    await act(async()=>{await editSlideText(0,{headline:"결이 이렇게 살아 있어요",points:[]});});
    expect(bodies[0]).toMatchObject({photos:["data:image/jpeg;base64,BASE"],photoKind:"ai"});

    bodies.length=0;
    await act(async()=>{await restoreSlidePhoto();});
    expect(bodies).toHaveLength(1);
    expect(bodies[0].referenceImage).toBeUndefined();
    expect(bodies[0].photos).toEqual([photo]);
    expect(hook.result.current.slides[0].source).toBe("photo");
    expect(photoSlideOptions(hook.result.current).restore).toBe(false);
  });

  it("draws a new scene from the photo for the slide's text", async () => {
    const bodies=stub();
    const hook=await build();
    bodies.length=0;
    await act(async()=>{await editSlidePhoto("redraw");});
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({referenceImage:photo,referenceMode:"dish"});
    expect(bodies[0].refinement).toBeUndefined();
    expect(hook.result.current.slides[0].source).toBe("ai-edited");
    expect(hook.result.current.slides[0].refPhoto).toBe(0);
  });
});
