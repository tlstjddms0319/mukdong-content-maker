// @vitest-environment node
// 3차 점검(2026-10-20 밤) 남은 것: 막연한 표지 부제("정말 그럴까요?"), 오해 재료가 있는데 밋밋한 "왜" 표지를 고르는 것, 글 중심 제목 14자 토막.
import { describe, expect, it, vi } from "vitest";
import { VAGUE_SUBLINE } from "@/features/copy/explain";
import { createFallbackCarouselPlan, type CarouselPlan } from "@/features/images/carousel";
import { slideCopyIssues } from "@/features/images/planReview";
import { rewriteCover } from "@/features/images/copyPolish";
import { TRACK_COPY, trackPromptRules } from "@/features/images/track";

const deck=(cover:{headline:string;subline:string},topic:string):CarouselPlan=>{
  const base=createFallbackCarouselPlan({topic,slideCount:5,track:"text"});
  return {...base,slides:base.slides.map((slide,i)=>i===0?{...slide,...cover}:slide)};
};

describe("vague sublines",()=>{
  it("matches the sublines the evaluator kept flagging and not a concrete twist",()=>{
    for(const vague of ["정말 그럴까요?","냄새의 정체가 궁금해요","노릇한 전과 사발의 비밀","어떻게 어우러질까요?","왜 그럴까요?"])expect(vague,vague).toMatch(VAGUE_SUBLINE);
    for(const good of ["알고 보면 소리 이야기예요","숨 한 번이 차이를 만들어요","찌면 왜 더 강해질까요?","두 번째 점부터 달라져요"])expect(good,good).not.toMatch(VAGUE_SUBLINE);
  });
  it("is flagged by the plan review and told what to write instead",()=>{
    const found=slideCopyIssues(deck({headline:"홍어, 두 번째 점이 첫 점보다 덜 쏜다고?",subline:"정말 그럴까요?"},"홍어는 왜 두 번째 점이 덜 쏠까?"),"text").map(issue=>issue.message).join("\n");
    expect(found).toContain("표지 부제가 막연해요('정말 그럴까요')");
    const fine=slideCopyIssues(deck({headline:"홍어, 두 번째 점이 첫 점보다 덜 쏜다고?",subline:"코가 먼저 지쳐요"},"홍어는 왜 두 번째 점이 덜 쏠까?"),"text").map(issue=>issue.message).join("\n");
    expect(fine).not.toContain("표지 부제가 막연해요");
  });
  it("the plan prompt asks for a concrete twist or question in the subline",()=>{
    const style=trackPromptRules("text").style;
    expect(style).toContain("의외의 사실 한 조각");
    expect(style).toContain('"정말 그럴까요?"');
  });
});

describe("cover rewrite prefers the myth-busting candidate for a plain why cover",()=>{
  it("picks the 오해 깨기 option over the AI's best when myth material exists, and rejects a vague subline",async()=>{
    const topic="막걸리는 왜 흔들어 마시면 맛이 달라질까?";
    const base=createFallbackCarouselPlan({topic,slideCount:5,track:"photo"});
    const plan:CarouselPlan={...base,slides:base.slides.map((slide,i)=>i===0?{...slide,headline:topic,subline:""}:i===1?{...slide,headline:"바닥의 뽀얀 것은 쌀과 효모예요",points:["단맛과 고소함이 여기 있어요"]}:slide)};
    const ai={generate:vi.fn(async()=>({best:1,options:[
      {type:"오해 깨기",headline:"막걸리 바닥의 뽀얀 것, 찌꺼기가 아니라고?",subline:"흔들면 맛이 달라져요"},
      {type:"공감 장면",headline:"막걸리, 흔들어 마시는 이유가 있어요",subline:"왜 그럴까요?"},
    ]}))};
    const {plan:next,hookType}=await rewriteCover(plan,"photo",ai,topic);
    expect(hookType).toBe("오해 깨기");
    expect(next.slides[0].headline).toBe("막걸리 바닥의 뽀얀 것, 찌꺼기가 아니라고?");
  });
});

describe("text-track headlines may take two lines",()=>{
  it("asks the AI for up to 28 characters and no longer flags a 20-character headline",()=>{
    expect(TRACK_COPY.text.headline).toBe(28);
    const base=createFallbackCarouselPlan({topic:"홍어회는 왜 처음 먹을 때 코가 찡할까?",slideCount:5,track:"text"});
    const plan:CarouselPlan={...base,slides:base.slides.map((slide,i)=>i===1?{...slide,headline:"첫 점은 코끝이 먼저 찡하게 올라와요",points:["요소가 암모니아 기체로 바뀌어서예요"]}:slide)};
    expect(slideCopyIssues(plan,"text").filter(issue=>issue.slide===2).map(issue=>issue.message).join("\n")).not.toContain("제목이 14자를 넘어요");
  });
});

// 4차 점검(2026-10-20 밤): 비교 이름이 "같"·"맑은"으로 잡혀 "같에 비해 찜은", "맑은은 ~"이 나왔고, 모범 답안 문장이 다른 주제에 그대로 들어갔다.
describe("fourth-eval regressions",()=>{
  it("never reads '같은 홍어인데' as a compared name and keeps a modifier-only key whole",async()=>{
    const { comparedPair, comparedKeys }=await import("@/features/copy/explain");
    const same=comparedPair("같은 홍어인데 찜은 왜 회보다 향이 더 세게 느껴질까?");
    if(same)expect(same.first).not.toBe("같");
    expect(comparedKeys({first:"맑은 생선탕",second:"홍어애탕"})).toEqual(["맑은생선탕","홍어애탕"]);
    expect(comparedKeys({first:"배다리",second:"지평 막걸리"})).toEqual(["배다리","지평"]);
  });
  it("exemplars are about foods the store does not sell, so copying them cannot pass the menu checks",async()=>{
    const { COPY_EXEMPLARS }=await import("@/features/copy/senses");
    expect(COPY_EXEMPLARS).not.toMatch(/홍어|과메기|막걸리|미나리|묵은지|삼합/);
    expect(COPY_EXEMPLARS).toContain("베끼지 말고 틀만");
  });
});
