// 사진 중심에서 사진이 장보다 적을 때: 남은 장은 같은 사진을 확대만 하지 않고,
// AI가 그 사진(같은 음식)을 참고해 그 장 글에 맞는 새 장면을 그린다. AI를 못 쓰면 예전처럼 확대 사진.
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFallbackCarouselPlan } from "@/features/images/carousel";
import { addLibraryPhoto, buildPhotoCarousel, ensureGeneration, redoSlide, redoSlideKind, resetGenerationStore, resumePhotoCarousel, sceneNoticeOf, setActiveSlide, setAiFill, useGenerationState } from "@/features/images/generationStore";
import { buildImagePrompt } from "@/features/images/openaiRequest";
import { ImageBriefSchema } from "@/features/images/schema";

const photo="data:image/jpeg;base64,MUCHIM";
const card=(n:number)=>`data:image/jpeg;base64,CARD${n}`;

// mode.ai: 이미지 AI가 그리는지, mode.failCompose: 이 번호(slideIndex)의 사진 카드를 서버가 못 그린 것으로.
const mode={ai:true,failCompose:0};
function stub(aiWorks:boolean){
  mode.ai=aiWorks;mode.failCompose=0;
  const plan=createFallbackCarouselPlan({topic:"홍어무침엔 왜 막걸리일까?",slideCount:5});
  const bodies:Array<Record<string,unknown>>=[];
  let n=0;
  vi.stubGlobal("fetch",vi.fn(async(url:string,init?:RequestInit)=>{
    if(url==="/api/images/plan")return {ok:true,json:async()=>({plan,provider:"gemini"})};
    if(url==="/api/images/store-card")return {ok:true,json:async()=>({image:card(900)})};
    if(url!=="/api/images/generate")return {ok:false,json:async()=>({})};
    const body=JSON.parse(String(init?.body));bodies.push(body);
    if(body.referenceImage)return mode.ai?{ok:true,json:async()=>({images:[card(100+ ++n)],baseImages:[["data:image/jpeg;base64,BASE"]],source:"ai-edited"})}:{ok:false,json:async()=>({message:"Higgsfield 크레딧이 부족해요."})};
    if(body.slideIndex===mode.failCompose)return {ok:false,json:async()=>({message:"카드를 만들지 못했어요."})};
    return {ok:true,json:async()=>({images:[card(++n)],source:body.photos?"photo":"design"})};
  }));
  return bodies;
}
async function build(){
  const hook=renderHook(()=>useGenerationState());
  act(()=>{ensureGeneration("ai-fill|5",{topic:"홍어무침엔 왜 막걸리일까?",slideCount:5,track:"photo"});addLibraryPhoto({id:"p1",preview:photo,name:"홍어무침"});});
  await act(async()=>{await buildPhotoCarousel();});
  await waitFor(()=>expect(hook.result.current.slides).toHaveLength(5));
  return hook;
}

describe("photo deck with too few photos", () => {
  afterEach(()=>{vi.unstubAllGlobals();resetGenerationStore();});

  it("has the AI draw the extra slides from the owner's photo, matching each slide's text", async () => {
    const bodies=stub(true);
    const hook=await build();
    const state=hook.result.current;
    const ai=bodies.filter(body=>body.referenceImage);
    expect(ai.length).toBeGreaterThan(0);
    // 사장님 사진을 참고(같은 음식)하고, 그 장의 글(slide)을 함께 보낸다.
    for(const body of ai){expect(body).toMatchObject({referenceImage:photo,referenceMode:"dish"});expect(body.slide).toBeTruthy();}
    // 표지는 사장님 사진 그대로.
    expect(state.photoAssignment[0]).toEqual([0]);
    expect(state.slides[0].source).toBe("photo");
    // AI가 그린 장은 사진 칸 없이(다시 만들기는 AI로), 참고한 사진 번호를 기억한다. 확대 사진 장은 남지 않는다.
    const aiIndexes=state.slides.flatMap((slide,i)=>slide.source==="ai-edited"?[i]:[]);
    expect(aiIndexes.length).toBe(ai.length);
    for(const i of aiIndexes){expect(state.photoAssignment[i]).toEqual([]);expect(state.slides[i].refPhoto).toBe(0);}
    expect(state.photoViews.flat().filter(view=>view!=="full")).toEqual([]);

    // "장 고치기 → 그림"도 같은 사진을 참고해 다시 그린다.
    act(()=>setActiveSlide(aiIndexes[0]));
    expect(redoSlideKind(hook.result.current)).toBe("ai");
    bodies.length=0;
    await act(async()=>{await redoSlide();});
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({referenceImage:photo,referenceMode:"dish",slideIndex:aiIndexes[0]+1});
  });

  it("falls back to close-up crops of the photo when the image AI cannot draw", async () => {
    stub(false);
    const hook=await build();
    const state=hook.result.current;
    expect(state.slides.every(slide=>slide.source!=="ai-edited")).toBe(true);
    expect(state.photoViews.flat().some(view=>view!=="full")).toBe(true);
    expect(state.error).toBe("");
  });

  // 검수 보고서 B-3: 사진 1장이면 사진을 두 번(가까이·결 확대)까지만 다시 써서, 5장 중 2장이 글자 카드였다.
  it("fills every body slide with an AI scene from a single photo", async () => {
    const bodies=stub(true);
    const hook=await build();
    const state=hook.result.current;
    expect(bodies.filter(body=>body.referenceImage)).toHaveLength(4);
    expect(state.slides.slice(1).every(slide=>slide.source==="ai-edited")).toBe(true);
    expect(state.sceneMisses).toEqual([]);
    expect(sceneNoticeOf(state)).toBe("");
  });

  // 검수 보고서 B-4: AI가 못 그려도 조용히 바뀌어 사장님은 이유를 몰랐다.
  it("tells the owner which slides the AI could not draw and why, and redraws one with the AI on request", async () => {
    stub(false);
    const hook=await build();
    let state=hook.result.current;
    expect(state.sceneMisses.map(miss=>miss.index)).toEqual([1,2,3,4]);
    expect(sceneNoticeOf(state)).toContain("AI 그림 4장");
    expect(sceneNoticeOf(state)).toContain("Higgsfield 크레딧이 부족해요.");
    // 사진을 세 번 넘게 쓰는 자리는 확대 사진이 앞 장과 똑같아지므로 글자 카드(사진 없는 장)로 그린다.
    const zoomed=state.photoViews.flatMap((views,i)=>views.some(view=>view!=="full")?[i]:[]);
    expect(zoomed).toHaveLength(2);
    const text=[1,2,3,4].filter(i=>!zoomed.includes(i));
    for(const i of text){expect(state.photoAssignment[i]).toEqual([]);expect(state.plan!.slides[i].layout).toBe("browser");expect(state.slides[i].source).toBe("design");}
    // 글자 카드로 바뀐 장에서 "장 고치기 → 그림" → 같은 사진을 참고해 원래 모양(사진 장)으로 AI가 다시 그린다.
    mode.ai=true;
    act(()=>setActiveSlide(text[0]));
    expect(redoSlideKind(hook.result.current)).toBe("scene");
    await act(async()=>{await redoSlide();});
    state=hook.result.current;
    expect(state.slides[text[0]].source).toBe("ai-edited");
    expect(state.plan!.slides[text[0]].layout).toBe("frame");
    expect(state.sceneMisses.map(miss=>miss.index)).not.toContain(text[0]);
    expect(sceneNoticeOf(state)).toContain("AI 그림 3장");
  });

  it("keeps AI scenes already drawn when a stopped photo deck is resumed", async () => {
    const bodies=stub(true);
    mode.failCompose=1;
    const hook=renderHook(()=>useGenerationState());
    act(()=>{ensureGeneration("ai-resume|5",{topic:"홍어무침엔 왜 막걸리일까?",slideCount:5,track:"photo"});addLibraryPhoto({id:"p1",preview:photo,name:"홍어무침"});});
    await act(async()=>{await buildPhotoCarousel();});
    // 표지(사진 카드)를 못 그려 멈췄다. 그사이 함께 그리던 AI 장은 이미 그렸다.
    expect(hook.result.current.slides).toHaveLength(0);
    const drawn=bodies.filter(body=>body.referenceImage).length;
    expect(drawn).toBeGreaterThan(0);
    mode.failCompose=0;
    await act(async()=>{await resumePhotoCarousel();});
    await waitFor(()=>expect(hook.result.current.slides).toHaveLength(5));
    // 다시 해 보기에서 이미 그린 AI 장은 다시 그리지 않는다(이미지 AI 비용이 두 번 들지 않게). 본문 4장 = AI 호출 4번.
    expect(bodies.filter(body=>body.referenceImage)).toHaveLength(4);
  });

  // 손님 의견: AI 음식 그림은 거부감이 든다. "내 사진만 쓰기"를 고르면 AI를 부르지 않는다(고른 값은 기억한다).
  it("uses only the owner's photo (close-ups, then text cards) when 'my photos only' is chosen, and remembers it", async () => {
    localStorage.clear();
    const bodies=stub(true);
    const hook=renderHook(()=>useGenerationState());
    act(()=>{ensureGeneration("only-photos|5",{topic:"홍어무침엔 왜 막걸리일까?",slideCount:5,track:"photo"});addLibraryPhoto({id:"p1",preview:photo,name:"홍어무침"});setAiFill(false);});
    expect(localStorage.getItem("mukdong-ai-fill")).toBe("photos-only");
    await act(async()=>{await buildPhotoCarousel();});
    await waitFor(()=>expect(hook.result.current.slides).toHaveLength(5));
    const state=hook.result.current;
    expect(bodies.filter(body=>body.referenceImage)).toHaveLength(0);
    expect(state.slides.every(slide=>slide.source!=="ai-edited")).toBe(true);
    // 사진 한 장: 표지 + 가까이·결 확대 두 장, 나머지 두 장은 글자 카드.
    expect(state.photoViews.flat().filter(view=>view!=="full")).toHaveLength(2);
    expect(state.slides.filter(slide=>slide.source==="design")).toHaveLength(2);
    expect(state.sceneMisses).toEqual([]);
    // 새 게시물에서도 기억한다.
    act(()=>{resetGenerationStore();ensureGeneration("next|5",{topic:"과메기",slideCount:5,track:"photo"});});
    expect(hook.result.current.aiFill).toBe(false);
    act(()=>setAiFill(true));
    localStorage.clear();
  });

  it("tells the image AI to keep the dish but build the slide's own scene", () => {
    const plan=createFallbackCarouselPlan({topic:"홍어무침엔 왜 막걸리일까?",slideCount:5}),slide=plan.slides[3],styleAnchor=plan.styleAnchor;
    const prompt=buildImagePrompt(ImageBriefSchema.parse({topic:"홍어무침엔 왜 막걸리일까?",count:1,referenceImage:photo,referenceMode:"dish",slide,styleAnchor,slideIndex:4,slideTotal:5}),true);
    expect(prompt).toContain("음식의 종류, 색, 양념, 썬 모양, 담음새와 그릇은 첨부 사진 그대로");
    expect(prompt).toContain("같은 구도·같은 각도를 반복하지 말 것");
  });
});
