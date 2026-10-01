// @vitest-environment node
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { CARD_LAYOUTS, CardLayoutSchema, PALETTES, PaletteIdSchema, defaultCardLayout, designCatalogText, normalizeCardLayout, photosNeeded } from "@/features/images/design";
import { buildCarouselPlanPrompt, createFallbackCarouselPlan, normalizeCarouselDesign, planCarousel } from "@/features/images/carousel";
import { buildImagePrompt } from "@/features/images/openaiRequest";
import { composeSlideImage } from "@/features/images/composeSlide";
import type { CarouselSlidePlan } from "@/features/images/carousel";

const body:CarouselSlidePlan={role:"how-to",headline:"한 점은 이렇게 만들어 먹어요",points:["재료를 차례로 올려 한입 크기로 집어요","첫 점은 양념을 적게 해서 맛을 확인해요","같이 먹으면 좋은 게 뭔지 이어서 볼게요"],visualPrompt:"젓가락으로 한 점을 만드는 손동작 사진, 얼굴 없음",textPosition:"top",layout:"browser",keywords:["먹는 법","한 점"]};
const picture=(background:string)=>sharp({create:{width:60,height:80,channels:3,background}}).png().toBuffer();
const pixel=async(image:Buffer,left:number,top:number)=>{const {data}=await sharp(image).extract({left,top,width:1,height:1}).raw().toBuffer({resolveWithObject:true});return [data[0],data[1],data[2]] as const;};

describe("topic-driven card design", () => {
  it("offers every palette and layout to the plan AI with a reason to pick each, and asks for keywords", () => {
    const prompt=buildCarouselPlanPrompt({topic:"비 오는 날 홍어",slideCount:5});
    for(const id of PaletteIdSchema.options)expect(prompt).toContain(`${id}(${PALETTES[id].label}`);
    for(const id of CardLayoutSchema.options)expect(prompt).toContain(`${id}(${CARD_LAYOUTS[id].label}`);
    expect(prompt).toContain(designCatalogText());
    expect(prompt).toContain("browser는 사진이 없으니");
    expect(prompt).toContain("keywords");
  });

  it("gives fallback slides a palette, keywords and role-based layouts that differ between neighbouring slides", () => {
    const plan=createFallbackCarouselPlan({topic:"홍어와 막걸리",slideCount:5});
    expect(plan.design).toEqual({palette:"warm"});
    expect(plan.slides.map(slide=>slide.layout)).toEqual(["fullscreen","frame","browser","illustration","collage"]);
    expect(plan.slides.every(slide=>slide.layout===defaultCardLayout(slide.role)&&slide.keywords.length>=1)).toBe(true);
  });

  it("repairs a cover drawn as a body-only layout instead of rejecting the plan", async () => {
    expect(normalizeCardLayout("cover","collage")).toBe("fullscreen");
    expect(normalizeCardLayout("cover","frame")).toBe("frame");
    expect(normalizeCardLayout("visit","fullscreen")).toBe("fullscreen");
    const drafted=createFallbackCarouselPlan({topic:"홍어 한 점",slideCount:3});
    drafted.slides[0].layout="browser";
    const plan=await planCarousel({topic:"홍어 한 점",slideCount:3},{generate:async()=>({...drafted,design:{palette:"sea"}})});
    expect(plan.design.palette).toBe("sea");
    expect(plan.slides[0].layout).toBe("fullscreen");
    expect(normalizeCarouselDesign(plan)).toEqual(plan);
  });

  it("tells the image AI how each layout uses the photo and needs no photo for the browser layout", () => {
    expect(photosNeeded("collage")).toBe(3);
    expect(photosNeeded("browser")).toBe(0);
    const common={topic:"홍어 한 상",count:1,aspectRatio:"4:5" as const,slideIndex:3,slideTotal:5 as const,styleAnchor:"따뜻한 색온도, 흰 그릇, 짙은 나무 테이블"};
    expect(buildImagePrompt({...common,slide:{...body,layout:"fullscreen"}})).toContain("film grain");
    expect(buildImagePrompt({...common,slide:{...body,layout:"collage"}})).toContain("different angle");
    expect(buildImagePrompt({...common,slide:{...body,layout:"collage"},slideLayout:"overlay"})).toContain("film grain");
  });

  it("renders each layout differently, paints with the chosen palette, and builds a collage from several photos", async () => {
    const a=await picture("#202020"),b=await picture("#2040a0"),c=await picture("#20a040");
    const rendered:Record<string,Buffer>={
      fullscreen:await composeSlideImage([a],{...body,layout:"fullscreen"},3,5,"card",{palette:"warm"}),
      frame:await composeSlideImage([a],{...body,layout:"frame"},3,5,"card",{palette:"warm"}),
      illustration:await composeSlideImage([a],{...body,layout:"illustration"},3,5,"card",{palette:"warm"}),
      collage:await composeSlideImage([a,b,c],{...body,layout:"collage"},3,5,"card",{palette:"warm"}),
      browser:await composeSlideImage([],{...body,layout:"browser"},3,5,"card",{palette:"warm"}),
    };
    const all=Object.values(rendered);
    for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++)expect(all[i].equals(all[j])).toBe(false);
    for(const image of all)expect(await sharp(image).metadata()).toMatchObject({format:"jpeg",width:1080,height:1350});
    // 풀스크린은 사진이 모서리까지 채우고, 콜라주·브라우저는 종이색/파스텔 바탕이다.
    expect((await pixel(rendered.fullscreen,8,8))[0]).toBeLessThan(80);
    expect((await pixel(rendered.collage,8,8))[0]).toBeGreaterThan(200);
    expect((await pixel(rendered.browser,8,8))[0]).toBeGreaterThan(200);
    // 콜라주 격자에는 세 사진이 모두 들어간다: 왼쪽 큰 칸은 첫 사진, 오른쪽 위·아래는 둘째·셋째 사진.
    const [,,blueB]=await pixel(rendered.collage,860,420);
    const [,greenC]=await pixel(rendered.collage,860,760);
    expect(blueB).toBeGreaterThan(120);
    expect(greenC).toBeGreaterThan(120);
    // 밤 색 조합은 콜라주 바탕이 어둡다.
    expect((await pixel(await composeSlideImage([a,b,c],{...body,layout:"collage"},3,5,"card",{palette:"night"}),8,8))[0]).toBeLessThan(60);
    // 사진 없이 브라우저형이 아닌 레이아웃을 그리면 실패한다.
    await expect(composeSlideImage([],{...body,layout:"frame"},3,5)).rejects.toThrow();
  }, 90_000);
});
