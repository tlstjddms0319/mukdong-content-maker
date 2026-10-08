// @vitest-environment node
// 사진 여러 칸 레이아웃(비교·폴라로이드)은 칸마다 다른 피사체를 그리게 한다.
// 예전에는 같은 장면 설명에 각도만 달리 보내서 두 칸에 거의 같은 그림(같은 사발에 막걸리 따르기)이 들어갔다.
import { describe, expect, it } from "vitest";
import { buildImagePrompt, candidateBriefs, photoFocusOf } from "@/features/images/openaiRequest";
import type { ImageBrief } from "@/features/images/schema";

type Slide=NonNullable<ImageBrief["slide"]>;
const slide=(layout:Slide["layout"],extra:Partial<Slide>={}):Slide=>({role:"detail",headline:"톡 쏘는 산미가 입맛을 돋워요",subline:"",points:["은은한 발효 향이 코끝을 스쳐요","산미가 입안을 개운하게 정리해요"],visualPrompt:"놋사발에 막걸리를 따르는 장면",textPosition:"bottom",layout,keywords:[],figure:"",titleFont:"auto",bodyFont:"auto",variant:0,...extra});
const brief=(s:Slide,count:number):ImageBrief=>({topic:"막걸리",count,slide:s,slideIndex:4,slideTotal:6,styleAnchor:"따뜻한 가을 색감, 놋그릇, 나무 테이블"} as ImageBrief);

describe("per-photo subjects in multi-photo layouts", () => {
  it("gives each polaroid photo a different point as its scene", () => {
    const briefs=candidateBriefs(brief(slide("polaroid"),2));
    expect(briefs.map(item=>item.photoFocus)).toEqual([expect.stringContaining("은은한 발효 향"),expect.stringContaining("산미가 입안을")]);
    expect(buildImagePrompt(briefs[0])).toContain("이 사진의 장면: 은은한 발효 향");
    expect(buildImagePrompt(briefs[1])).not.toContain("은은한 발효 향이 코끝을 스쳐요 (");
  });
  it("draws only one side per photo in a versus card", () => {
    const s=slide("versus",{keywords:["생막걸리","살균 막걸리"]});
    expect(photoFocusOf({slide:s},0)).toContain("'생막걸리'만");
    expect(photoFocusOf({slide:s},1)).toContain("'살균 막걸리'만");
  });
  it("falls back to other elements when there are fewer points than photos", () => {
    const s=slide("collage",{points:["한 점"]});
    const focus=[0,1,2].map(i=>photoFocusOf({slide:s},i));
    expect(new Set(focus).size).toBe(3);
  });
  it("leaves single-photo slides and cover candidates alone", () => {
    expect(photoFocusOf({slide:slide("frame")},0)).toBeUndefined();
    expect(photoFocusOf({slide:slide("polaroid",{role:"cover"})},0)).toBeUndefined();
    expect(candidateBriefs(brief(slide("frame"),1))[0].photoFocus).toBeUndefined();
  });
});
