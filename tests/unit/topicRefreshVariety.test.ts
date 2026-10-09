// @vitest-environment node
import { describe, expect, it } from "vitest";
import { suggestTopics } from "@/features/topics/service";
import { buildTopicPrompt } from "@/features/topics/prompt";
import { TopicInputSchema } from "@/features/topics/schema";
import { SAME_TOPIC_SIMILARITY, topicSimilarity } from "@/features/topics/topicSimilarity";

// 사장님 지적(2026-10-09): "다른 주제 보기"를 네 번 눌렀는데 과메기·송년회·김장 주제가 말만 바꿔 계속 나왔다.
const shown=["과메기는 왜 10월부터 찬바람이 불면 찾게 될까?","송년회 자리엔 어떤 따뜻한 국물이 좋을까?","김장철 수육 곁들임으로 홍어삼합은 어떤 조화를 만들까?"];
const topic=(id:string,title:string,summary:string)=>({id,title,summary,reason:"이유",audience:"A" as const,imageBrief:"음식 사진"});

describe("other topics really differ", () => {
  it("treats a reworded title as the same topic", () => {
    expect(topicSimilarity("과메기는 왜 11월 찬바람과 함께 찾게 될까?",shown[0])).toBeGreaterThanOrEqual(SAME_TOPIC_SIMILARITY);
    expect(topicSimilarity("송년회 자리엔 어떤 따뜻한 국물이 좋을까?",shown[1])).toBe(1);
    expect(topicSimilarity("미나리전엔 왜 막걸리가 생각날까?",shown[0])).toBeLessThan(SAME_TOPIC_SIMILARITY);
  });

  it("drops AI topics that only reword the topics on screen", async () => {
    const reworded=[
      topic("a","과메기는 왜 11월 찬바람과 함께 찾게 될까?","찬바람이 불 때 과메기를 찾는 이유를 설명하고 과메기로 연결해요."),
      topic("b","송년회 자리엔 어떤 따뜻한 국물이 좋을까?","송년회 자리의 국물 이야기에서 홍어애탕으로 연결해요."),
      topic("c","미나리전엔 왜 막걸리가 생각날까?","비 오는 날 미나리전과 배다리 막걸리가 어울리는 이유를 설명해요."),
    ];
    const result=await suggestTopics({storeName:"묵동홍어마을",intent:"",excludeTitles:shown},{suggest:async()=>reworded});
    const titles=result.map(item=>item.title);
    expect(titles).toContain("미나리전엔 왜 막걸리가 생각날까?");
    for(const title of titles)for(const old of shown)expect(topicSimilarity(title,old),`${title} ~ ${old}`).toBeLessThan(SAME_TOPIC_SIMILARITY);
  });

  it("no longer asks the AI to use every trend word", () => {
    const prompt=buildTopicPrompt(TopicInputSchema.parse({storeName:"묵동홍어마을",excludeTitles:shown}),undefined,[],["과메기 +40%"]);
    expect(prompt).toContain("검색어 주제는 3개 중 최대 2개");
    expect(prompt).not.toContain("최근 주제를 피하라는 규칙보다 이 규칙이 먼저");
  });
});
