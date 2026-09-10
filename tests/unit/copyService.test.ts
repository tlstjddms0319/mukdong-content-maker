// @vitest-environment node
import { describe, expect, it } from "vitest";
import { regenerateCopyPart } from "@/features/copy/service";
import type { GeneratedCopy } from "@/features/copy/schema";

const current: GeneratedCopy = { topic:"삼합", audience:"A", hook:"처음이라면 삼합부터", information:"세 재료를 한 점에 즐겨보세요.", store_connection:"묵동에서 만나요.", call_to_action:"저장해 두세요.", hashtags:["#홍어"], facts_used:[], facts_to_verify:[], image_disclosure:"AI 이미지" };

describe("copy service", () => {
  it("regenerates hashtags without changing approved copy", async () => {
    const result = await regenerateCopyPart("hashtags", current, { topic:"삼합", audience:"A" }, { regenerate: async () => ["#삼합", "#묵동맛집"] });
    expect(result.hook).toBe(current.hook);
    expect(result.information).toBe(current.information);
    expect(result.hashtags).not.toEqual(current.hashtags);
  });
});
