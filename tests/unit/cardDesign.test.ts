// @vitest-environment node
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { CARD_LAYOUTS, CardLayoutSchema, PALETTES, PaletteIdSchema, defaultCardLayout, designCatalogText, normalizeCardLayout } from "@/features/images/design";
import { buildCarouselPlanPrompt, createFallbackCarouselPlan, normalizeCarouselDesign, planCarousel } from "@/features/images/carousel";
import { composeSlideImage } from "@/features/images/composeSlide";
import type { CarouselSlidePlan } from "@/features/images/carousel";

const body:CarouselSlidePlan={role:"how-to",headline:"한 점은 이렇게 만들어 먹어요",points:["재료를 차례로 올려 한입 크기로 집어요","첫 점은 양념을 적게 해서 맛을 확인해요"],visualPrompt:"젓가락으로 한 점을 만드는 손동작 사진, 얼굴 없음",textPosition:"top",layout:"steps"};

describe("topic-driven card design", () => {
  it("offers every palette and layout to the plan AI with a reason to pick each", () => {
    const prompt=buildCarouselPlanPrompt({topic:"비 오는 날 홍어",slideCount:5});
    for(const id of PaletteIdSchema.options)expect(prompt).toContain(`${id}(${PALETTES[id].label}`);
    for(const id of CardLayoutSchema.options)expect(prompt).toContain(`${id}(${CARD_LAYOUTS[id].label}`);
    expect(prompt).toContain(designCatalogText());
    expect(prompt).toContain("이어지는 두 장이 같은 layout이 되지 않게");
  });

  it("gives fallback slides a palette and role-based layouts that differ between neighbouring slides", () => {
    const plan=createFallbackCarouselPlan({topic:"홍어와 막걸리",slideCount:5});
    expect(plan.design).toEqual({palette:"warm"});
    expect(plan.slides.map(slide=>slide.layout)).toEqual(["cover-bleed","photo-top","steps","split","statement"]);
    expect(plan.slides.every(slide=>slide.layout===defaultCardLayout(slide.role))).toBe(true);
  });

  it("repairs a cover drawn as a body layout and a body drawn as the cover layout instead of rejecting the plan", async () => {
    expect(normalizeCardLayout("cover","steps")).toBe("cover-bleed");
    expect(normalizeCardLayout("visit","cover-bleed")).toBe("statement");
    expect(normalizeCardLayout("detail","split")).toBe("split");
    const drafted=createFallbackCarouselPlan({topic:"홍어 한 점",slideCount:3});
    drafted.slides[0].layout="statement";drafted.slides[1].layout="cover-bleed";
    const plan=await planCarousel({topic:"홍어 한 점",slideCount:3},{generate:async()=>({...drafted,design:{palette:"sea"}})});
    expect(plan.design.palette).toBe("sea");
    expect(plan.slides.map(slide=>slide.layout)).toEqual(["cover-bleed","steps","statement"]);
    expect(normalizeCarouselDesign(plan)).toEqual(plan);
  });

  it("renders each layout differently and paints the card in the chosen palette", async () => {
    const input=await sharp({create:{width:40,height:40,channels:3,background:"#202020"}}).png().toBuffer();
    const corner=async(image:Buffer)=>{const {data}=await sharp(image).extract({left:8,top:1330,width:1,height:1}).raw().toBuffer({resolveWithObject:true});return [data[0],data[1],data[2]];};
    const rendered:Buffer[]=[];
    for(const layout of ["photo-top","split","statement","steps"] as const)rendered.push(await composeSlideImage(input,{...body,layout},3,5,"card",{palette:"warm"}));
    for(let i=0;i<rendered.length;i++)for(let j=i+1;j<rendered.length;j++)expect(rendered[i].equals(rendered[j])).toBe(false);
    // 큰 글자형은 강조색이 바탕이라 아래 모서리가 붉고, 나머지는 종이색이다.
    const [r]=await corner(rendered[2]);
    expect(r).toBeGreaterThan(150);
    const warm=await corner(rendered[0]);
    const night=await corner(await composeSlideImage(input,{...body,layout:"photo-top"},3,5,"card",{palette:"night"}));
    expect(warm[0]).toBeGreaterThan(200);
    expect(night[0]).toBeLessThan(60);
  }, 60_000);
});
