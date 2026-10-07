// @vitest-environment node
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { access } from "node:fs/promises";
import path from "node:path";
import { BODY_FONTS, BodyFontIdSchema, TITLE_FONTS, TitleFontIdSchema, fontCatalogText, typographyOf } from "@/features/images/typography";
import { DesignSpecSchema } from "@/features/images/design";
import { CarouselPlanSchema, buildCarouselPlanPrompt, type CarouselSlidePlan } from "@/features/images/carousel";
import { composeSlideImage } from "@/features/images/composeSlide";
import { mascotLayer } from "@/features/images/decor";
import { effectiveDesign } from "@/features/images/generationStore";
import { toStrictJsonSchema } from "@/lib/ai/jsonSchema";

const slide:CarouselSlidePlan={role:"pairing",headline:"홍어 한 점은 씹을수록 진한 감칠맛이 올라와요",points:["홍어 살은 얇게 썰려 빛에 비치면 고유의 결이 보여요","특유의 알싸한 향이 입안에 퍼지며 침이 돌게 만들어요","다음 장에서는 이 맛이 왜 수육을 만나는지 살펴볼게요"],visualPrompt:"홍어회 한 접시를 위에서 담은 사진",textPosition:"top",layout:"illustration",keywords:["홍어"],figure:""};

describe("title and body fonts", () => {
  it("bundles every font file it offers", async () => {
    const faces=[...Object.values(TITLE_FONTS).map(entry=>entry.title),...Object.values(BODY_FONTS).flatMap(entry=>[entry.body,entry.labelFont])];
    for(const face of faces)await expect(access(path.join(process.cwd(),"assets/fonts",face.fileName))).resolves.toBeUndefined();
  });

  it("fills missing fonts with the default and still sends a strict schema to providers", () => {
    expect(DesignSpecSchema.parse({palette:"sea"})).toEqual({palette:"sea",style:"template",theme:"classic",titleFont:"pretendard",bodyFont:"pretendard",tone:"loud",season:"none"});
    expect(()=>DesignSpecSchema.parse({palette:"sea",titleFont:"comic"})).toThrow();
    // 기본값이 있는 필드도 출력 스키마에서는 필수라 엄격 JSON 스키마 변환이 실패하지 않는다.
    expect(()=>toStrictJsonSchema(CarouselPlanSchema)).not.toThrow();
  });

  it("asks the plan AI to recommend a title and a body font that suit the copy", () => {
    const prompt=buildCarouselPlanPrompt({topic:"비 오는 날 홍어",slideCount:5});
    expect(prompt).toContain(fontCatalogText());
    for(const id of TitleFontIdSchema.options)expect(prompt).toContain(`${id}(${TITLE_FONTS[id].label}`);
    for(const id of BodyFontIdSchema.options)expect(prompt).toContain(`${id}(${BODY_FONTS[id].label}`);
    expect(prompt).toContain("design 객체(style, palette, theme, titleFont, bodyFont, tone, season)");
  });

  it("lets the owner override only the font they picked", () => {
    const recommended={palette:"night" as const,style:"template" as const,theme:"classic" as const,titleFont:"batang" as const,bodyFont:"batang" as const,tone:"loud" as const,season:"none" as const};
    expect(effectiveDesign(recommended,{titleFont:"auto",bodyFont:"auto"})).toEqual(recommended);
    expect(effectiveDesign(recommended,{titleFont:"jua",bodyFont:"auto"})).toEqual({palette:"night",style:"template",theme:"classic",titleFont:"jua",bodyFont:"batang",tone:"loud",season:"none"});
    expect(effectiveDesign(recommended,{titleFont:"auto",bodyFont:"dodum"})).toEqual({palette:"night",style:"template",theme:"classic",titleFont:"batang",bodyFont:"dodum",tone:"loud",season:"none"});
  });

  it("draws the chosen fonts and keeps concurrent cards from mixing them", async () => {
    expect(typographyOf("jua","dodum")).toEqual({title:TITLE_FONTS.jua.title,label:BODY_FONTS.dodum.labelFont,body:BODY_FONTS.dodum.body});
    const photo=await sharp({create:{width:60,height:80,channels:3,background:"#c08070"}}).png().toBuffer();
    const draw=(titleFont:"pretendard"|"jua",bodyFont:"pretendard"|"dodum")=>composeSlideImage([photo],slide,3,5,"card",{palette:"warm",titleFont,bodyFont});
    const [plain,friendly,plainAgain]=await Promise.all([draw("pretendard","pretendard"),draw("jua","dodum"),draw("pretendard","pretendard")]);
    expect(plain.equals(friendly)).toBe(false);
    // 동시에 그려도 같은 설정이면 같은 그림이 나온다(다른 요청의 글꼴이 섞이지 않는다).
    expect(plain.equals(plainAgain)).toBe(true);
    expect(plain.equals(await composeSlideImage([photo],slide,3,5,"card",{palette:"warm"}))).toBe(true);
  }, 60_000);
});

describe("mascot placement", () => {
  it("shrinks the mascot to the free height and drops it when the gap is too small", async () => {
    expect(await mascotLayer({width:200,left:0,top:0,maxHeight:60})).toBeNull();
    const fitted=await mascotLayer({width:200,left:0,top:300,anchor:"bottom-left",maxHeight:120});
    expect(fitted).not.toBeNull();
    const {height}=await sharp(fitted!.input as Buffer).metadata();
    expect(height).toBeLessThanOrEqual(120);
    expect(fitted!.top).toBe(300-height!);
  });
});
