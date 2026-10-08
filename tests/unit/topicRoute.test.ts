// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const generateJson = vi.hoisted(() => vi.fn());

vi.mock("@/features/auth/guard", () => ({ ownerApiError: async () => null }));
vi.mock("@/features/settings/repository", () => ({ readSettings: async () => ({ textAiProvider:"automatic" }) }));
vi.mock("server-only", () => ({}));

vi.mock("@/lib/ai/geminiClient", () => ({
  createGeminiClient: () => ({ generateJson }),
}));

import { POST } from "@/app/api/topics/route";
import { topicAnglesForRound } from "@/features/topics/service";
import { RATE_LIMITED_COOLDOWN_SECONDS, TOPIC_REFRESH_GAP_SECONDS, resetTopicPace } from "@/features/topics/refreshPace";
import { TextAiHttpError } from "@/lib/ai/errors";

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
    // 추천 간격 기록은 테스트마다 비운다(연달아 부르면 간격 규칙에 걸린다).
    resetTopicPace();
    generateJson.mockReset().mockImplementation(async (_prompt, schema) => schema.parse(topics));
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
    // 회차마다 참고 관점(angleHints)이 바뀐다. 따르지 않아도 되는 예시일 뿐 정해진 칸이 아니다.
    expect(prompt).toContain('"angleHints":'+JSON.stringify(topicAnglesForRound(1)));
    expect(prompt).not.toContain('"directions"');
    expect(prompt).toContain("첫 추천 1");
    expect(prompt).toContain("첫 추천 2");
    expect(prompt).toContain("첫 추천 3");
  });

  it("falls back when the AI answer has the wrong shape", async () => {
    // 배열을 그대로 주면 {topics:[…]} 모양이 아니라 읽지 못한다.
    generateJson.mockImplementation(async (_prompt, schema) => schema.parse(topics));
    const response = await POST(new Request("http://localhost/api/topics", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify({storeProfile:{name:"묵동홍어마을"},recommendationRound:1}),
    }));
    const body=await response.json();

    // 오늘 날짜에 시즌 행사가 있으면 맨 앞이 시즌 주제(fallback-season-*)일 수 있다.
    expect(body.topics.filter((topic:{id:string})=>!topic.id.startsWith("fallback-season-")).every((topic:{id:string})=>topic.id.startsWith("fallback-2-"))).toBe(true);
    expect(body.season.name).toMatch(/^(봄|여름|가을|겨울)$/);
  });

  it("passes recently shown titles to the prompt so the same topics do not repeat", async () => {
    await POST(new Request("http://localhost/api/topics", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify({ storeProfile:{ name:"묵동홍어마을" }, recommendationRound:2, recentTitles:["수육에는 왜 김치를 곁들일까?"] }),
    }));
    expect(String(generateJson.mock.calls[0][0])).toContain('"recentTitles":["수육에는 왜 김치를 곁들일까?"]');
  });
  it("asks the screen to wait between refreshes instead of calling the AI again right away", async () => {
    const post = () => POST(new Request("http://localhost/api/topics", { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ storeProfile:{ name:"묵동홍어마을" }, recommendationRound:1, excludeTitles:["지금 보이는 주제"] }) }));
    const first = await (await post()).json();
    expect(first.cooldownSeconds).toBe(TOPIC_REFRESH_GAP_SECONDS);
    const calls = generateJson.mock.calls.length;
    const again = await post();
    expect(again.status).toBe(429);
    const body = await again.json();
    expect(body).toMatchObject({ paced:true });
    expect(body.cooldownSeconds).toBeGreaterThan(0);
    expect(body.cooldownSeconds).toBeLessThanOrEqual(TOPIC_REFRESH_GAP_SECONDS);
    // 기다리라는 답에는 AI를 부르지 않는다.
    expect(generateJson.mock.calls.length).toBe(calls);
  });

  it("waits a full minute after the AI hit its per-minute limit", async () => {
    generateJson.mockRejectedValue(new TextAiHttpError("Gemini", 429));
    const response = await POST(new Request("http://localhost/api/topics", { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ storeProfile:{ name:"묵동홍어마을" }, recommendationRound:1 }) }));
    const body = await response.json();
    expect(body.source).toBe("fallback");
    expect(body.cooldownSeconds).toBe(RATE_LIMITED_COOLDOWN_SECONDS);
  });
});
