// AI 구성안 고쳐 쓰기: 고칠 수 있는 어긋남(긴 요점·장 순서 이름·같은 장면·선택지 밖 값)은 고쳐서 쓰고,
// 고칠 수 없는 것(장 수 부족)만 기본 문안으로 넘긴다. 넘어간 이유는 짧은 한국어로 알려 준다.
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createFallbackCarouselPlan } from "@/features/images/carousel";
import { PLAN_FALLBACK_MESSAGES, lenientPlanSchema, planFallbackReason, repairPlanJson, shorten } from "@/features/images/planRepair";
import { TextAiHttpError } from "@/lib/ai/errors";
import { TextAiUnavailableError } from "@/lib/ai/textClient";

vi.mock("server-only", () => ({}));

const base=()=>JSON.parse(JSON.stringify(createFallbackCarouselPlan({topic:"과메기 한 점",slideCount:5})));

describe("plan repair", () => {
  it("fixes long points, role names, repeated scenes and unknown choices instead of dropping the plan", () => {
    const raw=base();
    raw.slides[1].points=["과메기는 찬 바닷바람에 얼었다 녹기를 되풀이하며 꾸덕하게 마르고, 그래서 겨울이 제철이에요","", "짧"];
    raw.slides[2].role="tip";
    raw.slides[3].visualPrompt=raw.slides[2].visualPrompt;
    raw.slides[2].layout="mosaic";
    raw.slides[2].keywords=["겨울바닷바람에잘말린과메기","제철","김","미역"];
    raw.design.palette="ocean";
    raw.design.theme="hanok";
    raw.slides.push({...raw.slides[4]});
    raw.slideCount=7;
    const fixes:string[]=[];
    const plan=lenientPlanSchema(5,fixes).parse(raw);
    expect(plan.slideCount).toBe(5);
    expect(plan.slides).toHaveLength(5);
    expect(plan.slides[1].points).toHaveLength(1);
    expect(plan.slides[1].points[0].length).toBeLessThanOrEqual(40);
    expect(plan.slides[1].points[0]).not.toMatch(/[\s,]$/);
    expect(plan.slides[2].role).toBe(base().slides[2].role);
    expect(plan.slides[2].layout).toBe("frame");
    expect(plan.slides[2].keywords).toEqual(["겨울바닷바람에잘말린과메","제철","김"]);
    expect(new Set(plan.slides.map(slide=>slide.visualPrompt)).size).toBe(5);
    expect(plan.design.palette).toBe("warm");
    expect(plan.design.theme).toBe("classic");
    expect(fixes).toEqual(expect.arrayContaining(["2장 points","3장 role","3장 layout","4장 같은 장면","design.palette","design.theme","slideCount"]));
  });

  // 운영 로그(2026-10-13): 스키마 없이 답한 Gemini가 장 배열만 보내 "expected object, received array"로 기본 문안이 됐다.
  it("wraps a bare slides array into a plan instead of dropping it", () => {
    const raw=base();
    const fixes:string[]=[];
    const repaired=lenientPlanSchema(5,fixes).safeParse(raw.slides);
    expect(repaired.success).toBe(true);
    expect(fixes).toContain("장 배열을 구성안으로 감쌈");
    expect(repairPlanJson([{nope:true}],5)).toEqual([{nope:true}]);
  });

  it("leaves an already valid plan unchanged", () => {
    const raw=base(),fixes:string[]=[];
    expect(lenientPlanSchema(5,fixes).parse(raw)).toEqual(raw);
    expect(fixes).toEqual([]);
  });

  it("cannot invent missing slides, so a short plan still fails", () => {
    const raw=base();raw.slides=raw.slides.slice(0,3);
    expect(lenientPlanSchema(5).safeParse(raw).success).toBe(false);
    expect(repairPlanJson("not json",5)).toBe("not json");
  });

  it("drops a figure that is too long instead of cutting the number", () => {
    const raw=base();raw.slides[2].figure="12345678901234567890";
    expect(lenientPlanSchema(5).parse(raw).slides[2].figure).toBe("");
  });

  it("shortens at a word boundary", () => {
    expect(shorten("홍어는 삭힐수록 향이 강해지고 식감은 부드러워져요",20)).toBe("홍어는 삭힐수록 향이 강해지고");
    expect(shorten("짧은 문장",20)).toBe("짧은 문장");
  });

  it("names why the plan fell back to the prepared copy", () => {
    expect(planFallbackReason(new TextAiHttpError("Gemini",429))).toBe("quota");
    expect(planFallbackReason(new TextAiHttpError("Gemini",403))).toBe("key");
    expect(planFallbackReason(new TextAiHttpError("Gemini",503))).toBe("busy");
    expect(planFallbackReason(new TextAiUnavailableError())).toBe("no-ai");
    expect(planFallbackReason(z.object({a:z.string()}).safeParse({}).error)).toBe("format");
    expect(planFallbackReason(new SyntaxError("bad json"))).toBe("format");
    expect(planFallbackReason(new Error("offline"))).toBe("error");
    expect(PLAN_FALLBACK_MESSAGES.quota).toContain("사용량");
  });
});
