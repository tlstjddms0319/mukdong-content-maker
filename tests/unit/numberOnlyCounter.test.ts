// @vitest-environment node
// 카드에는 장 번호만 찍고 전체 장 수("3 / 7")는 찍지 않는다. 장을 넣고 빼도 앞쪽 장을 다시 그리지 않아도 되게.
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { composeSlideCard } from "@/features/images/composeSlide";
import type { CarouselSlidePlan } from "@/features/images/carousel";
import type { StyleId } from "@/features/images/styleCatalog";

const slide:CarouselSlidePlan={role:"detail",headline:"가까이 보면 결이 달라요",points:["윤기가 도는 겉면을 봐요","결 따라 한 점 집어요"],visualPrompt:"접시 위 과메기",textPosition:"bottom",layout:"frame",keywords:["과메기"],figure:""};

describe("number-only slide counter",()=>{
  it.each([["template"],["neon"],["hanji"],["ticket"],["typography"],["webtoon"],["grid"]] as const)("%s cards never print the deck total",async style=>{
    const photo=await sharp({create:{width:800,height:1000,channels:3,background:"#b98a66"}}).jpeg().toBuffer();
    const card=await composeSlideCard(photo,slide,3,7,"card",{palette:"warm",...(style==="template"?{}:{style:style as StyleId})});
    const texts=card.report.texts.join("\n");
    expect(texts).not.toMatch(/3\s*\/\s*7|\/\s*0?7\b|7장/);
  },30_000);
});
