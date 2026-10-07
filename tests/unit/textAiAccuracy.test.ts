// @vitest-environment node
// 2단계(문안·주제 AI 정확성·안정성) 회귀 테스트: 실패 이유, 시간 제한, 배열 응답, 사진 메뉴, 장면·검수의 메뉴, 카드 숫자·제목 거르기.
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { TextAiHttpError, guardedFetch } from "@/lib/ai/errors";
import { createTextClient, type TextAiClient } from "@/lib/ai/textClient";
import { extractJson } from "@/lib/ai/cloudflareTextClient";
import { createFallbackCarouselPlan, sceneFromCopy, type CarouselPlan } from "@/features/images/carousel";
import { MENU_BY_ID } from "@/features/store/menu";
import { buildPlanReviewPrompt, reviewCarouselPlan } from "@/features/images/planReview";
import { figureSupported, guardSlidePoints } from "@/features/images/slidePoints";
import { buildCopyPrompt } from "@/features/copy/writing";

vi.mock("server-only", () => ({}));

const schema = z.object({ ok: z.boolean() });
const fake = (provider: TextAiClient["provider"], generateJson: TextAiClient["generateJson"]): TextAiClient => ({ provider, generateJson });

describe("text AI failures", () => {
  it("reports the most useful failure instead of the last one", async () => {
    // Gemini 한도 초과 → Groq 형식 오류: 사장님에게는 "한도 초과"가 맞는 이유다.
    const client = createTextClient("automatic", { create: {
      gemini: () => fake("gemini", async () => { throw new TextAiHttpError("Gemini", 429); }),
      groq: () => fake("groq", async () => { throw new SyntaxError("bad json"); }),
      cloudflare: () => { throw new Error("no key"); },
    } });
    await expect(client.generateJson("x", schema)).rejects.toMatchObject({ status: 429 });
  });
  it("turns a stalled or broken connection into a status-0 error so the next AI is tried at once", async () => {
    const stalled = Object.assign(new Error("timed out"), { name: "TimeoutError" });
    await expect(guardedFetch("Gemini", async () => { throw stalled; })).rejects.toMatchObject({ provider: "Gemini", status: 0 });
    const calls: string[] = [];
    const client = createTextClient("automatic", { create: {
      gemini: () => fake("gemini", async () => { calls.push("gemini"); throw new TextAiHttpError("Gemini", 0); }),
      groq: () => fake("groq", async <T,>() => { calls.push("groq"); return { ok: true } as T; }),
      cloudflare: () => { throw new Error("no key"); },
    } });
    await expect(client.generateJson("x", schema)).resolves.toEqual({ ok: true });
    expect(calls).toEqual(["gemini", "groq"]);
  });
  it("reads array and object replies from a text answer", () => {
    expect(JSON.parse(extractJson('결과: [{"a":1},{"a":2}] 끝'))).toEqual([{ a: 1 }, { a: 2 }]);
    expect(JSON.parse(extractJson('```json\n{"topics":[{"a":1}]}\n```'))).toEqual({ topics: [{ a: 1 }] });
  });
});

describe("menu-aware scenes and review", () => {
  const plan = (headline: string, points: string[]): CarouselPlan => ({ ...createFallbackCarouselPlan({ topic: "새해 첫 모임엔 어떤 음식을 고를까?", slideCount: 3 }), slides: createFallbackCarouselPlan({ topic: "새해 첫 모임엔 어떤 음식을 고를까?", slideCount: 3 }).slides.map((slide, i) => i === 1 ? { ...slide, headline, points } : slide) });
  it("rebuilds a scene around the carousel's menu when the slide names no dish", () => {
    const scene = sceneFromCopy({ ...plan("여럿이 모이면 더 맛있어요", ["함께 나누기 좋아요", "천천히 즐겨요"]).slides[1] }, "새해 첫 모임엔 어떤 음식을 고를까?", MENU_BY_ID.gwamegi);
    expect(scene).toContain("과메기");
    expect(scene).not.toContain("홍어");
  });
  it("tells the reviewer the real hero menu and photo notes, and skips the review when nothing is wrong", async () => {
    const prompt = buildPlanReviewPrompt(plan("새콤한 양념이 입맛을 깨워요", ["처음엔 한 점만 맛봐요", "양념과 함께 씹어 봐요"]), "입맛 없을 땐 왜 새콤한 게 당길까?", [], { menu: MENU_BY_ID["hongeo-muchim"], photoNotes: ["홍어무침 한 접시"] });
    expect(prompt).toContain("홍어무침");
    expect(prompt).toContain("실제 사진에 보이는 것");
    const review = vi.fn();
    const clean = { ...plan("가까이 보면 결이 보여요", ["결 따라 한 점씩 집어요", "천천히 씹어 맛을 봐요"]) };
    clean.slides = clean.slides.map(slide => ({ ...slide, headline: slide.role === "cover" ? "새해 첫 모임엔 무엇을 고를까요?" : slide.headline }));
    // 준비된 기본 문안은 자동 검사를 통과하도록 다듬어져 있다 → AI 검수를 부르지 않는다.
    const prepared = createFallbackCarouselPlan({ topic: "과메기는 왜 찬바람이 불면 찾을까?", slideCount: 5 });
    const result = await reviewCarouselPlan(prepared, "과메기는 왜 찬바람이 불면 찾을까?", { review }, {});
    expect(result).toMatchObject({ applied: false, before: 0, after: 0 });
    expect(review).not.toHaveBeenCalled();
    void clean;
  });
  it("uses the photos to pick the menu for the prepared plan", () => {
    const fallback = createFallbackCarouselPlan({ topic: "입맛 없을 땐 뭘 먹으면 좋을까?", slideCount: 5, photoNotes: ["미나리전 한 장이 접시에 놓여 있음"] });
    const text = fallback.slides.map(slide => [slide.headline, ...slide.points].join(" ")).join(" ");
    expect(text).toContain("미나리전");
    expect(text).not.toContain("홍어 한 점");
  });
});

describe("card text guard", () => {
  const base = createFallbackCarouselPlan({ topic: "과메기는 왜 찬바람이 불면 찾을까?", slideCount: 3 });
  it("keeps counting figures and figures from the brief, drops invented ones", () => {
    expect(figureSupported("3가지", {})).toBe(true);
    expect(figureSupported("48시간", { topic: "과메기" })).toBe(false);
    expect(figureSupported("11월", { contentBrief: "11월부터 제철" })).toBe(true);
    const guarded = guardSlidePoints({ ...base, slides: base.slides.map((slide, i) => i === 1 ? { ...slide, layout: "stat", figure: "30년" } : slide) }, { topic: base.slides[0].headline });
    expect(guarded.slides[1].figure).toBe("");
  });
  it("replaces a headline that states an unverified fact", () => {
    const guarded = guardSlidePoints({ ...base, slides: base.slides.map((slide, i) => i === 1 ? { ...slide, headline: "국내산 과메기만 써요", points: ["쫀득한 살을 김에 싸요", "한 점씩 천천히 맛봐요", "쪽파를 곁들여도 좋아요"] } : slide) });
    expect(guarded.slides[1].headline).toBe("쫀득한 살을 김에 싸요");
    expect(guarded.slides[1].points).toEqual(["한 점씩 천천히 맛봐요", "쪽파를 곁들여도 좋아요"]);
  });
});

describe("caption prompt", () => {
  it("lists every store menu and uses an example for the topic's own dish", () => {
    const prompt = buildCopyPrompt({ topic: "과메기는 왜 찬바람이 불면 찾을까?", audience: "A" } as Parameters<typeof buildCopyPrompt>[0], "medium");
    expect(prompt).toContain("홍어찜");
    expect(prompt).toContain("쫀득한 과메기 살");
    expect(prompt).not.toContain("홍어의 탄력, 수육의 부드러움");
    expect(prompt).toContain("묵동에서 과메기를 알아볼 때");
  });
});
