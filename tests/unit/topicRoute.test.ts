// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const generateJson = vi.hoisted(() => vi.fn());

vi.mock("@/features/auth/guard", () => ({ ownerApiError: async () => null }));

vi.mock("@/lib/ai/geminiClient", () => ({
  createGeminiClient: () => ({ generateJson }),
}));

import { POST } from "@/app/api/topics/route";

const topics = ["새 조합", "새 상차림", "새 모임"].map((title,index) => ({
  id:String(index + 1),
  title,
  summary:"설명",
  reason:"이유",
  audience:(["A","B","C"] as const)[index],
  imageBrief:"사진",
}));

describe("topic route", () => {
  beforeEach(() => {
    generateJson.mockReset().mockImplementation(async (_prompt, schema) => schema.parse(topics.map((topic,index) => ({
      ...topic,
      direction:["홍어와 막걸리 조합","상차림 비주얼","함께 나누는 장면"][index],
    }))));
  });

  it("passes the selected round and visible titles into the Gemini prompt", async () => {
    const response = await POST(new Request("http://localhost/api/topics", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify({
        storeProfile:{ name:"묵동홍어마을" },
        recommendationRound:1,
        excludeTitles:["첫 추천 1","첫 추천 2","첫 추천 3"],
      }),
    }));

    expect(response.status).toBe(200);
    const prompt=String(generateJson.mock.calls[0][0]);
    expect(prompt).toContain("홍어와 막걸리 조합");
    expect(prompt).toContain("첫 추천 1");
    expect(prompt).toContain("첫 추천 2");
    expect(prompt).toContain("첫 추천 3");
  });

  it("falls back when Gemini does not use each requested direction", async () => {
    generateJson.mockImplementation(async (_prompt, schema) => schema.parse(topics.map((topic) => ({
      ...topic,
      direction:"홍어와 막걸리 조합",
    }))));
    const response = await POST(new Request("http://localhost/api/topics", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify({storeProfile:{name:"묵동홍어마을"},recommendationRound:1}),
    }));
    const body=await response.json();

    expect(body.topics.every((topic:{id:string})=>topic.id.startsWith("fallback-2-"))).toBe(true);
  });
});
