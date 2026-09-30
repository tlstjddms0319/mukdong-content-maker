// @vitest-environment node
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { composeSlideImage, renderSlideHeadline, renderSlidePoints } from "@/features/images/composeSlide";
import type { CarouselSlidePlan } from "@/features/images/carousel";

const coverSlide:CarouselSlidePlan={
  role:"cover",
  headline:"비 오는 날 <홍어> & \"막걸리\"",
  points:[],
  visualPrompt:"창가의 빗빛 아래 홍어와 막걸리를 담은 선명한 음식 사진",
  textPosition:"top",
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
    const slide:CarouselSlidePlan={...coverSlide,role:"detail",textPosition:"bottom",points:["코가 뾰족하면 홍어예요","가오리는 살이 부드러워요"]};
    const withPoints=await composeSlideImage(input,slide,2,5);
    const withoutPoints=await composeSlideImage(input,{...slide,points:[]},2,5);
    expect(await sharp(withPoints).metadata()).toMatchObject({format:"jpeg",width:1080,height:1350});
    expect(withPoints.equals(withoutPoints)).toBe(false);
  }, 20_000);
});
