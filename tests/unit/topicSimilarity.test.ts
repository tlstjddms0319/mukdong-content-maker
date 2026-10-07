import { describe, expect, it } from "vitest";
import { SAME_TOPIC_SIMILARITY, topicSimilarity } from "@/features/topics/topicSimilarity";

describe("topic similarity",()=>{
  it("treats a polished title as the same topic and a new story as different",()=>{
    expect(topicSimilarity("과메기는 왜 찬바람이 불면 찾을까?","과메기는 왜 찬바람 불 때 찾을까?")).toBeGreaterThanOrEqual(SAME_TOPIC_SIMILARITY);
    expect(topicSimilarity("미나리전엔 왜 막걸리가 생각날까?","비 오는 날 미나리전엔 왜 막걸리가 생각날까?")).toBeGreaterThanOrEqual(SAME_TOPIC_SIMILARITY);
    expect(topicSimilarity("추천 주제","직접 수정한 주제")).toBeLessThan(SAME_TOPIC_SIMILARITY);
    expect(topicSimilarity("같은 회인데 왜 식감은 다를까?","막걸리와 즐기는 저녁 한 상")).toBeLessThan(SAME_TOPIC_SIMILARITY);
  });
  it("ignores spaces and punctuation and handles one-letter titles",()=>{
    expect(topicSimilarity("홍어 삼합?","홍어삼합")).toBe(1);
    expect(topicSimilarity("가","가")).toBe(1);
    expect(topicSimilarity("가","나")).toBe(0);
  });
});
