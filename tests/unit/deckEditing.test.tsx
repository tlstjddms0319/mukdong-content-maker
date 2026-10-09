// 초안 고치기: 완성된 캐러셀에서 장을 빼고 넣으면 나머지 장의 장 번호가 다시 그려지는지, 구성안·사진 배정이 함께 움직이는지.
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFallbackCarouselPlan } from "@/features/images/carousel";
import { ImageBriefSchema } from "@/features/images/schema";
import { addLibraryPhoto, addSlide, approvedDeck, postTotal, setStoreCardIncluded, swapSlidePhoto, buildPhotoCarousel, deckComplete, deckTotal, ensureGeneration, removeSlide, resetGenerationStore, setActiveSlide, useGenerationState } from "@/features/images/generationStore";

const photo=(n:number)=>`data:image/jpeg;base64,PHOTO${n}`;
const card=(n:number)=>`data:image/jpeg;base64,CARD${n}`;

// 사진 3장으로 5장 캐러셀을 만들어 두고, 이후 요청 본문을 모은다.
async function builtDeck(){
  const plan=createFallbackCarouselPlan({topic:"홍어 한 점",slideCount:5});
  const bodies:Array<Record<string,unknown>>=[];
  let n=0;
  vi.stubGlobal("fetch",vi.fn(async(url:string,init?:RequestInit)=>{
    if(url==="/api/images/plan")return {ok:true,json:async()=>({plan,provider:"gemini"})};
    // 맨 뒤 가게 홍보 카드는 따로 그린다(내용 장 요청 목록에는 세지 않는다).
    if(url==="/api/images/store-card")return {ok:true,json:async()=>({image:card(900)})};
    // 사진이 모자란 장의 AI 장면(사진 참고)은 이 테스트에서 못 그린 것으로 두어, 예전처럼 확대 사진으로 그려지게 한다.
    if(JSON.parse(String(init?.body)).referenceImage)return {ok:false,json:async()=>({message:"이미지 AI 없음"})};
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
    // 카드에는 장 번호만 찍히므로, 번호가 당겨진 뒤 장(3·4번)과 예고 띠가 바뀐 표지(5장 → 4장이라 "넘겨 보세요")만 다시 그린다.
    // 앞쪽 2번 장은 그대로 둔다(예전에는 남은 4장을 모두 다시 그렸다). 고친 캐러셀 표시(deckEdited)를 함께 보낸다.
    expect(bodies.map(body=>[body.slideIndex,body.slideTotal,body.deckEdited])).toEqual([[1,5,true],[3,5,true],[4,5,true]]);
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
    // 첫 요청이 새 장(3번째 자리, 새 사진). 이어서 번호가 밀린 뒤 장(4·5·6번)과 예고 띠가 바뀐 표지만 다시 그린다(2번 장은 그대로).
    expect(bodies[0]).toMatchObject({slideIndex:3,slideTotal:7,deckEdited:true,storeCard:true,photos:[photo(9)]});
    expect(bodies.slice(1).map(body=>body.slideIndex)).toEqual([1,4,5,6]);
    expect(bodies.every(body=>body.slideTotal===7)).toBe(true);
  });

  it("redraws only what changes when a slide is appended at the end or the store card is toggled", async () => {
    const {hook,bodies}=await builtDeck();
    // 맨 뒤(5번 장 뒤)에 한 장: 새 장만 그리고, 표지는 예고 띠(5장 → 6장이라 "넘겨 보세요")가 바뀌어서 다시 그린다. 2~5번 장은 그대로.
    act(()=>setActiveSlide(4));
    await act(async()=>{await addSlide({headline:"다음엔 직접 맛보세요",points:["저장해 두면 편해요"],source:"text",verbatim:true});});
    expect(hook.result.current.slides).toHaveLength(6);
    expect(bodies.map(body=>body.slideIndex)).toEqual([6,1]);
    bodies.length=0;
    // 홍보 카드를 끄면 마지막 내용 장(6번)만 "마지막 장"(가게 명함)이 되어 다시 그린다.
    await act(async()=>{await setStoreCardIncluded(false);});
    expect(bodies.map(body=>[body.slideIndex,body.slideTotal])).toEqual([[6,6]]);
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
    const base=(globalThis.fetch as unknown as ReturnType<typeof vi.fn>).getMockImplementation() as (url:string,init?:RequestInit)=>unknown;
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
  // 구성안 장 수는 3~10장(갈래 게시물은 AI가 4~9장 중 정한다). 그 밖의 장 수는 장을 고친 캐러셀만 받는다.
  it("rejects a total outside 3 to 10 unless the deck was edited", () => {
    expect(ImageBriefSchema.safeParse({...base,slideIndex:2,slideTotal:4}).success).toBe(true);
    expect(ImageBriefSchema.safeParse({...base,slideIndex:2,slideTotal:2}).success).toBe(false);
    expect(ImageBriefSchema.safeParse({...base,slideIndex:2,slideTotal:2,deckEdited:true}).success).toBe(true);
  });
  it("still checks the role order for untouched decks", () => {
    expect(ImageBriefSchema.safeParse({...base,slideIndex:3,slideTotal:5}).success).toBe(false);
    expect(ImageBriefSchema.safeParse({...base,slideIndex:2,slideTotal:5}).success).toBe(true);
  });
});

describe("store promo card", () => {
  afterEach(()=>{vi.unstubAllGlobals();resetGenerationStore();});
  it("adds the store card at the end of the approved deck and numbers content cards n / total+1", async () => {
    const {hook}=await builtDeck();
    await waitFor(()=>expect(hook.result.current.storeCard.image).toBeDefined());
    const state=hook.result.current;
    expect(postTotal(state)).toBe(6);
    expect(approvedDeck(state)).toHaveLength(6);
    expect(approvedDeck(state).at(-1)!.preview).toBe(card(900));
  });
  it("can be switched off, which renumbers the content cards back to n / total", async () => {
    const {hook,bodies}=await builtDeck();
    await act(async()=>{await setStoreCardIncluded(false);});
    const state=hook.result.current;
    expect(approvedDeck(state)).toHaveLength(5);
    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies.every(body=>body.slideTotal===5&&!body.storeCard)).toBe(true);
  });
  // 검수 보고서 A-4: 홍보 카드를 못 그리면 조용히 빠진 채 저장돼, 마지막 장에 "넘겨 보기"가 남았다.
  it("drops the store card when it cannot be drawn and redraws the last content card as the real last card", async () => {
    const plan=createFallbackCarouselPlan({topic:"홍어 한 점",slideCount:5});
    const bodies:Array<Record<string,unknown>>=[];
    let n=0,storeCalls=0;
    vi.stubGlobal("fetch",vi.fn(async(url:string,init?:RequestInit)=>{
      if(url==="/api/images/plan")return {ok:true,json:async()=>({plan,provider:"gemini"})};
      if(url==="/api/images/store-card"){storeCalls++;return {ok:false,json:async()=>({message:"그리기 실패"})};}
      if(JSON.parse(String(init?.body)).referenceImage)return {ok:false,json:async()=>({message:"이미지 AI 없음"})};
      bodies.push(JSON.parse(String(init?.body)));
      return {ok:true,json:async()=>({images:[card(++n)],source:"photo"})};
    }));
    const hook=renderHook(()=>useGenerationState());
    act(()=>{ensureGeneration("fail|5",{topic:"홍어 한 점",slideCount:5});[1,2,3].forEach(i=>addLibraryPhoto({id:`p${i}`,preview:photo(i),name:`사진${i}`}));});
    await act(async()=>{await buildPhotoCarousel();});
    await waitFor(()=>expect(hook.result.current.storeCard.failed).toBe(true));
    await waitFor(()=>expect(hook.result.current.storeCard.pending).toBe(false));
    const state=hook.result.current;
    // 한 번 더 시도한 뒤 뺐다.
    expect(storeCalls).toBe(2);
    expect(state.storeCard.include).toBe(false);
    expect(state.phase).toBe("idle");
    expect(approvedDeck(state)).toHaveLength(5);
    // 처음엔 6장짜리(홍보 카드 포함)로 그렸고, 실패 뒤 5장짜리로 다시 그렸다: 5번 장이 이제 마지막 장이다.
    const redrawn=bodies.filter(body=>body.slideTotal===5&&!body.storeCard);
    expect(redrawn.map(body=>body.slideIndex)).toContain(5);
  });
});

describe("review fixes in the deck", () => {
  afterEach(()=>{vi.unstubAllGlobals();resetGenerationStore();});
  async function build(slideCount:5|10){
    const plan=createFallbackCarouselPlan({topic:"홍어 한 점",slideCount});
    const bodies:Array<Record<string,unknown>>=[];
    let n=0;
    vi.stubGlobal("fetch",vi.fn(async(url:string,init?:RequestInit)=>{
      if(url==="/api/images/plan")return {ok:true,json:async()=>({plan,provider:"gemini"})};
      // 사진 내용 읽기(사진을 글이 맞는 장에 넣기). 여기서는 실패로 두어 올린 순서대로 배치한다.
      if(url==="/api/images/analyze")return {ok:false,json:async()=>({})};
      if(url==="/api/images/store-card")return {ok:true,json:async()=>({image:card(900)})};
      bodies.push(JSON.parse(String(init?.body)));
      return {ok:true,json:async()=>({images:[card(++n)],source:"photo"})};
    }));
    const hook=renderHook(()=>useGenerationState());
    act(()=>{ensureGeneration(`r|${slideCount}`,{topic:"홍어 한 점",slideCount});[1,2,3].forEach(i=>addLibraryPhoto({id:`p${i}`,preview:photo(i),name:`사진${i}`}));});
    await act(async()=>{await buildPhotoCarousel();});
    await waitFor(()=>expect(hook.result.current.slides).toHaveLength(slideCount));
    return {hook,bodies};
  }
  it("does not add the store card to a 10-slide carousel (Instagram allows 10 images)", async () => {
    const {hook,bodies}=await build(10);
    expect(bodies.every(body=>body.slideTotal===10&&!body.storeCard)).toBe(true);
    expect(approvedDeck(hook.result.current)).toHaveLength(10);
  });
  it("swaps the photo on the current slide and redraws only that slide", async () => {
    const {hook,bodies}=await build(5);
    bodies.length=0;
    act(()=>setActiveSlide(1));
    const before=hook.result.current.photoAssignment[1][0];
    const next=(before+1)%3;
    await act(async()=>{await swapSlidePhoto(next);});
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({slideIndex:2,photos:[photo(next+1)]});
    expect(hook.result.current.photoAssignment[1][0]).toBe(next);
  });
  it("never asks the server for the old cover panorama", async () => {
    // 파노라마 고르기는 예전 사진 화면과 함께 없어졌다. 사진 묶음은 늘 평소 디자인으로 그린다.
    const {bodies}=await build(5);
    expect(bodies.every(body=>body.panorama===undefined)).toBe(true);
  });
});
