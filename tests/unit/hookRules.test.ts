// @vitest-environment node
// 사장님 요청(2026-10-12): "후킹이라는 게 있잖아, 그런 걸 하고 싶다." 첫 장(주제·표지)과 올릴 글 첫 문장이
// 손가락을 멈추게 하는 기준이 없어, 형식만 질문인 막연한 제목("홍어찜은 어떤 맛일까?")도 통과했다.
// 결정: 표지는 질문형과 단정형 반전 문장 둘 다 허용(주제 목록은 질문형), 도전형 말투("알면 고수")는 쓰지 않는다.
import { describe, expect, it } from "vitest";
import { HOOK_RULE } from "@/features/copy/explain";
import { buildTopicPrompt } from "@/features/topics/prompt";
import { topicBasicsProblem } from "@/features/topics/service";
import { trackPromptRules } from "@/features/images/track";
import { buildCopyPrompt } from "@/features/copy/writing";
import { createFallbackCarouselPlan, type CarouselPlan } from "@/features/images/carousel";
import { slideCopyIssues } from "@/features/images/planReview";

describe("hook rule",()=>{
  it("names honest hook types and bans dares and hype",()=>{
    for(const type of ["오해 깨기","의외의 정체","공감 장면","대조"])expect(HOOK_RULE).toContain(type);
    expect(HOOK_RULE).toContain("고수");
    expect(HOOK_RULE).toMatch(/본문에서 답/);
  });
  it("is given to the topic AI, the card AI and the caption AI",()=>{
    expect(buildTopicPrompt({storeName:"묵동홍어마을"})).toContain(HOOK_RULE);
    expect(trackPromptRules("photo").style).toContain(HOOK_RULE);
    const caption=buildCopyPrompt({topic:"홍어는 왜 상하지 않고 삭을까?",audience:"A",slideOutline:["홍어는 왜 상하지 않고 삭을까?","요소가 암모니아로 바뀌어요"]} as never,"medium");
    expect(caption).toContain(HOOK_RULE);
    expect(caption).toContain("표지 제목과 다른 후킹");
  });
  it("lets the cover state a surprising fact, with the question moved to the subline",()=>{
    expect(trackPromptRules("photo").style).toMatch(/단정/);
  });
});

describe("topic titles",()=>{
  const topic=(title:string)=>({id:"x",title,summary:"홍어회를 사례로 삭히는 동안 요소가 암모니아로 바뀌는 원리를 설명합니다.",reason:"이유",audience:"A" as const,imageBrief:"홍어회",season:"",trend:""});
  it("drops dares and hype words",()=>{
    expect(topicBasicsProblem(topic("이거 알면 홍어 고수?"),"묵동홍어마을")).toBe("hype");
    expect(topicBasicsProblem(topic("충격! 홍어의 숨은 비밀?"),"묵동홍어마을")).toBe("hype");
    expect(topicBasicsProblem(topic("홍어는 왜 상하지 않고 삭을까?"),"묵동홍어마을")).toBeUndefined();
  });
});

describe("cover hooks in the card review",()=>{
  function deck(cover:{headline:string;subline?:string},second:string):CarouselPlan {
    const base=createFallbackCarouselPlan({topic:"홍어는 왜 상하지 않고 삭을까?",slideCount:5,track:"photo"});
    const copy=[{...cover,points:[]},{headline:second,points:["요소가 많아 암모니아가 생겨요"]},{headline:"암모니아가 세균을 막아요",points:["다른 세균이 자라기 어려워요"]},{headline:"그래서 향이 강하게 남아요",points:["코로 먼저 느껴져요"]},{headline:"홍어는 상하지 않고 삭아요",points:["홍어회를 묵동홍어마을에서 즐겨 보세요"]}];
    return {...base,slideCount:5,slides:base.slides.slice(0,5).map((slide,i)=>({...slide,...copy[i]}))};
  }
  const messages=(plan:CarouselPlan)=>slideCopyIssues(plan,"photo").map(issue=>`${issue.slide}:${issue.message}`).join("\n");
  it("flags hype, dares and vague covers",()=>{
    expect(messages(deck({headline:"충격! 홍어가 안 썩는 비밀"},"홍어 살엔 요소가 많아요"))).toMatch(/1:.*과장/);
    expect(messages(deck({headline:"이거 알면 홍어 고수예요"},"홍어 살엔 요소가 많아요"))).toMatch(/1:.*도전/);
    expect(messages(deck({headline:"홍어찜은 어떤 맛일까?"},"홍어 살엔 요소가 많아요"))).toMatch(/1:.*막연/);
  });
  it("accepts a statement cover when the subline carries the question, and still checks reasons against it",()=>{
    const ok=messages(deck({headline:"홍어는 썩은 게 아니라 삭은 거예요",subline:"왜 안 상할까요?"},"홍어 살엔 요소가 많아요"));
    expect(ok).not.toMatch(/1:/);
    // 단정형 표지에서도 "왜"는 부제에 있으니, 먹는 법 제목은 여전히 잡는다.
    expect(messages(deck({headline:"홍어는 썩은 게 아니라 삭은 거예요",subline:"왜 안 상할까요?"},"초장에 살짝 찍어 드세요"))).toMatch(/2:.*먹는 법/);
  });
  it("asks a statement cover without a question to put one in the subline",()=>{
    expect(messages(deck({headline:"홍어는 썩은 게 아니라 삭은 거예요",subline:"오늘의 이야기"},"홍어 살엔 요소가 많아요"))).toMatch(/1:.*부제/);
  });
});
