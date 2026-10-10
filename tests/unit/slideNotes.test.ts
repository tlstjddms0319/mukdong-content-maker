// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { CarouselPlanSchema, CarouselSlidePlanSchema, buildCarouselPlanPrompt, createFallbackCarouselPlan } from "@/features/images/carousel";
import { repairPlanJson } from "@/features/images/planRepair";
import { buildCopyPrompt } from "@/features/copy/writing";
import { SlideReviseSchema, buildSlideRevisePrompt } from "@/features/images/slideRevise";
import { ImageBriefSchema } from "@/features/images/schema";
import { toStrictJsonSchema } from "@/lib/ai/jsonSchema";

vi.mock("server-only", () => ({}));

// 사장님 요청(2026-10-10): 뽑아내는 글(속 글)은 길고 자세해도 되고, 카드에는 핵심만 보인다.
describe("slide notes: think long, show short", () => {
  it("asks the AI to write the notes first and distil the card text from them", () => {
    for(const track of ["text","photo",undefined] as const){
      const prompt=buildCarouselPlanPrompt({topic:"홍어는 왜 삭혀도 상하지 않을까?",slideCount:5,...(track?{track}:{})});
      expect(prompt).toContain("[속 글 먼저]");
      expect(prompt).toContain("role, notes, headline");
    }
    // 엄격 JSON 스키마에서도 notes가 headline보다 먼저 나와 AI가 먼저 쓴다.
    const keys=Object.keys((toStrictJsonSchema(CarouselSlidePlanSchema) as {properties:Record<string,unknown>}).properties);
    expect(keys.indexOf("notes")).toBeLessThan(keys.indexOf("headline"));
  });

  it("keeps old plans without notes valid and trims very long notes", () => {
    const old=createFallbackCarouselPlan({topic:"홍어",slideCount:5});
    const withoutNotes={...old,slides:old.slides.map(slide=>{const copy:Record<string,unknown>={...slide};delete copy.notes;return copy;})};
    expect(CarouselPlanSchema.parse(withoutNotes).slides[1].notes).toBe("");
    const long={...old,slides:old.slides.map(slide=>({...slide,notes:"가".repeat(1200)}))};
    expect(CarouselPlanSchema.parse(repairPlanJson(long,5)).slides[2].notes).toHaveLength(900);
  });

  it("hands the notes to the caption and to slide text fixes, but not to image requests", () => {
    const caption=buildCopyPrompt({topic:"홍어는 왜 삭혀도 상하지 않을까?",audience:"C",slideOutline:["홍어는 왜 삭혀도 상하지 않을까?","요소가 암모니아로 바뀌어요"],slideNotes:["","홍어 몸에는 요소가 많아 삭히는 동안 암모니아로 바뀌고, 이 성분이 다른 균이 자라기 어렵게 한다고 알려져 있어요."]} as Parameters<typeof buildCopyPrompt>[0],"medium");
    expect(caption).toContain("[카드 속 글]");
    expect(caption).toContain("다른 균이 자라기 어렵게");
    const revise=buildSlideRevisePrompt(SlideReviseSchema.parse({topic:"홍어",headline:"요소가 암모니아로 바뀌어요",request:"더 쉬운 말로",notes:"삭히는 동안 요소가 암모니아로 바뀌어요."}));
    expect(revise).toContain("이 장의 속 글");
    const slide={...createFallbackCarouselPlan({topic:"홍어",slideCount:5}).slides[0],notes:"속 글"};
    const brief=ImageBriefSchema.parse({topic:"홍어",count:1,slide,slideIndex:1,slideTotal:5,styleAnchor:"따뜻한 조명의 한식 음식 사진"});
    expect(brief.slide).not.toHaveProperty("notes");
  });
});
