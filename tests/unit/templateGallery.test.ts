// @vitest-environment node
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { CARD_LAYOUTS, CardLayoutSchema, LAYOUT_VARIANTS, photosNeeded } from "@/features/images/design";
import { ThemeIdSchema } from "@/features/images/themes";
import { buildCarouselPlanPrompt, type CarouselPlan } from "@/features/images/carousel";
import { composeSlideImage } from "@/features/images/composeSlide";
import { themeCatalogText } from "@/features/images/themes";

const slide:CarouselPlan["slides"][number]={role:"pairing",notes:"",imageStyle:"photo",subline:"",headline:"홍어 한 점은 씹을수록 진한 감칠맛이 올라와요",points:["홍어 살은 얇게 썰려 결이 비쳐 보여요","홍어를 묵은지에 싸 한입에 넣어요","막걸리 한 모금으로 마무리해요"],visualPrompt:"홍어회 접시 사진",textPosition:"bottom",layout:"frame",keywords:["홍어","가오리"],figure:"7일",titleFont:"auto",bodyFont:"auto",variant:0};
const photo=(color:string)=>sharp({create:{width:90,height:120,channels:3,background:color}}).png().toBuffer();

describe("template gallery", () => {
  it("draws every layout and every variant as a distinct 1080×1350 card", async () => {
    const photos=[await photo("#c08070"),await photo("#7090c0"),await photo("#80b070")];
    const drawn:Buffer[]=[];
    for(const layout of CardLayoutSchema.options){
      for(let variant=0;variant<LAYOUT_VARIANTS[layout];variant++){
        const image=await composeSlideImage(photos.slice(0,Math.max(1,photosNeeded(layout))),{...slide,layout,variant},3,7,"card",{palette:"warm"});
        expect(await sharp(image).metadata()).toMatchObject({format:"jpeg",width:1080,height:1350});
        drawn.push(image);
      }
    }
    expect(drawn.length).toBe(Object.values(LAYOUT_VARIANTS).reduce((sum,count)=>sum+count,0));
    expect(drawn.length).toBeGreaterThanOrEqual(29);
    expect(new Set(drawn.map(image=>image.toString("base64"))).size).toBe(drawn.length);
  },240_000);

  it("dresses the same card differently for every post theme", async () => {
    const photos=[await photo("#c08070")];
    const looks=await Promise.all(ThemeIdSchema.options.map(theme=>composeSlideImage(photos,{...slide,layout:"split"},3,7,"card",{palette:"warm",theme})));
    expect(new Set(looks.map(image=>image.toString("base64"))).size).toBe(ThemeIdSchema.options.length);
  },60_000);

  it("offers the new layouts and themes to the plan AI", () => {
    const prompt=buildCarouselPlanPrompt({topic:"비 오는 날 홍어",slideCount:5});
    for(const layout of ["magazine","split","polaroid","receipt","checklist","timeline","poster","circle"] as const)expect(prompt).toContain(`${layout}(${CARD_LAYOUTS[layout].label}`);
    expect(prompt).toContain(themeCatalogText());
  });
});
