// @vitest-environment node
// 카드 글 품질(2026-10-20): 식감 언어, 역할·독자, 장면 한 줄 + 원인 한 줄, 모범 답안, 실패 경험형 표지, 되풀이·밋밋함 검사.
import { describe, expect, it } from "vitest";
import { COPY_EXEMPLARS, EDITOR_ROLE, SCENE_THEN_CAUSE_RULE, SENSE_RULE, copiesExemplar, hasSenseWord, restatesHeadline } from "@/features/copy/senses";
import { HOOK_RULE } from "@/features/copy/explain";
import { trackPromptRules } from "@/features/images/track";
import { buildCopyPrompt } from "@/features/copy/writing";
import { createFallbackCarouselPlan, type CarouselPlan } from "@/features/images/carousel";
import { slideCopyIssues } from "@/features/images/planReview";

function deck(copy:Array<{headline:string;points:string[]}>,topic:string):CarouselPlan {
  const base=createFallbackCarouselPlan({topic,slideCount:5,track:"photo"});
  return {...base,slideCount:5,slides:base.slides.slice(0,5).map((slide,i)=>({...slide,subline:"",...copy[i]}))};
}
const messages=(plan:CarouselPlan)=>slideCopyIssues(plan,"photo").map(issue=>`${issue.slide}:${issue.message}`).join("\n");

describe("prompts carry the copy-quality rules",()=>{
  it("plan prompt: role, scene-then-cause, sense words, exemplars; hook rule has the failure-experience type",()=>{
    for(const track of ["photo","text"] as const){
      const style=trackPromptRules(track).style;
      for(const rule of [EDITOR_ROLE,SCENE_THEN_CAUSE_RULE,SENSE_RULE,COPY_EXEMPLARS])expect(style).toContain(rule);
    }
    expect(HOOK_RULE).toContain("실패 경험");
    expect(EDITOR_ROLE).toContain("광고 과장은 쓰지 않습니다");
  });
  it("caption prompt: role, sense words, scene-first paragraphs, one invitation",()=>{
    const prompt=buildCopyPrompt({topic:"홍어회는 왜 처음 먹을 때 코가 찡할까?",audience:"A"} as never,"medium");
    expect(prompt).toContain(EDITOR_ROLE);
    expect(prompt).toContain(SENSE_RULE);
    expect(prompt).toContain("장면(한 점 집었을 때");
    expect(prompt).toContain("한 번만 쓰세요");
  });
});

describe("sense words and restatement",()=>{
  it("finds sense words and flat taste talk",()=>{
    expect(hasSenseWord("첫 점은 코끝이 먼저 찡해요")).toBe(true);
    expect(hasSenseWord("좌르르 윤기가 돌아요")).toBe(true);
    expect(hasSenseWord("효소가 전분을 당으로 바꿔요")).toBe(false);
  });
  it("tells a restating point from a cause point",()=>{
    expect(restatesHeadline("끓이는 동안 간의 지방이 국물에 녹아요","지방이 많이 들어 있어요")).toBe(true);
    expect(restatesHeadline("지방이 국물에 녹아요","국물에 지방이 녹아 있어요")).toBe(true);
    expect(restatesHeadline("첫 점은 코끝이 먼저 찡해요","삭는 동안 요소가 암모니아 기체로 바뀌어서예요")).toBe(false);
    // 공통 서술부("코끝을 먼저 자극해요")만 같고 원인이 새로우면 되풀이가 아니다.
    expect(restatesHeadline("삭히는 동안 생기는 향이 코끝을 먼저 자극해요","휘발성 성분이 코끝을 먼저 자극해요")).toBe(false);
  });
  it("catches an exemplar sentence copied into a deck",()=>{
    expect(copiesExemplar("무침은 새콤함이 먼저 오고 찡함은 뒤에 와요")).toBe(true);
    expect(copiesExemplar("무침은 양념의 산미가 향을 덮어요")).toBe(false);
  });
});

describe("plan review catches restated points and sense-less reason slides",()=>{
  it("flags the restating point and the encyclopedia slide, not the exemplar-style slide",()=>{
    const found=messages(deck([
      {headline:"홍어애탕은 왜 국물이 묵직할까?",points:[]},
      {headline:"끓이는 동안 간의 지방이 국물에 들어가요",points:["지방이 많이 들어 있어요"]},
      {headline:"한 숟갈 뜨면 국물이 혀에 걸쭉하게 감겨요",points:["애의 지방이 끓으며 국물에 풀려서예요"]},
      {headline:"보리 새순 풋내가 코끝에 먼저 와요",points:["풋내가 기름진 향을 가려서예요"]},
      {headline:"홍어애탕이 묵직한 건 애의 지방이 풀려서예요",points:[]},
    ],"홍어애탕은 왜 국물이 묵직할까?"));
    expect(found).toContain("2:요점 '지방이 많이 들어 있어요'이 제목을 되풀이해요");
    expect(found).toContain("2:이 장에는 독자가 느끼는 말");
    expect(found).not.toContain("3:이 장에는 독자가 느끼는 말");
    expect(found).not.toContain("3:요점");
  });
  it("lets a text-track comparison headline use two lines and rejects half names",()=>{
    const base=createFallbackCarouselPlan({topic:"맑은 생선탕과 달리 홍어애탕은 왜 국물이 묵직할까?",slideCount:5,track:"text"});
    const plan={...base,slideCount:5,slides:base.slides.slice(0,5).map((slide,i)=>({...slide,subline:"",...[
      {headline:"맑은 생선탕과 달리 홍어애탕은 왜 국물이 묵직할까?",points:[]},
      {headline:"생선탕은 맑고 홍어애탕은 한 숟갈이 걸쭉해요",points:["애의 지방이 끓으며 국물에 풀려서예요"]},
      {headline:"맑은은 맑지만 홍어애탕은 기름져요",points:["겨울엔 기름진 국물이 당겨요"]},
      {headline:"생선탕은 살코기, 홍어애탕은 고소한 간이에요",points:["간의 지방이 열에 녹아서예요"]},
      {headline:"홍어애탕이 묵직한 건 간의 지방 때문이에요",points:[]},
    ][i]}))};
    const found=slideCopyIssues(plan,"text").map(issue=>`${issue.slide}:${issue.message}`).join("\n");
    expect(found).not.toContain("2:제목이 14자를 넘어요");
    expect(found).toContain("3:'맑은은'처럼 꾸밈말만 남긴 반쪽 이름이에요");
  });
});
