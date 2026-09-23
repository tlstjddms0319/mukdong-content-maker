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
      id:`gemini-${index}`, title:`추천 ${index}`, summary:"설명", reason:"이유", audience:(['A','B','C'] as const)[index], imageBrief:"음식 사진",
    }));
    await expect(suggestTopics(input, { suggest:async () => topics })).resolves.toEqual(topics);
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
