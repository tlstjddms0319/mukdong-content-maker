// @vitest-environment node
// 사장님 지적(2026-10-12): "배다리 막걸리와 지평막걸리의 맛의 차이점은 어디서 오는건가?" 게시물이
// "쌀과 밀의 배합 비율이 달라요"(어떻게?), "발효 방식과 누룩이 맛을 깊게해요"(무엇이 어떻게 다른데?),
// "탄산의 청량감이 목넘김을 바꿔요"(둘 다 같은 점), "곡물 비율과 발효가 맛을 갈라놓아요"(그래서 어떻게 다른데?)로 흘렀다.
// "A와 B의 차이" 꼴은 비교 질문으로 알아보지도 못했고, 비교 규칙은 "나란히 놓고 차이를 설명"뿐이었다.
import { describe, expect, it } from "vitest";
import { createFallbackCarouselPlan, type CarouselPlan } from "@/features/images/carousel";
import { slideCopyIssues } from "@/features/images/planReview";
import { COMPARISON_RULE, comparedPair } from "@/features/copy/explain";
import { buildTopicPrompt } from "@/features/topics/prompt";

const COVER="배다리 막걸리와 지평막걸리의 맛의 차이점은 어디서 오는 걸까?";
function deck(copy:Array<{headline:string;points:string[]}>):CarouselPlan {
  const base=createFallbackCarouselPlan({topic:COVER,slideCount:5,track:"photo"});
  return {...base,slideCount:5,slides:base.slides.slice(0,5).map((slide,i)=>({...slide,...copy[i]}))};
}

describe("A와 B의 차이 questions",()=>{
  it("are read as comparisons, without catching ordinary why-questions",()=>{
    expect(comparedPair(COVER)).toEqual({first:"배다리 막걸리",second:"지평막걸리"});
    expect(comparedPair("홍어무침과 홍어회는 무엇이 다를까?")).toEqual({first:"홍어무침",second:"홍어회"});
    expect(comparedPair("과메기랑 홍어회는 뭐가 다를까?")).toEqual({first:"과메기",second:"홍어회"});
    expect(comparedPair("홍어전과 홍어찜의 차이는 뭘까?")).toEqual({first:"홍어전",second:"홍어찜"});
    // 결과물 점검(2026-10-12)에서 나온 표지: 쉼표가 이름에 붙어 "홍어라면,"를 본문에서 못 찾았다.
    expect(comparedPair("해물라면과 홍어라면, 무엇이 다를까?")).toEqual({first:"해물라면",second:"홍어라면"});
    // 예전 꼴도 그대로.
    expect(comparedPair("치즈는 익숙한데 다른 발효 음식은 왜 낯설까?")).toEqual({first:"치즈",second:"다른 발효 음식"});
    for(const plain of ["홍어는 왜 수육이랑 먹을까?","같은 회인데 왜 식감은 다를까?","같은 음식을 먹는데 왜 취향은 갈릴까?","미나리전엔 왜 막걸리가 생각날까?","막걸리 한 잔엔 어떤 안주가 어울릴까?"])
      expect(comparedPair(plain),plain).toBeUndefined();
  });
});

describe("comparison decks must say how each side differs",()=>{
  it("flags the reported deck: one-sided reasons, 'they differ' without how, and a conclusion without the two names",()=>{
    const issues=slideCopyIssues(deck([
      {headline:COVER,points:[]},
      {headline:"쌀과 밀의 배합 비율이 달라요",points:["곡물 비율에 따라 단맛이 달라져요"]},
      {headline:"발효 방식과 누룩이 맛을 깊게 해요",points:["누룩이 향을 더해요"]},
      {headline:"탄산의 청량감이 목넘김을 바꿔요",points:["톡 쏘는 탄산이 시원해요"]},
      {headline:"곡물 비율과 발효가 맛을 갈라놓아요",points:["막걸리를 묵동홍어마을에서 즐겨 보세요"]},
    ]),"photo");
    const messages=issues.map(issue=>`${issue.slide}:${issue.message}`).join("\n");
    for(const slide of [2,3,4])expect(messages).toMatch(new RegExp(`${slide}:.*'배다리'.*'지평'`));
    // 안내 예시의 조사도 이름에 맞춘다("배다리는 ~, 지평은 ~").
    expect(messages).toContain('"배다리는 ~, 지평은 ~"');
    expect(messages).toMatch(/2:.*'쌀과 밀의 배합 비율이 달라요'.*다르다고만/);
    expect(messages).toMatch(/5:.*결론/);
  });

  it("accepts a deck where every reason names both sides and the conclusion says the difference",()=>{
    const issues=slideCopyIssues(deck([
      {headline:"홍어무침과 홍어회는 무엇이 다를까?",points:[]},
      {headline:"홍어회는 향부터 코에 닿아요",points:["무침은 새콤한 양념 맛이 먼저예요"]},
      {headline:"홍어회는 쫀득, 무침은 꼬들해요",points:["무침은 양념에 버무려 더 단단해요"]},
      {headline:"둘 다 홍어 날개 살로 만들어요",points:["홍어회와 무침 모두 연골이 씹혀요"]},
      {headline:"홍어회는 향, 무침은 양념이 먼저",points:["새콤한 쪽이 좋으면 무침이에요"]},
    ]),"photo");
    expect(issues).toEqual([]);
  });
});

describe("comparison rule wording",()=>{
  it("asks for both sides per criterion, keeps shared traits out, and never invents brand recipes",()=>{
    expect(COMPARISON_RULE).toContain("A는 ~, B는 ~");
    expect(COMPARISON_RULE).toContain("둘 다");
    expect(COMPARISON_RULE).toContain("원재료 표시");
    expect(COMPARISON_RULE).toMatch(/지어내거나 흐리게/);
  });
  it("is part of the topic prompt so comparison topics name a criterion that can be answered",()=>{
    const prompt=buildTopicPrompt({storeName:"묵동홍어마을"});
    expect(prompt).toMatch(/비교 주제/);
    expect(prompt).toMatch(/비교 기준/);
  });
});

// 사장님 지적(2026-10-12): "홍어찜은 왜 따뜻하게 먹을까", "생선은 찌면 맛이 어떻게 달라질까?", "홍어를 처음 먹는다면 한입에
// 얼마나 올릴까?"처럼 답이 뻔하거나 원리 없는 주제 대신, 과학적 근거로 답하는 "왜" 질문을 원한다.
describe("topics ask why, with a reason that needs explaining",()=>{
  it("tells the topic AI to drop obvious questions and to write the reason into the summary",()=>{
    const prompt=buildTopicPrompt({storeName:"묵동홍어마을"});
    expect(prompt).toContain("답이 뻔하거나 독자가 이미 아는 질문은 버리세요");
    expect(prompt).toContain("생선은 찌면 왜 맛과 식감이 달라질까?");
    expect(prompt).toContain("근거를 한 문장으로 적을 수 없는 주제는 버리세요");
  });
  it("keeps no prepared topic that only asks 'what is it like', 'how much' or 'which one'",async()=>{
    const { preparedTopicTitles }=await import("@/features/topics/service");
    const titles=preparedTopicTitles();
    expect(titles.length).toBeGreaterThan(20);
    for(const title of titles)expect(title,title).not.toMatch(/어떤 (?:맛|국물|음식|안주)|어떻게 달라|얼마나|따뜻하게 먹을까/);
    expect(titles).toContain("생선은 찌면 왜 맛과 식감이 달라질까?");
  });
});
