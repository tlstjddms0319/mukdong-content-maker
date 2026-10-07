// 초안 고치기: 완성된 캐러셀에서 장을 빼고 넣으면 나머지 장의 장 번호가 다시 그려지는지, 구성안·사진 배정이 함께 움직이는지.
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFallbackCarouselPlan } from "@/features/images/carousel";
import { ImageBriefSchema } from "@/features/images/schema";
import { addLibraryPhoto, addSlide, buildPhotoCarousel, deckComplete, deckTotal, ensureGeneration, removeSlide, resetGenerationStore, setActiveSlide, useGenerationState } from "@/features/images/generationStore";

const photo=(n:number)=>`data:image/jpeg;base64,PHOTO${n}`;
const card=(n:number)=>`data:image/jpeg;base64,CARD${n}`;

// 사진 3장으로 5장 캐러셀을 만들어 두고, 이후 요청 본문을 모은다.
async function builtDeck(){
  const plan=createFallbackCarouselPlan({topic:"홍어 한 점",slideCount:5});
  const bodies:Array<Record<string,unknown>>=[];
  let n=0;
  vi.stubGlobal("fetch",vi.fn(async(url:string,init?:RequestInit)=>{
    if(url==="/api/images/plan")return {ok:true,json:async()=>({plan,provider:"gemini"})};
    bodies.push(JSON.parse(String(init?.body)));
    return {ok:true,json:async()=>({images:[card(++n)],source:"photo"})};
  }));
  const hook=renderHook(()=>useGenerationState());
  act(()=>{ensureGeneration("deck|5",{topic:"홍어 한 점",slideCount:5});[1,2,3].forEach(i=>addLibraryPhoto({id:`p${i}`,preview:photo(i),name:`사진${i}`}));});
  await act(async()=>{await buildPhotoCarousel();});
  await waitFor(()=>expect(hook.result.current.slides).toHaveLength(5));
  bodies.length=0;
  return {hook,bodies};
}

describe("deck editing", () => {
  afterEach(()=>{vi.unstubAllGlobals();resetGenerationStore();});

  it("removes a slide and redraws the others with the new total", async () => {
    const {hook,bodies}=await builtDeck();
    const removedHeadline=hook.result.current.plan!.slides[2].headline;
    act(()=>setActiveSlide(2));
    await act(async()=>{await removeSlide();});
    const state=hook.result.current;
    expect(state.slides).toHaveLength(4);
    expect(state.plan!.slides).toHaveLength(4);
    expect(state.photoAssignment).toHaveLength(4);
    expect(state.plan!.slides.map(slide=>slide.headline)).not.toContain(removedHeadline);
    expect(deckTotal(state)).toBe(4);
    expect(deckComplete(state)).toBe(true);
    // 남은 4장을 모두 "n / 4"로 다시 그린다. 고친 캐러셀 표시(deckEdited)를 함께 보낸다.
    expect(bodies.map(body=>[body.slideIndex,body.slideTotal,body.deckEdited])).toEqual([[1,4,true],[2,4,true],[3,4,true],[4,4,true]]);
    expect(state.phase).toBe("idle");
    expect(state.approved).toBe(false);
  });

  it("never removes the cover", async () => {
    const {hook,bodies}=await builtDeck();
    act(()=>setActiveSlide(0));
    await act(async()=>{await removeSlide();});
    expect(hook.result.current.slides).toHaveLength(5);
    expect(bodies).toHaveLength(0);
  });

  it("inserts a photo slide after the current one and renumbers the deck", async () => {
    const {hook,bodies}=await builtDeck();
    act(()=>setActiveSlide(1));
    await act(async()=>{await addSlide({headline:"묵은지에 싸 먹어요",points:["한입 크기로 싸요"],source:"photo",verbatim:true,photo:{id:"p9",preview:photo(9),name:"새 사진"}});});
    const state=hook.result.current;
    expect(state.slides).toHaveLength(6);
    expect(state.plan!.slides[2]).toMatchObject({headline:"묵은지에 싸 먹어요",points:["한입 크기로 싸요"],role:"detail"});
    expect(state.photos.map(item=>item.id)).toContain("p9");
    expect(state.photoAssignment[2]).toEqual([state.photos.findIndex(item=>item.id==="p9")]);
    expect(state.activeSlide).toBe(2);
    // 첫 요청이 새 장(3번째 자리, 새 사진), 이어서 나머지 5장을 "n / 6"으로 다시 그린다.
    expect(bodies[0]).toMatchObject({slideIndex:3,slideTotal:6,deckEdited:true,photos:[photo(9)]});
    expect(bodies.slice(1).map(body=>body.slideIndex)).toEqual([1,2,4,5,6]);
    expect(bodies.every(body=>body.slideTotal===6)).toBe(true);
  });

  it("adds a text-only card without photos", async () => {
    const {hook,bodies}=await builtDeck();
    await act(async()=>{await addSlide({headline:"가기 전에 확인해요",points:["처음이라면 덜 삭힌 걸로"],source:"text",verbatim:true});});
    expect(hook.result.current.slides).toHaveLength(6);
    expect(bodies[0].photos).toBeUndefined();
    expect(hook.result.current.plan!.slides[1].layout).toBe("checklist");
  });

  it("reads what the owner typed as a request and lets the AI write the card copy and scene", async () => {
    // 사장님이 겪은 사례: 요청 문장이 카드에 그대로 찍히고 사진은 늘 젓가락으로 홍어를 든 장면이었다.
    const {hook,bodies}=await builtDeck();
    const base=(globalThis.fetch as ReturnType<typeof vi.fn>).getMockImplementation()!;
    vi.stubGlobal("fetch",vi.fn(async(url:string,init?:RequestInit)=>{
      if(url==="/api/images/slide"){
        bodies.push({slideRequest:JSON.parse(String(init?.body))});
        return {ok:true,json:async()=>({draft:{kind:"content",headline:"미나리전엔 막걸리가 짝이에요",points:["바삭한 미나리전을 한 입 먹어요"],visualPrompt:"노릇한 미나리전 접시 옆 막걸리 사발, 손 없음",keywords:["미나리전"]}})};
      }
      return base(url,init);
    }));
    await act(async()=>{await addSlide({headline:"미나리전과 막걸리를 같이 소개해 줘",points:[],source:"text"});});
    const state=hook.result.current;
    expect(bodies[0].slideRequest).toMatchObject({request:"미나리전과 막걸리를 같이 소개해 줘",topic:"홍어 한 점"});
    expect(state.plan!.slides[1].headline).toBe("미나리전엔 막걸리가 짝이에요");
    expect(state.plan!.slides[1].visualPrompt).toContain("미나리전");
    expect(state.slides).toHaveLength(6);
  });

  it("refuses a new slide without a title", async () => {
    const {hook,bodies}=await builtDeck();
    await act(async()=>{await addSlide({headline:"",points:[],source:"text",verbatim:true});});
    expect(hook.result.current.error).toContain("제목");
    expect(bodies).toHaveLength(0);
  });

  it("puts a raw photo into a reopened draft that has no plan", async () => {
    const {result}=renderHook(()=>useGenerationState());
    act(()=>{ensureGeneration("old|5",{topic:"홍어",slideCount:5},[{id:"a",preview:photo(1),source:"photo"},{id:"b",preview:photo(2),source:"photo"}]);});
    expect(deckComplete(result.current)).toBe(true);
    await act(async()=>{await addSlide({headline:"",points:[],source:"raw",photo:{id:"p3",preview:photo(3),name:"사진"}});});
    expect(result.current.slides.map(slide=>slide.preview)).toEqual([photo(1),photo(3),photo(2)]);
    expect(deckTotal(result.current)).toBe(3);
  });
});

describe("image request schema for edited decks", () => {
  const base={topic:"홍어",count:1,styleAnchor:"따뜻한 조명의 홍어 한 상 사진",slide:{...createFallbackCarouselPlan({topic:"홍어",slideCount:5}).slides[1]}};
  it("rejects a 4-card total unless the deck was edited", () => {
    expect(ImageBriefSchema.safeParse({...base,slideIndex:2,slideTotal:4}).success).toBe(false);
    expect(ImageBriefSchema.safeParse({...base,slideIndex:2,slideTotal:4,deckEdited:true}).success).toBe(true);
  });
  it("still checks the role order for untouched decks", () => {
    expect(ImageBriefSchema.safeParse({...base,slideIndex:3,slideTotal:5}).success).toBe(false);
    expect(ImageBriefSchema.safeParse({...base,slideIndex:2,slideTotal:5}).success).toBe(true);
  });
});
