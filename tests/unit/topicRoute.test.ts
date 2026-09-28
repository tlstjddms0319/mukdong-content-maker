// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const generateJson = vi.hoisted(() => vi.fn());

vi.mock("@/features/auth/guard", () => ({ ownerApiError: async () => null }));

vi.mock("@/lib/ai/geminiClient", () => ({
  createGeminiClient: () => ({ generateJson }),
}));

import { POST } from "@/app/api/topics/route";

const topics = ["치즈는 익숙한데 다른 발효 음식은 왜 낯설까?", "같은 음식을 먹는데 왜 취향은 갈릴까?", "홍어의 톡 쏘는 향은 어디서 올까?"].map((title,index) => ({
  id:String(index + 1),
  title,
  summary:"익숙한 음식의 향과 식감에 대해 설명한 뒤 홍어를 관련 사례로 연결한다.",
  reason:"이유",
  audience:(["A","B","C"] as const)[index],
  imageBrief:"사진",
}));

describe("topic route", () => {
  beforeEach(() => {
    generateJson.mockReset().mockImplementation(async (_prompt, schema) => schema.parse(topics.map((topic,index) => ({
      ...topic,
      direction:["발효 음식에 대한 궁금증","음식 취향이 갈리는 이유","홍어의 향과 식감"][index],
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
    expect(prompt).toContain("발효 음식에 대한 궁금증");
    expect(prompt).toContain("첫 추천 1");
    expect(prompt).toContain("첫 추천 2");
    expect(prompt).toContain("첫 추천 3");
  });

  it("falls back when Gemini does not use each requested direction", async () => {
    generateJson.mockImplementation(async (_prompt, schema) => schema.parse(topics.map((topic) => ({
      ...topic,
      direction:"발효 음식에 대한 궁금증",
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
