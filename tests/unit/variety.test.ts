// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createFallbackCarouselPlan, planCarousel } from "@/features/images/carousel";
import { CARD_LAYOUTS, LAYOUT_VARIANTS, defaultCardLayout } from "@/features/images/design";
import { ThemeIdSchema } from "@/features/images/themes";
import { diversifyCarouselDesign } from "@/features/images/variety";
import { resolveSlideFonts } from "@/features/images/typography";
import { serverUnavailableMessage, readJsonResponse } from "@/lib/http/readJson";

const signature=(plan:ReturnType<typeof createFallbackCarouselPlan>)=>JSON.stringify([plan.design,plan.slides.map(slide=>[slide.layout,slide.titleFont])]);

describe("carousel variety", () => {
  it("gives the prepared plan different templates, colors and fonts from one carousel to the next", () => {
    const base=createFallbackCarouselPlan({topic:"홍어와 막걸리",slideCount:5});
    const looks=new Set(Array.from({length:12},(_,seed)=>signature(diversifyCarouselDesign(base,seed,{fallback:true}))));
    expect(looks.size).toBeGreaterThan(4);
    for(let seed=0;seed<12;seed++){
      const plan=diversifyCarouselDesign(base,seed,{fallback:true});
      // 이웃한 두 장은 같은 레이아웃이 아니고, 표지는 표지에 쓸 수 있는 레이아웃이다.
      plan.slides.forEach((slide,index)=>{if(index)expect(slide.layout).not.toBe(plan.slides[index-1].layout);});
      expect(CARD_LAYOUTS[plan.slides[0].layout].coverAllowed).toBe(true);
      // 변형 번호는 그 레이아웃이 그릴 수 있는 범위 안이다.
      plan.slides.forEach(slide=>expect(slide.variant).toBeLessThan(LAYOUT_VARIANTS[slide.layout]));
      // 글은 그대로다.
      expect(plan.slides.map(slide=>slide.headline)).toEqual(base.slides.map(slide=>slide.headline));
    }
  });

  it("keeps a layout the AI chose on purpose and only reshuffles echoed defaults", () => {
    const base=createFallbackCarouselPlan({topic:"홍어 한 점",slideCount:5});
    const chosen={...base,slides:base.slides.map((slide,index)=>index===2?{...slide,layout:"step" as const}:slide)};
    for(let seed=0;seed<6;seed++){
      const plan=diversifyCarouselDesign(chosen,seed);
      expect(plan.slides[2].layout).toBe("step");
      // 색과 글꼴은 AI가 고른 그대로이고, 기본값(classic·template)으로 남은 테마와 계열만 게시물마다 바뀐다.
      expect({...plan.design,theme:"classic",style:"template"}).toEqual(chosen.design);
      expect(ThemeIdSchema.options).toContain(plan.design.theme);
    }
    // 기본값을 그대로 낸 장은 시드에 따라 바뀔 수 있다.
    const layouts=new Set(Array.from({length:6},(_,seed)=>diversifyCarouselDesign(base,seed).slides[3].layout));
    expect(layouts.size).toBeGreaterThan(1);
    expect(defaultCardLayout("pairing")).toBe("illustration");
  });

  it("varies only when the route passes a seed", async () => {
    const plain=await planCarousel({topic:"홍어 한 점",slideCount:5});
    expect(plain).toEqual(createFallbackCarouselPlan({topic:"홍어 한 점",slideCount:5}));
    const varied=await planCarousel({topic:"홍어 한 점",slideCount:5},undefined,{seed:7});
    expect(varied).toEqual(diversifyCarouselDesign(plain,7,{fallback:true}));
  });

  it("gives emotional slides an accent title font when the AI picked none per slide", () => {
    const base=createFallbackCarouselPlan({topic:"홍어 한 점",slideCount:5});
    const plan=diversifyCarouselDesign({...base,design:{palette:"warm",style:"template",theme:"magazine",titleFont:"plex",bodyFont:"plex",tone:"loud",season:"none"}},1);
    expect(plan.slides[0].titleFont).toBe("batang");
    expect(plan.slides[2].titleFont).toBe("auto");
    expect(resolveSlideFonts(plan.design,plan.slides[0])).toEqual({titleFont:"batang",bodyFont:"plex"});
    expect(resolveSlideFonts(plan.design,plan.slides[2])).toEqual({titleFont:"plex",bodyFont:"plex"});
    expect(resolveSlideFonts(undefined,{})).toEqual({titleFont:"pretendard",bodyFont:"pretendard"});
  });
});

describe("post themes", () => {
  it("rotates the theme between posts unless the AI picked a specific one", () => {
    const base=createFallbackCarouselPlan({topic:"홍어 한 점",slideCount:5});
    const themes=new Set(Array.from({length:12},(_,seed)=>diversifyCarouselDesign(base,seed).design.theme));
    expect(themes.size).toBeGreaterThan(3);
    const chosen={...base,design:{...base.design,theme:"retro" as const}};
    for(let seed=0;seed<6;seed++)expect(diversifyCarouselDesign(chosen,seed).design.theme).toBe("retro");
  });
});

describe("server responses that are not JSON", () => {
  it("turns an HTML error page into a Korean message with the status code", async () => {
    const html=new Response("<!DOCTYPE html><html>Bad Gateway</html>",{status:502,headers:{"Content-Type":"text/html"}});
    await expect(readJsonResponse(html)).rejects.toThrow(serverUnavailableMessage(502));
    expect(serverUnavailableMessage(502)).toContain("상태 502");
    expect(serverUnavailableMessage(404)).toContain("새로고침");
    await expect(readJsonResponse(new Response(JSON.stringify({message:"ok"})))).resolves.toEqual({message:"ok"});
  });
});
