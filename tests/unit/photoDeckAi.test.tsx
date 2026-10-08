// 사진 중심에서 사진이 장보다 적을 때: 남은 장은 같은 사진을 확대만 하지 않고,
// AI가 그 사진(같은 음식)을 참고해 그 장 글에 맞는 새 장면을 그린다. AI를 못 쓰면 예전처럼 확대 사진.
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFallbackCarouselPlan } from "@/features/images/carousel";
import { addLibraryPhoto, buildPhotoCarousel, ensureGeneration, redoSlide, redoSlideKind, resetGenerationStore, setActiveSlide, useGenerationState } from "@/features/images/generationStore";
import { buildImagePrompt } from "@/features/images/openaiRequest";
import { ImageBriefSchema } from "@/features/images/schema";

const photo="data:image/jpeg;base64,MUCHIM";
const card=(n:number)=>`data:image/jpeg;base64,CARD${n}`;

function stub(aiWorks:boolean){
  const plan=createFallbackCarouselPlan({topic:"홍어무침엔 왜 막걸리일까?",slideCount:5});
  const bodies:Array<Record<string,unknown>>=[];
  let n=0;
  vi.stubGlobal("fetch",vi.fn(async(url:string,init?:RequestInit)=>{
    if(url==="/api/images/plan")return {ok:true,json:async()=>({plan,provider:"gemini"})};
    if(url==="/api/images/store-card")return {ok:true,json:async()=>({image:card(900)})};
    if(url!=="/api/images/generate")return {ok:false,json:async()=>({})};
    const body=JSON.parse(String(init?.body));bodies.push(body);
    if(body.referenceImage)return aiWorks?{ok:true,json:async()=>({images:[card(100+ ++n)],baseImages:[["data:image/jpeg;base64,BASE"]],source:"ai-edited"})}:{ok:false,json:async()=>({message:"Higgsfield 크레딧이 부족해요."})};
    return {ok:true,json:async()=>({images:[card(++n)],source:"photo"})};
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

    // "이 장 다시 만들기"도 같은 사진을 참고해 다시 그린다.
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

  it("tells the image AI to keep the dish but build the slide's own scene", () => {
    const plan=createFallbackCarouselPlan({topic:"홍어무침엔 왜 막걸리일까?",slideCount:5}),slide=plan.slides[3],styleAnchor=plan.styleAnchor;
    const prompt=buildImagePrompt(ImageBriefSchema.parse({topic:"홍어무침엔 왜 막걸리일까?",count:1,referenceImage:photo,referenceMode:"dish",slide,styleAnchor,slideIndex:4,slideTotal:5}),true);
    expect(prompt).toContain("음식의 종류, 색, 양념, 썬 모양, 담음새와 그릇은 첨부 사진 그대로");
    expect(prompt).toContain("같은 구도·같은 각도를 반복하지 말 것");
  });
});
