// @vitest-environment node
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { buildCarouselPlanPrompt, createFallbackCarouselPlan, type CarouselPlan } from "@/features/images/carousel";
import { composeSlideImage } from "@/features/images/composeSlide";
import { DEFAULT_DESIGN } from "@/features/images/design";
import { effectiveDesign } from "@/features/images/generationStore";
import { buildImagePrompt } from "@/features/images/openaiRequest";
import { STYLES, StyleIdSchema, styleCatalogText } from "@/features/images/styleCatalog";
import { diversifyCarouselDesign } from "@/features/images/variety";

const slide:CarouselPlan["slides"][number]={role:"pairing",subline:"",headline:"홍어 한 점은 씹을수록 진한 감칠맛이 올라와요",points:["홍어 살은 얇게 썰려 결이 비쳐 보여요","홍어를 묵은지에 싸 한입에 넣어요","막걸리 한 모금으로 마무리해요"],visualPrompt:"홍어회 접시 사진",textPosition:"bottom",layout:"frame",keywords:["홍어","감칠맛"],figure:"",titleFont:"auto",bodyFont:"auto",variant:0};
const photo=(color:string)=>sharp({create:{width:90,height:120,channels:3,background:color}}).png().toBuffer();
const families=StyleIdSchema.options.filter(style=>style!=="template");

describe("style families", () => {
  // 계열마다 표지·사진 0장·1장·2장인 장을 모두 그려 본다. 사진 수에 따라 화면 구성이 갈리므로 각각 깨지지 않아야 한다.
  it("draws every family as a 1080×1350 card for the cover and for 0, 1 and 2 photos", async () => {
    const photos=[await photo("#c08070"),await photo("#7090c0")];
    for(const style of families){
      const cases:Array<[Buffer[],CarouselPlan["slides"][number],number]>=[
        [photos.slice(0,1),{...slide,role:"cover",points:[]},1],
        [[],{...slide,layout:"qa"},2],
        [photos.slice(0,1),slide,3],
        [photos,{...slide,layout:"versus"},4],
      ];
      for(const [inputs,card,index] of cases){
        const image=await composeSlideImage(inputs.length?inputs:photos.slice(0,1),card,index,5,"card",{palette:"warm",style});
        expect(await sharp(image).metadata(),`${style} #${index}`).toMatchObject({format:"jpeg",width:1080,height:1350});
      }
    }
  },240_000);

  it("looks different from the template and from each other", async () => {
    const photos=[await photo("#c08070")];
    const looks=await Promise.all(StyleIdSchema.options.map(style=>composeSlideImage(photos,slide,3,5,"card",{palette:"warm",style})));
    expect(new Set(looks.map(image=>image.toString("base64"))).size).toBe(StyleIdSchema.options.length);
  },120_000);

  it("rotates the family between posts but keeps one the AI chose", () => {
    const base=createFallbackCarouselPlan({topic:"홍어 한 점",slideCount:5});
    const styles=new Set(Array.from({length:14},(_,seed)=>diversifyCarouselDesign(base,seed).design.style));
    expect(styles.size).toBeGreaterThan(3);
    const chosen={...base,design:{...base.design,style:"hanji" as const}};
    for(let seed=0;seed<6;seed++)expect(diversifyCarouselDesign(chosen,seed).design.style).toBe("hanji");
  });

  it("offers the families to the plan AI and lets the owner override", () => {
    expect(buildCarouselPlanPrompt({topic:"비 오는 날 홍어",slideCount:5})).toContain(styleCatalogText());
    const recommended={palette:"warm" as const,style:"webtoon" as const,theme:"classic" as const,titleFont:"pretendard" as const,bodyFont:"pretendard" as const,tone:"loud" as const};
    expect(effectiveDesign(recommended,{titleFont:"auto",bodyFont:"auto",theme:"auto",style:"auto"}).style).toBe("webtoon");
    expect(effectiveDesign(recommended,{titleFont:"auto",bodyFont:"auto",theme:"auto",style:"neon"}).style).toBe("neon");
  });

  it("asks the image model for photos the family can process", () => {
    const brief={topic:"홍어회",count:1,aspectRatio:"4:5" as const,slideIndex:2,slideTotal:5 as const,styleAnchor:"따뜻한 색온도",slide};
    expect(buildImagePrompt({...brief,design:{...DEFAULT_DESIGN,style:"colorblock"}})).toContain(STYLES.colorblock.photoHint);
    expect(buildImagePrompt({...brief,design:DEFAULT_DESIGN})).not.toContain(STYLES.colorblock.photoHint);
  });
});

describe("retired style families", () => {
  it("reads drafts, month plans and links saved with the retired pixel and newspaper styles", async () => {
    const { StoredStyleIdSchema, StyleIdSchema: Ids } = await import("@/features/images/styleCatalog");
    expect(Ids.options).not.toContain("y2k");
    expect(Ids.options).not.toContain("newspaper");
    expect(StoredStyleIdSchema.parse("y2k")).toBe("neon");
    expect(StoredStyleIdSchema.parse("newspaper")).toBe("hanji");
    expect(StoredStyleIdSchema.parse("chalkboard")).toBe("chalkboard");
    const { DraftSchema } = await import("@/features/drafts/schema");
    const draft=DraftSchema.parse({id:"11111111-1111-4111-8111-111111111111",status:"ready",topic:"홍어",audience:"A",media_candidates:[],selected_media_id:null,copy:null,facts_to_verify:[],store_profile_version:"2026-09-10",created_at:"2026-09-10T00:00:00.000Z",updated_at:"2026-09-10T00:00:00.000Z",design_style:"newspaper"});
    expect(draft.design_style).toBe("hanji");
    const { MonthPlanItemSchema } = await import("@/features/topics/monthPlan");
    expect(MonthPlanItemSchema.parse({id:"a",title:"홍어는 왜?",summary:"s",reason:"r",audience:"A",imageBrief:"i",season:"",date:"2026-11-03",style:"y2k"}).style).toBe("neon");
  });
});
