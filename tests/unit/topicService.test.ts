// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { isOtherMenuTopic, suggestTopics } from "@/features/topics/service";
import { menuOf } from "@/features/store/menu";
import { TopicSuggestionSchema } from "@/features/topics/schema";

const input = { intent: "", storeName: "묵동홍어마을" };

describe("topic service", () => {
  it("normalizes numeric Gemini ids", () => {
    expect(TopicSuggestionSchema.parse({ id:1, title:"주제", summary:"설명", reason:"이유", audience:"A", imageBrief:"사진" }).id).toBe("1");
  });
  it("uses valid Gemini suggestions when connected", async () => {
    const topics = Array.from({ length:3 }, (_, index) => ({
      id:`gemini-${index}`, title:["미나리전엔 왜 막걸리가 생각날까?","같은 홍어회인데 왜 식감은 다를까?","홍어애탕은 어떤 국물일까?"][index], summary:index===0?"비 오는 날 미나리전과 배다리 막걸리를 곁들이는 장면에서 시작해 어울리는 이유를 단정하지 않고 소개한다.":"익숙한 음식의 맛과 식감에 대한 질문에 답하고 홍어를 구체적인 사례로 연결한다.", reason:"이유", audience:(['A','B','C'] as const)[index], imageBrief:"음식 사진",
    }));
    await expect(suggestTopics(input, { suggest:async () => topics })).resolves.toEqual(topics.map(topic=>({...topic,season:"",trend:""})));
  });

  // 사장님 결정(2026-10-21): '했던 주제'는 거르지 않는다. 피할 목록에 있는 제목이 와도 그대로 쓰고, 다시 묻지 않는다.
  it("accepts AI topics that match the avoid list and does not ask again", async () => {
    const titled=(titles:string[],prefix:string)=>titles.map((title,index)=>({ id:`${prefix}-${index}`, title, summary:"홍어무침은 식초의 산이 암모니아를 붙잡아 향이 덜 느껴지고, 과메기는 찬바람에 얼었다 녹기를 되풀이하며 마릅니다. 확인된 원리로 설명합니다.", reason:"이유", audience:"A" as const, imageBrief:"사진", season:"", trend:"" }));
    const stale=["과메기는 왜 냉동실이 아니라 찬바람에 말려야 할까?","홍어무침은 채소에서 왜 물이 많이 생기지 않을까?","생선회와 달리 홍어회는 왜 삭혀도 상하지 않을까?"];
    const suggest=vi.fn(async () => titled(stale,"a"));
    const fallback=vi.fn();
    const result=await suggestTopics({...input,avoidTitles:stale},{suggest},fallback);
    expect(suggest).toHaveBeenCalledTimes(1);
    expect(result.map(topic=>topic.title)).toEqual(stale);
    expect(fallback).not.toHaveBeenCalled();
  });

  it("offers three question topics with distinct menus, at least one beyond hongeo and samhap, in every offline round", async () => {
    for (let recommendationRound=0; recommendationRound<4; recommendationRound++) {
      const result=await suggestTopics({...input,recommendationRound});
      expect(result.every(topic=>topic.title.endsWith("?"))).toBe(true);
      expect(result.some(topic=>topic.title.includes("묵동홍어마을"))).toBe(false);
      // 모든 주제가 가게 메뉴로 이어지고, 최소 하나는 홍어회·삼합이 아닌 메뉴(과메기·미나리전·막걸리·애탕·무침)다.
      expect(result.every(topic=>menuOf(topic.summary).length>0)).toBe(true);
      expect(result.some(isOtherMenuTopic)).toBe(true);
      // 삼합은 한 묶음에 최대 하나.
      expect(result.filter(topic=>/삼합|수육/.test(topic.title+topic.summary)).length).toBeLessThanOrEqual(1);
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
