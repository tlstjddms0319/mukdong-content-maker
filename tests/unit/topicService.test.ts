// @vitest-environment node
import { describe, expect, it } from "vitest";
import { suggestTopics } from "@/features/topics/service";
import { TopicSuggestionSchema } from "@/features/topics/schema";

const input = { intent: "", storeName: "묵동홍어마을" };

describe("topic service", () => {
  it("normalizes numeric Gemini ids", () => {
    expect(TopicSuggestionSchema.parse({ id:1, title:"주제", summary:"설명", reason:"이유", audience:"A", imageBrief:"사진" }).id).toBe("1");
  });
  it("uses valid Gemini suggestions when connected", async () => {
    const topics = Array.from({ length:3 }, (_, index) => ({
      id:`gemini-${index}`, title:["수육 옆에는 왜 김치가 있을까?","같은 회인데 왜 식감은 다를까?","홍어는 왜 수육이랑 먹을까?"][index], summary:"익숙한 음식의 맛과 식감에 대한 질문에 답하고 홍어를 구체적인 사례로 연결한다.", reason:"이유", audience:(['A','B','C'] as const)[index], imageBrief:"음식 사진",
    }));
    await expect(suggestTopics(input, { suggest:async () => topics })).resolves.toEqual(topics.map(topic=>({...topic,season:""})));
  });

  it("offers two everyday questions and one hongeo question in every offline round", async () => {
    for (let recommendationRound=0; recommendationRound<4; recommendationRound++) {
      const result=await suggestTopics({...input,recommendationRound});
      expect(result.every(topic=>topic.title.endsWith("?"))).toBe(true);
      expect(result.filter(topic=>!/홍어|삼합|묵동홍어마을/.test(topic.title))).toHaveLength(2);
      expect(result.every(topic=>topic.summary.includes("홍어"))).toBe(true);
    }
  });

  it("replaces menu advertising suggestions that miss the curiosity brief", async () => {
    const promotional=Array.from({length:3},(_,index)=>({id:`ad-${index}`,title:`홍어 모임 메뉴 추천 ${index}`,summary:"맛있는 홍어를 홍보합니다.",reason:"방문 유도",audience:"A" as const,imageBrief:"사진"}));
    const result=await suggestTopics(input,{suggest:async()=>promotional});
    expect(result.every(topic=>topic.id.startsWith("fallback-"))).toBe(true);
  });

  it("never repeats excluded titles even when the requested fallback round was already shown", async () => {
    const first=await suggestTopics(input);
    const next=await suggestTopics({...input,excludeTitles:first.map(topic=>topic.title)});
    expect(next.every(topic=>!first.some(previous=>previous.title===topic.title))).toBe(true);
    expect(next).toHaveLength(3);
  });

  it("returns three useful topics when AI is unavailable", async () => {
    const result = await suggestTopics(input, { suggest: async () => { throw new Error("offline"); } });
    expect(result).toHaveLength(3);
    expect(result.every((item) => /A|B|C/.test(item.audience))).toBe(true);
    expect(result.every((item) => item.reason.length > 0)).toBe(true);
  });

  it("uses the next fallback topic round when AI is unavailable", async () => {
    const unavailable = { suggest: async () => { throw new Error("offline"); } };
    const first = await suggestTopics({ ...input, recommendationRound:0 }, unavailable);
    const refreshed = await suggestTopics({ ...input, recommendationRound:1 }, unavailable);

    expect(refreshed.map((item) => item.title)).not.toEqual(first.map((item) => item.title));
    expect(refreshed.every((item) => !first.some((previous) => previous.title === item.title))).toBe(true);
  });

  it("uses the round fallback when AI repeats a visible title", async () => {
    const repeated = Array.from({ length:3 }, (_, index) => ({
      id:`repeat-${index}`,
      title:index === 0 ? "이미 보인 주제" : `새 주제 ${index}`,
      summary:"설명",
      reason:"이유",
      audience:(["A","B","C"] as const)[index],
      imageBrief:"사진",
    }));
    const result = await suggestTopics(
      { ...input, recommendationRound:1, excludeTitles:["이미 보인 주제"] },
      { suggest:async () => repeated },
    );

    expect(result.every((item) => item.title !== "이미 보인 주제")).toBe(true);
    expect(result.every((item) => item.id.startsWith("fallback-2-"))).toBe(true);
  });

  it("uses the round fallback when AI repeats topic ids", async () => {
    const repeatedIds = Array.from({ length:3 }, (_, index) => ({
      id:"same-id",
      title:`서로 다른 주제 ${index + 1}`,
      summary:"설명",
      reason:"이유",
      audience:(["A","B","C"] as const)[index],
      imageBrief:"사진",
    }));
    const result = await suggestTopics(
      { ...input, recommendationRound:1 },
      { suggest:async () => repeatedIds },
    );

    expect(result.every((item) => item.id.startsWith("fallback-2-"))).toBe(true);
  });
});
