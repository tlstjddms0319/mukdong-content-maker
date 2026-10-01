// @vitest-environment node
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { access } from "node:fs/promises";
import { FONTS, composeSlideImage, renderSlideHeadline, renderSlidePoints } from "@/features/images/composeSlide";
import type { CarouselSlidePlan } from "@/features/images/carousel";

const coverSlide:CarouselSlidePlan={
  role:"cover",
  headline:"비 오는 날 <홍어> & \"막걸리\"",
  points:[],
  visualPrompt:"창가의 빗빛 아래 홍어와 막걸리를 담은 선명한 음식 사진",
  textPosition:"top",
  layout:"fullscreen",
  keywords:["홍어","막걸리"],
};

describe("slide composition", () => {
  it("renders Korean with the bundled font and fits long titles inside the safe area", async () => {
    const {data,info}=await renderSlideHeadline("홍어를 처음 만나는 날, 한 점부터 천천히 즐기는 방법을 알아볼까요?");
    expect(info.width).toBeLessThanOrEqual(936);
    expect(info.height).toBeLessThanOrEqual(190);
    expect(info.width).toBeGreaterThan(300);
    expect(data.length).toBeGreaterThan(1000);
  });
  it("renders a different 1080 by 1350 JPEG with an XML-sensitive Korean headline", async () => {
    const input=await sharp({create:{width:40,height:40,channels:3,background:"#f4ede2"}}).png().toBuffer();
    const plain=await sharp(input).resize(1080,1350,{fit:"cover"}).jpeg({quality:90}).toBuffer();
    const output=await composeSlideImage(input,coverSlide,1,5);

    expect(await sharp(output).metadata()).toMatchObject({format:"jpeg",width:1080,height:1350});
    expect(output.equals(plain)).toBe(false);
  }, 15_000);
  it("draws up to four wrapped points inside the safe area and changes the slide", async () => {
    const points=await renderSlidePoints(["코가 뾰족하면 홍어, 둥글면 가오리예요","홍어는 삭힐수록 톡 쏘는 향이 진해져요","가오리는 살이 부드럽고 담백해요","처음이라면 양념을 적게 시작해 보세요"]);
    expect(points).not.toBeNull();
    expect(points!.info.width).toBeLessThanOrEqual(936);
    expect(points!.info.height).toBeLessThanOrEqual(320);
    expect(points!.info.height).toBeGreaterThan(120);
    expect(await renderSlidePoints([" ",""])).toBeNull();

    const input=await sharp({create:{width:40,height:40,channels:3,background:"#4f643f"}}).png().toBuffer();
    const slide:CarouselSlidePlan={...coverSlide,role:"detail",textPosition:"bottom",layout:"collage",points:["코가 뾰족하면 홍어예요","가오리는 살이 부드러워요"]};
    const withPoints=await composeSlideImage(input,slide,2,5);
    const withoutPoints=await composeSlideImage(input,{...slide,points:[]},2,5);
    expect(await sharp(withPoints).metadata()).toMatchObject({format:"jpeg",width:1080,height:1350});
    expect(withPoints.equals(withoutPoints)).toBe(false);
  }, 20_000);
  it("renders the card layout by default with a light paper background and keeps overlay as an option", async () => {
    const input=await sharp({create:{width:40,height:40,channels:3,background:"#202020"}}).png().toBuffer();
    const slide:CarouselSlidePlan={...coverSlide,role:"detail",textPosition:"bottom",layout:"collage",points:["코가 뾰족하면 홍어예요","가오리는 살이 부드러워요"]};
    const card=await composeSlideImage(input,slide,2,5);
    const overlay=await composeSlideImage(input,slide,2,5,"overlay");
    const cover=await composeSlideImage(input,coverSlide,1,5,"card");
    expect(card.equals(await composeSlideImage(input,slide,2,5,"card"))).toBe(true);
    expect(card.equals(overlay)).toBe(false);
    // 카드형은 종이색 배경이라 왼쪽 위 모서리가 밝고, 오버레이는 어두운 사진이 그대로 보인다.
    const corner=async(image:Buffer)=>{const {data}=await sharp(image).extract({left:8,top:8,width:1,height:1}).raw().toBuffer({resolveWithObject:true});return data[0];};
    expect(await corner(card)).toBeGreaterThan(200);
    expect(await corner(overlay)).toBeLessThan(80);
    expect(await sharp(cover).metadata()).toMatchObject({format:"jpeg",width:1080,height:1350});
  }, 30_000);
  it("bleeds the cover photo to the top edge, keeps body slides on paper, and sets body text in the regular weight", async () => {
    const input=await sharp({create:{width:40,height:40,channels:3,background:"#202020"}}).png().toBuffer();
    const body:CarouselSlidePlan={...coverSlide,role:"detail",textPosition:"bottom",layout:"collage",points:["얇게 썰려 빛에 비치면 결이 보여요","씹을수록 탄력이 느껴지는 부분이에요"]};
    const corner=async(image:Buffer)=>{const {data}=await sharp(image).extract({left:8,top:8,width:1,height:1}).raw().toBuffer({resolveWithObject:true});return data[0];};
    expect(await corner(await composeSlideImage(input,coverSlide,1,5))).toBeLessThan(80);
    expect(await corner(await composeSlideImage(input,body,2,5))).toBeGreaterThan(200);
    for(const font of Object.values(FONTS))await expect(access(font.file)).resolves.toBeUndefined();
    // 본문 요점은 보통 굵기라 같은 글을 굵게 찍은 것보다 잉크가 적다.
    const regular=await renderSlidePoints(["얇게 썰려 빛에 비치면 결이 보여요"],{bullets:false,color:"#000000"});
    const bold=await sharp({text:{text:"얇게 썰려 빛에 비치면 결이 보여요",font:`${FONTS.bold.family} 36`,fontfile:FONTS.bold.file,width:936,rgba:true}}).png().toBuffer({resolveWithObject:true});
    const ink=async(png:Buffer)=>{const {data}=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});let sum=0;for(let i=3;i<data.length;i+=4)sum+=data[i];return sum;};
    expect(await ink(regular!.data)).toBeLessThan(await ink(bold.data));
  }, 30_000);

});
