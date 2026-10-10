// @vitest-environment node
// 사장님 지적(2026-10-10): "치즈는 익숙한데 다른 발효 음식은 왜 낯설까?" 게시물이 표지엔 홍어만 그리고,
// 본문은 낯선 이유 대신 "감칠맛"·"막걸리" 이야기로 흘렀다. 비교 질문·질문의 술어를 지키는지 본다.
import { describe, expect, it, vi } from "vitest";
import { createFallbackCarouselPlan, type CarouselPlan } from "@/features/images/carousel";
import { reviewCarouselPlan, slideCopyIssues, type PlanReview } from "@/features/images/planReview";
import { comparedPair, praisesInsteadOfExplaining } from "@/features/copy/explain";
import { buildImagePrompt, comparisonCoverDirection } from "@/features/images/openaiRequest";

const COVER="치즈는 익숙한데 다른 발효 음식은 왜 낯설까?";
// 실제로 나온 문안(사장님 화면).
function reported():CarouselPlan {
  const base=createFallbackCarouselPlan({topic:COVER,slideCount:5,track:"photo"});
  const copy=[
    {headline:COVER,points:[]},
    {headline:"삭히는 동안 생기는 향이 코끝을 먼저 자극해요",points:["휘발성 성분이 코끝을 먼저 자극해요"]},
    {headline:"씹을수록 퍼지는 진한 감칠맛이 자극을 감싸요",points:["살을 씹을수록 진한 감칠맛이 퍼져요"]},
    {headline:"막걸리의 산미가 강한 자극을 덜어줘요",points:["막걸리의 시원함이 입안을 개운하게 바꿔요"]},
    {headline:"독특한 향과 감각을 이해하면 낯선 음식도 취향이 돼요",points:["묵동홍어마을에서 즐겨 보세요"]},
  ];
  return {...base,slideCount:5,slides:base.slides.slice(0,5).map((slide,i)=>({...slide,...copy[i]}))};
}
const asReview=(plan:CarouselPlan):PlanReview=>({slides:plan.slides.map(slide=>({headline:slide.headline,points:slide.points}))});

describe("comparison questions",()=>{
  it("finds the two compared things",()=>{
    expect(comparedPair(COVER)).toEqual({first:"치즈",second:"다른 발효 음식"});
    expect(comparedPair("과메기는 잘 먹는데 홍어는 왜 어려울까?")).toEqual({first:"과메기",second:"홍어"});
    expect(comparedPair("비 오는 날 미나리전엔 왜 막걸리가 생각날까?")).toBeUndefined();
  });

  it("flags the reported deck: cheese never comes back, a body card praises taste, a side drink appears",()=>{
    const messages=slideCopyIssues(reported(),"photo").map(issue=>`${issue.slide}:${issue.message}`).join("\n");
    expect(messages).toContain("본문 어느 장도 '치즈'를 다시 꺼내지 않아요");
    expect(messages).toMatch(/3:표지는 왜 낯선지/);
    expect(messages).toMatch(/4:.*'막걸리' 이야기/);
    // 향이 코를 먼저 찌른다는 장은 낯선 이유라 장점 검사에 걸리지 않는다.
    expect(messages).not.toMatch(/2:표지는 왜 낯선지/);
  });

  it("tells a taste brag from an explanation",()=>{
    expect(praisesInsteadOfExplaining("씹을수록 퍼지는 진한 감칠맛이 자극을 감싸요")).toBe(true);
    expect(praisesInsteadOfExplaining("치즈 향은 익숙하지만 홍어 향은 코를 먼저 찔러요")).toBe(false);
  });

  it("puts both foods on the cover image for every image provider",()=>{
    const cover=createFallbackCarouselPlan({topic:COVER,slideCount:5}).slides[0];
    const direction=comparisonCoverDirection({topic:COVER,slide:{...cover,headline:COVER}});
    expect(direction).toContain("치즈 한 접시와 홍어회 한 접시를 같은 크기로 나란히");
    expect(buildImagePrompt({topic:COVER,count:1,aspectRatio:"4:5",slide:{...cover,headline:COVER}} as never)).toContain(direction);
    // 본문 장 그림에는 붙지 않는다.
    expect(comparisonCoverDirection({topic:COVER,slide:{...cover,role:"detail"}})).toBe("");
  });
});

describe("review keeps the slides it fixed",()=>{
  it("takes a fixed slide even when another slide got worse",async()=>{
    const plan=reported();
    const fixed=asReview(plan);
    fixed.slides[3]={headline:"치즈와 달리 홍어 향은 접할 일이 드물어요",points:["어릴 때부터 맡아 본 향이 아니에요"]};
    // 다른 장은 오히려 나빠졌다(상투어).
    fixed.slides[1]={headline:"풍미 가득 향이 코끝을 자극해요",points:plan.slides[1].points};
    const review=vi.fn(async()=>fixed);
    const result=await reviewCarouselPlan(plan,COVER,{review},{track:"photo"});
    expect(result.applied).toBe(true);
    expect(result.plan.slides[3].headline).toBe("치즈와 달리 홍어 향은 접할 일이 드물어요");
    expect(result.plan.slides[1].headline).toBe(plan.slides[1].headline);
    expect(result.after).toBeLessThan(result.before);
    // 남은 문제가 있으면 한 번 더 검수한다.
    expect(review).toHaveBeenCalledTimes(2);
  });
});

describe("conclusion card headline",()=>{
  // 사장님 화면(2026-10-10): 결론 장 제목이 "…잡아주어 배다리 막걸리가…"로 잘려 답이 사라졌다.
  const LONG="산미와 탄산이 전 요리의 느끼함을 잡아주어 배다리 막걸리가 잘 어울려요";
  it("keeps the answer half instead of cutting it with an ellipsis",async()=>{
    const { applyTrack,conclusionTail }=await import("@/features/images/track");
    expect(conclusionTail(LONG,34)).toBe("배다리 막걸리가 잘 어울려요");
    const base=createFallbackCarouselPlan({topic:"비 오는 날 미나리전엔 왜 막걸리가 생각날까?",slideCount:5,track:"photo"});
    const plan={...base,slides:base.slides.map((slide,i)=>i===base.slides.length-1?{...slide,headline:LONG}:slide)};
    const fitted=applyTrack(plan,"photo");
    expect(fitted.slides.at(-1)!.headline).toBe("배다리 막걸리가 잘 어울려요");
    // 본문 장은 예전처럼(답을 지어내지 않고) 줄인다.
    const body={...base,slides:base.slides.map((slide,i)=>i===1?{...slide,headline:LONG}:slide)};
    expect(applyTrack(body,"photo").slides[1].headline.endsWith("…")).toBe(true);
  });

  it("asks the review to drop the repeated reason from a long conclusion",()=>{
    const base=reported();
    const plan={...base,slides:base.slides.map((slide,i)=>i===4?{...slide,headline:LONG}:slide)};
    expect(slideCopyIssues(plan,"photo").some(issue=>issue.slide===5&&issue.message.includes("앞 장의 이유는 빼고"))).toBe(true);
  });
});
