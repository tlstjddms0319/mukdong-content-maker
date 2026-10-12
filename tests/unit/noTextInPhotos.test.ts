// @vitest-environment node
// 사장님 지적(2026-10-12): 3장 사진 아래 부드러운 그라데이션 위에 "우춘향희 사딩월." 같은 엉터리 한글이 찍혔다.
// 앱이 쓴 글이 아니라 이미지 AI가 그린 글자다. 디자인별 촬영 힌트가 "아래 1/3에 그라데이션과 한 줄 제목이 놓인다",
// "손글씨용 여백", "잡지 제호용 여백"처럼 글자의 쓰임을 말해서, 이미지 AI가 그 자리에 제목을 그려 넣었다.
// 힌트는 비울 자리와 그 자리에 둘 것(빈 식탁·배경)만 말하고, 글자를 떠올리게 하는 말은 쓰지 않는다.
import { describe, expect, it } from "vitest";
import { CARD_LAYOUTS } from "@/features/images/design";
import { STYLES } from "@/features/images/styleCatalog";
import { buildImagePrompt } from "@/features/images/openaiRequest";
import { createFallbackCarouselPlan } from "@/features/images/carousel";

const TEXT_WORDS=/\b(?:title|titles|text|caption|headline|handwriting|masthead|label|labeled|callouts?|lettering|typography|copy)\b/i;

describe("photo hints never invite text",()=>{
  it("layout and style hints describe empty space without saying what text goes there",()=>{
    const hints=[...Object.values(CARD_LAYOUTS).map(layout=>layout.photoHint),...Object.values(STYLES).map(style=>style.photoHint)].filter(Boolean);
    expect(hints.length).toBeGreaterThan(5);
    for(const hint of hints)expect(hint,hint).not.toMatch(TEXT_WORDS);
  });

  it("every slide prompt says empty areas stay plain, at the start and the end",()=>{
    const plan=createFallbackCarouselPlan({topic:"비 오는 날 막걸리엔 왜 전이 생각날까?",slideCount:5,track:"photo"});
    for(const slide of plan.slides){
      const prompt=buildImagePrompt({topic:plan.slides[0].headline,slide,count:1,design:plan.design} as never);
      expect(prompt.startsWith("Absolutely no text")).toBe(true);
      expect(prompt).toContain("never fill them with lettering");
      expect(prompt).not.toMatch(/title area|for a title|text panel|one-line title/);
    }
  });
});
