import { describe, expect, it } from "vitest";
import { LIBRARY_TOPICS, libraryTopicHref } from "@/features/topics/library";

describe("prepared content topics", () => {
  it("offers the approved 12-post mix with complete production notes", () => {
    expect(LIBRARY_TOPICS).toHaveLength(12);
    expect(new Set(LIBRARY_TOPICS.map(card => card.title)).size).toBe(12);
    expect(LIBRARY_TOPICS.reduce<Record<string,number>>((counts,card)=>({...counts,[card.audience]:(counts[card.audience]??0)+1}),{})).toEqual({A:5,B:4,C:3});
    expect(LIBRARY_TOPICS.reduce<Record<string,number>>((counts,card)=>({...counts,[card.format]:(counts[card.format]??0)+1}),{})).toEqual({photo:9,illustration:3});
    for (const card of LIBRARY_TOPICS) {
      expect(card.title.trim().length).toBeGreaterThan(0);
      expect(card.title.length).toBeLessThanOrEqual(120);
      expect(card.intent.trim()).not.toBe("");
      expect(card.imageHint.trim()).not.toBe("");
      expect(card.factCheck.trim()).not.toBe("");
      expect(card.week).toBeGreaterThanOrEqual(1);
      expect(card.week).toBeLessThanOrEqual(4);
    }
  });

  it("starts a draft with its topic, audience and image brief", () => {
    expect(libraryTopicHref({ title:"먹골역에서 찾는 퇴근 후 한 상", audience:"B", imageHint:"외관과 삼합 실제 사진" })).toBe("/?topic=%EB%A8%B9%EA%B3%A8%EC%97%AD%EC%97%90%EC%84%9C+%EC%B0%BE%EB%8A%94+%ED%87%B4%EA%B7%BC+%ED%9B%84+%ED%95%9C+%EC%83%81&audience=B&imageBrief=%EC%99%B8%EA%B4%80%EA%B3%BC+%EC%82%BC%ED%95%A9+%EC%8B%A4%EC%A0%9C+%EC%82%AC%EC%A7%84");
  });
});
