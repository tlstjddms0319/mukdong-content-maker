// @vitest-environment node
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { composeSlideImage, renderSlideHeadline } from "@/features/images/composeSlide";
import type { CarouselSlidePlan } from "@/features/images/carousel";

const coverSlide:CarouselSlidePlan={
  role:"cover",
  headline:"비 오는 날 <홍어> & \"막걸리\"",
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
});
