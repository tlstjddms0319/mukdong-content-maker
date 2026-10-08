// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const generateJson = vi.hoisted(() => vi.fn());
const readSettings = vi.hoisted(() => vi.fn(async () => ({ textAiProvider:"automatic" })));
vi.mock("@/features/auth/guard", () => ({ ownerApiError: async () => null }));
vi.mock("@/features/settings/repository", () => ({ readSettings }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/geminiClient", () => ({ createGeminiClient: () => ({ generateJson }) }));
import { POST } from "@/app/api/topics/route";
import { resetTopicPace } from "@/features/topics/refreshPace";

const call = () => POST(new Request("http://localhost/api/topics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ storeProfile: { name: "묵동홍어마을" }, recommendationRound: 0 }) }));

describe("topic source reporting", () => {
  beforeEach(() => { resetTopicPace(); generateJson.mockReset(); readSettings.mockReset(); readSettings.mockImplementation(async () => ({ textAiProvider:"automatic" })); vi.restoreAllMocks(); });
  it("marks fallback topics and logs why Gemini was not used", async () => {
    generateJson.mockRejectedValue(new Error("Gemini API 오류 (429)"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const body = await (await call()).json();
    expect(body.source).toBe("fallback");
    expect(body.provider).toBeNull();
    expect(body.topics).toHaveLength(3);
    expect(String(warn.mock.calls[0]?.join(" "))).toContain("429");
  });
  it("marks Gemini topics as ai", async () => {
    const titles = ["치즈는 왜 익숙할까?", "취향은 왜 갈릴까?", "홍어의 향은 어디서 올까?"];
    // AI 응답은 {"topics":[…]} 객체 모양이다(배열 응답은 Cloudflare·Groq 엄격 모드가 읽지 못한다).
    generateJson.mockImplementation(async (_p, schema) => schema.parse({ topics: titles.map((title, i) => ({ id: String(i), title, summary: "익숙한 음식의 향과 식감을 설명하고 홍어로 연결하는 흐름입니다.", reason: "이유", audience: "A", imageBrief: "사진", season: "", trend: "" })) }));
    const body = await (await call()).json();
    expect(body.source).toBe("ai");
    expect(body.provider).toBe("gemini");
  });
  it("keeps prepared topics when settings cannot be read", async () => {
    readSettings.mockRejectedValueOnce(new Error("broken settings"));
    const response = await call();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.topics).toHaveLength(3);
  });
});
