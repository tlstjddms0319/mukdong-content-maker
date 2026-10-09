// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CarouselPlanSchema, createFallbackCarouselPlan, rolesForCount, slideCountFits } from "@/features/images/carousel";
import { plannedCount, deckComplete, type GenerationState } from "@/features/images/generationStore";
import { repairPlanJson } from "@/features/images/planRepair";
import { ImageBriefSchema } from "@/features/images/schema";

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

  // 그림 요청 검사도 4·6·8·9장을 받아야 한다(예전에는 3·5·7·10장만 받아 2번째 장부터 "이미지 설정을 확인해 주세요"로 멈췄다).
  it("accepts image requests for every slide of a 4, 6, 8 or 9 slide post, with or without the store card", () => {
    for(const count of [4,6,8,9]){
      const roles=rolesForCount(count);
      const base=createFallbackCarouselPlan({topic:"홍어",slideCount:10});
      roles.forEach((role,i)=>{
        const slide={...base.slides.find(item=>item.role===role)!,role};
        for(const storeCard of [false,true]){
          const brief={topic:"홍어",count:1,slide,slideIndex:i+1,slideTotal:count+(storeCard?1:0),storeCard,styleAnchor:base.styleAnchor};
          expect(ImageBriefSchema.safeParse(brief).success,`${count}장 ${i+1}번째 ${storeCard?"+홍보":""}`).toBe(true);
        }
      });
    }
    // 역할 순서가 틀리면 여전히 막는다.
    const base=createFallbackCarouselPlan({topic:"홍어",slideCount:10});
    expect(ImageBriefSchema.safeParse({topic:"홍어",count:1,slide:{...base.slides[1],role:"visit"},slideIndex:2,slideTotal:6,styleAnchor:base.styleAnchor}).success).toBe(false);
  });
});
