// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CarouselPlanSchema, createFallbackCarouselPlan, rolesForCount, slideCountFits } from "@/features/images/carousel";
import { plannedCount, deckComplete, type GenerationState } from "@/features/images/generationStore";
import { repairPlanJson } from "@/features/images/planRepair";

// 사장님 요청(2026-10-09): 장 수를 5장으로 고정하지 않고, 만들 때마다 내용을 다 전할 수 있는 장 수(4~9장)를 AI가 정한다.
describe("slide count chosen per post", () => {
  it("has a role order for every count from 3 to 10", () => {
    for(let count=3;count<=10;count++){
      const roles=rolesForCount(count);
      expect(roles).toHaveLength(count);
      expect(roles[0]).toBe("cover");
      expect(new Set(roles).size).toBe(count);
    }
    expect(rolesForCount(5)).toEqual(["cover","detail","how-to","pairing","visit"]);
  });

  it("accepts any count in the range for a track post and the exact count otherwise", () => {
    expect(slideCountFits({slideCount:5,track:"text"},7)).toBe(true);
    expect(slideCountFits({slideCount:5,track:"text"},3)).toBe(false);
    expect(slideCountFits({slideCount:5,track:"text"},10)).toBe(false);
    expect(slideCountFits({slideCount:5},7)).toBe(false);
  });

  it("re-labels roles for the count the AI sent", () => {
    const seven=createFallbackCarouselPlan({topic:"홍어",slideCount:7});
    const shuffled={...seven,slides:seven.slides.map(slide=>({...slide,role:"detail"}))};
    const fixed=CarouselPlanSchema.parse(repairPlanJson(shuffled,{min:4,max:9}));
    expect(fixed.slideCount).toBe(7);
    expect(fixed.slides.map(slide=>slide.role)).toEqual([...rolesForCount(7)]);
  });

  it("makes and counts as many slides as the plan has", () => {
    const plan=createFallbackCarouselPlan({topic:"홍어",slideCount:7});
    const input={topic:"홍어",slideCount:5 as const,track:"text" as const};
    expect(plannedCount({plan:undefined,input})).toBe(5);
    expect(plannedCount({plan,input})).toBe(7);
    const state=(slides:number)=>({plan,input,deckEdited:false,slides:Array(slides).fill({id:"a"})}) as unknown as GenerationState;
    expect(deckComplete(state(5))).toBe(false);
    expect(deckComplete(state(7))).toBe(true);
  });
});
