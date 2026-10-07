// @vitest-environment node
// 레이아웃 자리가 3개뿐인 카드에 요점 4개를 주면, 빠진 수를 알려 준다(예전에는 조용히 빠졌다).
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { composeSlideCard } from "@/features/images/composeSlide";
import type { CarouselSlidePlan } from "@/features/images/carousel";

const slide=(points:string[]):CarouselSlidePlan=>({role:"detail",headline:"가까이 보면 결이 달라요",points,visualPrompt:"접시 위 과메기 가까이",textPosition:"bottom",layout:"frame",keywords:["과메기"],figure:""});

describe("dropped points",()=>{
  it("counts points the layout could not show and reports none when all fit",async()=>{
    const photo=await sharp({create:{width:600,height:600,channels:3,background:"#b98a66"}}).jpeg().toBuffer();
    const four=await composeSlideCard(photo,slide(["윤기가 도는 겉면을 봐요","결 따라 한 점 집어요","김에 싸서 맛봐요","천천히 씹어 봐요"]),2,5);
    expect(four.droppedPoints).toBeGreaterThanOrEqual(1);
    const two=await composeSlideCard(photo,slide(["윤기가 도는 겉면을 봐요","결 따라 한 점 집어요"]),2,5);
    expect(two.droppedPoints).toBe(0);
  },30_000);
});
