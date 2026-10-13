// 자동 만들기 가운데 콘셉트 고르기(generationStore): 구성안 뒤 콘셉트 후보가 둘 이상이면 "choosing"에서 멈추고,
// chooseConcept로 고르면 구성안에 적용해 표지부터 이어서 만든다. 후보가 실사 하나뿐이면 묻지 않고 그대로 만든다.
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFallbackCarouselPlan } from "@/features/images/carousel";
import { chooseConcept, createAutomatically, ensureGeneration, redoSlideKind, resetGenerationStore, setActiveSlide, setImageRetryDelayForTests, useGenerationState } from "@/features/images/generationStore";
import { photoConcept } from "@/features/images/concepts";

const card=(n:number)=>`data:image/jpeg;base64,CARD${n}`;
const meta={id:"d1",topic:"홍어와 가오리는 왜 다르게 먹을까?",audience:"A" as const,imageBrief:"",contentBrief:"",createdAt:"2026-10-13T00:00:00.000Z"};

function stub(conceptOptions:(plan:ReturnType<typeof createFallbackCarouselPlan>)=>unknown[]){
  const plan=createFallbackCarouselPlan({topic:meta.topic,slideCount:5,track:"photo"});
  const generated:Array<Record<string,unknown>>=[];
  let n=0;
  vi.stubGlobal("fetch",vi.fn(async(url:string,init?:RequestInit)=>{
    if(url==="/api/images/plan")return {ok:true,json:async()=>({plan,provider:"gemini"})};
    if(url==="/api/images/concepts")return {ok:true,json:async()=>({options:conceptOptions(plan),recommended:1})};
    if(url==="/api/images/store-card")return {ok:true,json:async()=>({image:card(900)})};
    if(url==="/api/images/generate"){generated.push(JSON.parse(String(init?.body)));return {ok:true,json:async()=>({images:[card(++n)],source:"ai"})};}
    return {ok:false,json:async()=>({})};
  }));
  return {plan,generated};
}

describe("choosing a picture concept while making a post",()=>{
  afterEach(()=>{vi.unstubAllGlobals();resetGenerationStore();});

  it("pauses after the plan when the AI proposed concepts, then draws with the chosen one",async()=>{
    const {plan,generated}=stub(current=>[photoConcept(current),{kind:"character",title:"홍어 vs 가오리 권투",summary:"링 위 대결",reason:"비교 주제",styleNote:"홍어: 마름모 몸 / 가오리: 둥근 몸",
      slides:current.slides.map((slide,i)=>({drawn:i===0,visualPrompt:i===0?"홍어 캐릭터와 가오리 캐릭터가 링 위에서 마주 선 장면":slide.visualPrompt}))}]);
    const hook=renderHook(()=>useGenerationState());
    act(()=>{ensureGeneration("d1|5",{topic:meta.topic,slideCount:5,track:"photo"});});
    await act(async()=>{await createAutomatically(meta);});
    expect(hook.result.current.auto.stage).toBe("choosing");
    expect(hook.result.current.auto.concepts?.options).toHaveLength(2);
    expect(generated).toHaveLength(0);
    await act(async()=>{await chooseConcept(1);});
    await waitFor(()=>expect(generated.length).toBeGreaterThanOrEqual(1));
    expect(hook.result.current.auto.concept).toEqual({kind:"character",title:"홍어 vs 가오리 권투"});
    expect(generated[0].slide).toMatchObject({imageStyle:"character",visualPrompt:"홍어 캐릭터와 가오리 캐릭터가 링 위에서 마주 선 장면"});
    expect(hook.result.current.plan?.slides[1].imageStyle).toBe("photo");
    expect(hook.result.current.plan?.slides[1].visualPrompt).toBe(plan.slides[1].visualPrompt);
  });

  // 이미지 AI가 한 번 실패해도(시간 초과 등) 바로 멈추지 않고 그 장을 한 번 더 그린다(사장님 지적 2026-10-13).
  it("retries a slide once before giving up",async()=>{
    setImageRetryDelayForTests(0);
    const plan=createFallbackCarouselPlan({topic:meta.topic,slideCount:5,track:"photo"});
    let n=0,failedOnce=false,thirdSlideCalls=0;
    vi.stubGlobal("fetch",vi.fn(async(url:string,init?:RequestInit)=>{
      if(url==="/api/images/plan")return {ok:true,json:async()=>({plan,provider:"gemini"})};
      if(url==="/api/images/concepts")return {ok:true,json:async()=>({options:[photoConcept(plan)],recommended:0})};
      if(url==="/api/images/store-card")return {ok:true,json:async()=>({image:card(900)})};
      if(url==="/api/images/generate"){
        const body=JSON.parse(String(init?.body));
        if(body.slideIndex===3)thirdSlideCalls++;
        if(body.slideIndex===3&&!failedOnce){failedOnce=true;return {ok:false,json:async()=>({message:"이미지 생성이 너무 오래 걸려 멈췄어요."})};}
        return {ok:true,json:async()=>({images:[card(++n)],source:"ai"})};
      }
      return {ok:false,json:async()=>({})};
    }));
    const warn=vi.spyOn(console,"warn").mockImplementation(()=>{});
    const hook=renderHook(()=>useGenerationState());
    act(()=>{ensureGeneration("d1|5",{topic:meta.topic,slideCount:5,track:"photo"});});
    await act(async()=>{await createAutomatically(meta);});
    await waitFor(()=>expect(hook.result.current.slides.length).toBe(5));
    // 3장은 한 번 실패한 뒤 자동으로 한 번 더 그려졌다(저장 단계는 이 테스트에서 흉내 내지 않아 그 뒤는 보지 않는다).
    expect(failedOnce).toBe(true);
    expect(thirdSlideCalls).toBe(2);
    expect(hook.result.current.error).not.toContain("너무 오래");
    warn.mockRestore();
  });

  it("falls back to a text card when a slide fails twice, and offers to redraw it with AI",async()=>{
    setImageRetryDelayForTests(0);
    const plan=createFallbackCarouselPlan({topic:meta.topic,slideCount:5,track:"photo"});
    let n=0;const third:Array<Record<string,unknown>>=[];
    vi.stubGlobal("fetch",vi.fn(async(url:string,init?:RequestInit)=>{
      if(url==="/api/images/plan")return {ok:true,json:async()=>({plan,provider:"gemini"})};
      if(url==="/api/images/concepts")return {ok:true,json:async()=>({options:[photoConcept(plan)],recommended:0})};
      if(url==="/api/images/store-card")return {ok:true,json:async()=>({image:card(900)})};
      if(url==="/api/images/generate"){
        const body=JSON.parse(String(init?.body)) as Record<string,unknown>&{slide?:{layout?:string}};
        if(body.slideIndex===3){third.push(body);if(body.slide?.layout!=="browser")return {ok:false,json:async()=>({message:"이미지 생성이 너무 오래 걸려 멈췄어요."})};}
        return {ok:true,json:async()=>({images:[card(++n)],source:body.slide?.layout==="browser"?"design":"ai"})};
      }
      return {ok:false,json:async()=>({})};
    }));
    const warn=vi.spyOn(console,"warn").mockImplementation(()=>{});
    const hook=renderHook(()=>useGenerationState());
    act(()=>{ensureGeneration("d1|5",{topic:meta.topic,slideCount:5,track:"photo"});});
    await act(async()=>{await createAutomatically(meta);});
    await waitFor(()=>expect(hook.result.current.slides.length).toBe(5));
    expect(third.map(body=>(body.slide as {layout?:string}).layout)).toEqual([expect.not.stringMatching(/^browser$/),expect.not.stringMatching(/^browser$/),"browser"]);
    expect(hook.result.current.sceneMisses).toEqual([expect.objectContaining({index:2,photo:-1})]);
    expect(hook.result.current.plan?.slides[2].layout).toBe("browser");
    act(()=>{setActiveSlide(2);});
    expect(redoSlideKind(hook.result.current)).toBe("ai");
    warn.mockRestore();
  });

  it("does not ask when only the photo concept came back",async()=>{
    const {generated}=stub(current=>[photoConcept(current)]);
    renderHook(()=>useGenerationState());
    act(()=>{ensureGeneration("d1|5",{topic:meta.topic,slideCount:5,track:"photo"});});
    await act(async()=>{await createAutomatically(meta);});
    await waitFor(()=>expect(generated.length).toBeGreaterThanOrEqual(1));
    expect(generated[0].slide).toMatchObject({imageStyle:"photo"});
  });
});
