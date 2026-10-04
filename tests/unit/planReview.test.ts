// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createFallbackCarouselPlan, type CarouselPlan } from "@/features/images/carousel";
import { reviewCarouselPlan, slideCopyIssues, type PlanReview } from "@/features/images/planReview";

const plan=(slideCount:3|5|7|10=5)=>createFallbackCarouselPlan({topic:"홍어 한 점",slideCount});
const withSlide=(base:CarouselPlan,index:number,patch:Partial<CarouselPlan["slides"][number]>)=>({...base,slides:base.slides.map((slide,i)=>i===index?{...slide,...patch}:slide)});
const asReview=(base:CarouselPlan):PlanReview=>({slides:base.slides.map(slide=>({headline:slide.headline,points:slide.points}))});

describe("slide copy lint", () => {
  it("passes the prepared copy for every carousel size", () => {
    for(const count of [3,5,7,10] as const)expect(slideCopyIssues(plan(count))).toEqual([]);
  });

  it("flags advertising clichés, slogans, unfinished points, echoes and repeated slides", () => {
    const base=plan();
    const broken=withSlide(withSlide(base,1,{headline:"풍미 가득 홍어의 세계",points:["홍어 한 점 느껴보기","풍미 가득 홍어의 세계 맛보기"]}),2,{headline:base.slides[3].headline});
    const messages=slideCopyIssues(broken).map(issue=>`${issue.slide}:${issue.message}`).join("\n");
    expect(messages).toContain("2:광고 상투어 '풍미 가득'");
    expect(messages).toContain("2:명사로 끝나는 슬로건");
    expect(messages).toContain("해요체 완결 문장");
    expect(messages).toContain("제목을 되풀이");
    expect(messages).toMatch(/4:3번 장 제목과 너무 비슷해요|3:.*번 장 제목과 너무 비슷해요/);
  });
});

describe("AI review of the slide copy", () => {
  it("applies a review that fixes the problems and keeps roles, layouts and design", async () => {
    const base=plan();
    const broken=withSlide(base,1,{headline:"풍미 가득 홍어의 세계"});
    const review=vi.fn(async()=>asReview(base));
    const result=await reviewCarouselPlan(broken,"홍어 한 점",{review});
    expect(result).toMatchObject({applied:true,after:0});
    expect(result.before).toBeGreaterThan(0);
    expect(result.plan.slides[1].headline).toBe(base.slides[1].headline);
    expect(result.plan.slides.map(slide=>[slide.role,slide.layout])).toEqual(broken.slides.map(slide=>[slide.role,slide.layout]));
    expect(result.plan.design).toEqual(broken.design);
    // 검수 프롬프트에 찾은 문제와 편집 기준이 들어간다.
    const prompt=String((review.mock.calls[0] as unknown[])[0]);
    expect(prompt).toContain("2번 장 제목: 광고 상투어");
    expect(prompt).toContain("주어와 첫 동작은 홍어");
  });

  it("keeps the original when the review makes it worse, changes the shape, adds blocked claims or fails", async () => {
    const base=plan();
    const worse={slides:base.slides.map((slide,i)=>({headline:i===2?"풍미 가득 역대급 홍어의 세계":slide.headline,points:slide.points}))};
    expect((await reviewCarouselPlan(base,"홍어",{review:async()=>worse})).applied).toBe(false);
    const missing={slides:base.slides.map(slide=>({headline:slide.headline,points:slide.role==="cover"?[]:slide.points.slice(0,1)}))};
    expect((await reviewCarouselPlan(base,"홍어",{review:async()=>missing})).applied).toBe(false);
    const claims={slides:base.slides.map((slide,i)=>({headline:i===1?"홍어는 누구나 좋아해요, 향이 전혀 없어요":slide.headline,points:slide.points}))};
    const claimed=await reviewCarouselPlan(base,"홍어",{review:async()=>claims});
    expect(claimed.plan.slides[1].headline).toBe(base.slides[1].headline);
    const failed=await reviewCarouselPlan(base,"홍어",{review:async()=>{throw new Error("offline");}});
    expect(failed).toMatchObject({applied:false,plan:base});
  });
});
