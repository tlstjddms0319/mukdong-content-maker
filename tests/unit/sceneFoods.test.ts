// "과메기 글에 삼합 사진" 재발 방지: 홍어가 아닌 메뉴 이야기에서는 이미지 지시문에 홍어 상차림 낱말이 하나도 실려 가지 않아야 한다.
// 구성안 AI가 공통 스타일(styleAnchor)과 장면 설명에 "홍어 삼합"을 섞어 넣어도, 구성안 정리(keepScenesOnMenu)와
// 이미지 지시문(buildImagePrompt)을 거치면 걸러져야 한다. 나오면 안 되는 음식은 "넣지 마"로도 이름을 꺼내지 않는다.
import { describe, expect, it } from "vitest";
import { createFallbackCarouselPlan, planCarousel } from "@/features/images/carousel";
import { buildImagePrompt } from "@/features/images/openaiRequest";
import { copyMentionsSkate, foodFreeAnchor } from "@/features/images/sceneFoods";
import { STORE_MENU } from "@/features/store/menu";

const SKATE_WORDS=/홍어|삼합|수육|묵은지|skate|boiled pork|kimchi/i;

describe("scene foods stay on the post's menu", () => {
  for(const menu of STORE_MENU.filter(item=>!item.id.startsWith("hongeo-"))){
    it(`${menu.short} 이야기의 어느 장에도 홍어·삼합이 실려 가지 않는다`, async () => {
      const topic=`${menu.short}는 언제 먹으면 좋을까?`;
      // 일부러 엇나간 AI 구성안: 공통 스타일과 장면 설명에 홍어 삼합을 적었다(글은 그대로).
      const hostile=createFallbackCarouselPlan({topic,slideCount:5});
      hostile.styleAnchor="홍어 삼합이 놓인 한 상, 따뜻한 조명, 흰 그릇, 짙은 나무 테이블";
      hostile.slides=hostile.slides.map((slide,index)=>index===0?slide:{...slide,visualPrompt:`홍어 삼합과 수육, 묵은지가 놓인 식탁을 ${index+1}번째 각도에서 담은 사진`});
      const plan=await planCarousel({topic,slideCount:5},{generate:async()=>hostile});
      expect(plan.styleAnchor).not.toMatch(SKATE_WORDS);
      for(const [i,slide] of plan.slides.entries()){
        if(copyMentionsSkate([slide.headline,...slide.points].join(" ")))continue; // 글이 직접 말하면 보여 줘도 된다.
        const prompt=buildImagePrompt({topic,count:1,aspectRatio:"4:5",slideIndex:i+1,slideTotal:5,styleAnchor:plan.styleAnchor,slide,design:plan.design});
        expect(prompt,`${i+1}장`).not.toMatch(SKATE_WORDS);
        expect(prompt,`${i+1}장`).toContain(menu.short==="막걸리"?"makgeolli":menu.look.slice(0,20));
      }
    });
  }

  it("keeps the skate when the slide copy itself asks for it", async () => {
    const topic="과메기는 언제 먹으면 좋을까?";
    const plan=createFallbackCarouselPlan({topic,slideCount:5});
    plan.slides[3]={...plan.slides[3],headline:"홍어와 과메기를 나란히",points:["홍어 한 점과 과메기 한 점을 비교해요"],visualPrompt:"홍어 접시와 과메기 접시를 나란히 놓은 식탁"};
    const kept=await planCarousel({topic,slideCount:5},{generate:async()=>plan});
    expect(kept.slides[3].visualPrompt).toContain("홍어");
  });

  it("does not bring samhap into a plain hongeo post", () => {
    const topic="홍어의 톡 쏘는 향은 어디서 올까?";
    const plan=createFallbackCarouselPlan({topic,slideCount:5});
    for(const [i,slide] of plan.slides.entries()){
      if(/삼합|수육|묵은지/.test([slide.headline,...slide.points,slide.visualPrompt].join(" ")))continue;
      const prompt=buildImagePrompt({topic,count:1,aspectRatio:"4:5",slideIndex:i+1,slideTotal:5,styleAnchor:plan.styleAnchor,slide,design:plan.design});
      expect(prompt,`${i+1}장`).not.toMatch(/삼합|수육|묵은지|boiled pork|kimchi/i);
    }
  });

  it("strips food names from the shared style line", () => {
    expect(foodFreeAnchor("홍어 삼합이 놓인 한 상, 따뜻한 조명, 흰 그릇, 짙은 나무 테이블")).toBe("따뜻한 조명, 흰 그릇, 짙은 나무 테이블");
    expect(foodFreeAnchor("과메기 한 접시")).toBe("따뜻하고 자연스러운 색온도, 흰 그릇, 짙은 나무 테이블");
    expect(foodFreeAnchor("Warm side light, brass bowls, dark wood table")).toBe("Warm side light, brass bowls, dark wood table");
  });
});
