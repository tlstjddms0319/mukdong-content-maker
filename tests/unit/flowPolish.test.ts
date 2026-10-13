// @vitest-environment node
// 흐름 다듬기(점검 7~10회 평가에서 자주 걸린 것): 이유 장끼리 같은 원인 되풀이, 결론이 질문에 답하지 않음, "A와 달리 B는 왜"를 비교로 못 읽음.
import { describe, expect, it } from "vitest";
import { createFallbackCarouselPlan, type CarouselPlan } from "@/features/images/carousel";
import { slideCopyIssues } from "@/features/images/planReview";
import { causeWordsOf, comparedPair } from "@/features/copy/explain";
import { trackPromptRules } from "@/features/images/track";

function deck(copy:Array<{headline:string;points:string[]}>,topic:string):CarouselPlan {
  const base=createFallbackCarouselPlan({topic,slideCount:5,track:"photo"});
  return {...base,slideCount:5,slides:base.slides.slice(0,5).map((slide,i)=>({...slide,subline:"",...copy[i]}))};
}
const messages=(plan:CarouselPlan)=>slideCopyIssues(plan,"photo").map(issue=>`${issue.slide}:${issue.message}`).join("\n");

describe("cause words",()=>{
  it("groups word forms into one cause and ignores generic words",()=>{
    expect(causeWordsOf("삭히는 동안 요소가 암모니아로 분해돼요")).toEqual(["삭힘","요소","암모니아","분해"]);
    expect(causeWordsOf("삭힌 홍어의 성분이 독특해요")).toEqual(["삭힘"]);
    expect(causeWordsOf("열에 콜라겐이 풀려요")).toEqual(["열","콜라겐","풀림"]);
  });
});

describe("repeated causes across reason slides",()=>{
  it("flags a reason slide that only repeats an earlier slide's cause, not one that adds a new cause",()=>{
    const found=messages(deck([
      {headline:"홍어회는 처음 먹을 때 왜 코가 찡할까?",points:[]},
      {headline:"삭히는 동안 요소가 암모니아로 바뀌어요",points:["살 속 요소가 분해돼요"]},
      {headline:"암모니아는 코로 먼저 올라와요",points:["기체라 쉽게 날아올라요"]},
      {headline:"암모니아 향이 톡 쏘는 거예요",points:["요소가 분해된 냄새예요"]},
      {headline:"홍어회가 찡한 건 암모니아 때문이에요",points:[]},
    ],"홍어회는 처음 먹을 때 왜 코가 찡할까?"));
    expect(found).toContain("4:4장은 2장과 같은 원인");
    expect(found).not.toContain("3:3장은");
  });
});

describe("the conclusion answers the question",()=>{
  it("asks for a cause in the conclusion of a why-question deck, but not in a comparison deck",()=>{
    const flat=messages(deck([
      {headline:"홍어찜은 왜 쪄도 살이 쫀득할까?",points:[]},
      {headline:"열에 콜라겐이 젤라틴으로 풀려요",points:["껍질 둘레에 콜라겐이 많아요"]},
      {headline:"연골 뼈가 같이 씹혀요",points:["오독한 식감이 더해져요"]},
      {headline:"식으면 젤라틴이 다시 굳어요",points:["탄력이 달라져요"]},
      {headline:"따뜻한 홍어찜이 제맛이에요",points:[]},
    ],"홍어찜은 왜 쪄도 살이 쫀득할까?"));
    expect(flat).toContain("5:마지막 장은 표지 질문의 답이에요");
    const answered=messages(deck([
      {headline:"홍어찜은 왜 쪄도 살이 쫀득할까?",points:[]},
      {headline:"열에 콜라겐이 젤라틴으로 풀려요",points:["껍질 둘레에 콜라겐이 많아요"]},
      {headline:"연골 뼈가 같이 씹혀요",points:["오독한 식감이 더해져요"]},
      {headline:"식으면 젤라틴이 다시 굳어요",points:["탄력이 달라져요"]},
      {headline:"홍어찜은 콜라겐 덕에 쫀득해요",points:[]},
    ],"홍어찜은 왜 쪄도 살이 쫀득할까?"));
    expect(answered).not.toContain("마지막 장은 표지 질문의 답이에요");
    const comparison=messages(deck([
      {headline:"홍어회는 톡 쏘는데 홍어무침은 왜 덜 쏠까?",points:[]},
      {headline:"홍어회는 암모니아가 그대로, 무침은 식초가 붙잡아요",points:["산이 암모니아를 염으로 바꿔요"]},
      {headline:"홍어회는 살 맛이, 무침은 양념이 먼저예요",points:["고추의 자극이 향을 가려요"]},
      {headline:"홍어회는 쫀득, 무침은 아삭이 섞여요",points:["채소 섬유가 함께 씹혀요"]},
      {headline:"홍어회는 향 그대로, 무침은 식초가 덮어요",points:[]},
    ],"홍어회는 톡 쏘는데 홍어무침은 왜 덜 쏠까?"));
    expect(comparison).not.toContain("마지막 장은 표지 질문의 답이에요");
  });
});

describe("contrast questions are comparisons",()=>{
  it("reads '맑은 생선탕과 달리 홍어애탕은 왜 …' as a pair",()=>{
    expect(comparedPair("맑은 생선탕과 달리 홍어애탕은 왜 국물이 묵직할까?")).toEqual({first:"맑은 생선탕",second:"홍어애탕"});
    expect(comparedPair("생선회와 다르게 홍어회는 어째서 삭혀도 상하지 않을까?")).toEqual({first:"생선회",second:"홍어회"});
  });
  it("tells the plan AI to use a different cause per slide and to answer with the biggest cause",()=>{
    const story=trackPromptRules("photo").story;
    expect(story).toContain("장마다 서로 다른 원인");
    expect(story).toContain("가장 큰 이유(원인 이름)를 넣어");
  });
});
