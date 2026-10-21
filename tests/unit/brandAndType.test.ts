// 3단계 공용 도구: 글꼴 대체 사슬, 핵심어 강조, 표지 예고 띠, 마지막 장 명함, 낙관.
import { describe, expect, it } from "vitest";
import { fontDescription, textLayer, withRenderContext } from "@/features/images/render/primitives";
import { STYLE_FONTS, brandSeal, closingBlock, emphasisOf, nextCue, teaserText } from "@/features/images/styles/shared";
import { createFallbackCarouselPlan } from "@/features/images/carousel";
import { typographyOf } from "@/features/images/typography";
import { PALETTES } from "@/features/images/design";

describe("font fallback chain", () => {
  it("lists Pretendard after the chosen face with the same weight", () => {
    expect(fontDescription("Black Han Sans",72)).toBe("Black Han Sans,Pretendard 72");
    expect(fontDescription("Gaegu Bold",48)).toBe("Gaegu,Pretendard Bold 48");
    expect(fontDescription("Hahmlet ExtraBold",80)).toBe("Hahmlet,Pretendard ExtraBold 80");
    expect(fontDescription("Pretendard SemiBold",26)).toBe("Pretendard SemiBold 26");
  });

  it("renders syllables a handwriting font lacks instead of dropping them", async () => {
    // Gaegu는 2,350음절만 있다. "뷁"이 빠지면 글자 폭이 공백만큼 좁아진다.
    const withRare=await textLayer("홍어뷁",{size:60,color:"#000",width:1000,height:200,font:STYLE_FONTS.chalk});
    const common=await textLayer("홍어",{size:60,color:"#000",width:1000,height:200,font:STYLE_FONTS.chalk});
    expect(withRare.info.width).toBeGreaterThan(common.info.width+30);
  });
});

describe("keyword emphasis", () => {
  it("picks up to two keywords that appear in the headline", () => {
    // 사장님 지적(2026-10-21): 색이 들쭉날쭉. 이제 keywords가 아니라 제목 속 가게 메뉴 이름만 색칠한다.
    expect(emphasisOf({headline:"묵은지에 싼 홍어 한 점",keywords:["막걸리"]},"#d33")?.words).toContain("홍어");
    expect(emphasisOf({headline:"과메기 한 점은 기름이 좌르르 돌아요",keywords:[]},"#d33")).toEqual({words:["과메기"],color:"#d33"});
    expect(emphasisOf({headline:"첫 점은 코끝이 먼저 찡해요",keywords:["홍어"]},"#d33")).toBeUndefined();
    expect(emphasisOf({headline:"가기 전에 확인해요",keywords:["홍어"]},"#d33")).toBeUndefined();
  });

  it("keeps the same line breaks and size when emphasising", async () => {
    const value="묵은지에 싼 홍어 한 점은 씹을수록 감칠맛이 올라와요";
    const plain=await textLayer(value,{size:56,color:"#111",width:600,height:600,font:STYLE_FONTS.heavy});
    const marked=await textLayer(value,{size:56,color:"#111",width:600,height:600,font:STYLE_FONTS.heavy,emphasis:{words:["홍어","묵은지"],color:"#d33"}});
    expect([marked.info.width,marked.info.height]).toEqual([plain.info.width,plain.info.height]);
  });
});

describe("cover teaser", () => {
  it("names what follows in a planned deck and falls back for edited decks", () => {
    // 전체 장 수("— 5장")는 쓰지 않는다(장을 넣고 빼도 표지를 다시 그리지 않게).
    expect(teaserText(5)).toBe("먹는 법 · 곁들임 · 방문 전 확인");
    expect(teaserText(10)).toBe("먹는 법 · 곁들임 · 방문 전 확인");
    expect(teaserText(3)).toBe("먹는 법 · 방문 전 확인");
    expect(teaserText(4)).toBe("넘겨 보세요");
    // 홍보 카드가 붙으면 내용 장 수(전체-1)로 고른다.
    expect(teaserText(6,true)).toBe("먹는 법 · 곁들임 · 방문 전 확인");
  });

  it("gives fallback plans a short cover subline", () => {
    const plan=createFallbackCarouselPlan({topic:"홍어 한 점",slideCount:5});
    expect(plan.slides[0].subline.length).toBeGreaterThan(0);
    expect(plan.slides.slice(1).every(slide=>slide.subline==="")).toBe(true);
  });
});

describe("closing block and brand marks", () => {
  it("fits the store card in 240px and shows the handle when set", async () => {
    const block=await withRenderContext({typography:typographyOf(),theme:"classic",variant:0,palette:PALETTES.warm.colors,brandHandle:"mukdong_hongeo"},()=>closingBlock({width:900,color:"#222",accent:"#c65138"}));
    expect(block.height).toBeLessThanOrEqual(240);
    expect(block.handle).not.toBeNull();
    expect(block.chipSvg(100,100)).toContain("<rect");
  });

  it("draws a seal and a next cue with an SVG arrow", async () => {
    const seal=await brandSeal(120,3,{on:"dark"});
    expect(seal.svg(10,10)).toContain("brandSeal3");
    expect(seal.text.info.width).toBeLessThanOrEqual(120);
    const cue=await nextCue("#fff");
    expect(cue.arrow(0,0)).toContain("<path");
    expect(cue.width).toBeGreaterThan(cue.label.info.width);
  });
});
