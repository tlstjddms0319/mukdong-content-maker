// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildCarouselPlanPrompt, createFallbackCarouselPlan, planCarousel, rolesForCount } from "@/features/images/carousel";
import { POST } from "@/app/api/images/plan/route";

vi.mock("@/features/auth/guard", () => ({ ownerApiError: async () => null }));
const readSettings=vi.hoisted(()=>vi.fn());
vi.mock("@/features/settings/repository", () => ({ readSettings }));
vi.mock("server-only", () => ({}));

const generateJson=vi.hoisted(()=>vi.fn());
vi.mock("@/lib/ai/geminiClient",()=>({createGeminiClient:()=>({generateJson})}));

describe("carousel planning", () => {
  beforeEach(()=>{generateJson.mockReset();readSettings.mockReset().mockResolvedValue({textAiProvider:"automatic"});});
  it("keeps five distinct roles in publishing order by default", async () => {
    const plan=await planCarousel({topic:"막걸리 한 잔과 어울리는 홍어 한 점",imageBrief:"홍어와 막걸리"});

    expect(plan.slideCount).toBe(5);
    expect(plan.slides.map((slide)=>slide.role)).toEqual(["cover","detail","how-to","pairing","visit"]);
    expect(new Set(plan.slides.map((slide)=>slide.visualPrompt)).size).toBe(5);
  });

  it.each([
    [3,["cover","how-to","visit"]],
    [7,["cover","overview","detail","how-to","pairing","occasion","visit"]],
    [10,["cover","overview","detail","how-to","pairing","process","occasion","mood","visit","cta"]],
  ] as const)("uses the required role order for %i slides", (count, expected) => {
    expect(rolesForCount(count)).toEqual(expected);
    expect(createFallbackCarouselPlan({topic:"비 오는 날 홍어",slideCount:count}).slides.map((slide)=>slide.role)).toEqual(expected);
  });

  it("falls back at the requested count without replacing the selected topic", async () => {
    const plan=await planCarousel(
      {topic:"비 오는 날 홍어",imageBrief:"빗빛과 상차림",slideCount:7},
      {generate:async()=>{throw new Error("offline");}},
    );

    expect(plan.slideCount).toBe(7);
    expect(plan.slides).toHaveLength(7);
    expect(plan.slides[0].headline).toContain("비 오는 날 홍어");
  });

  it("rejects a provider plan with the wrong requested count", async () => {
    const wrongCount=createFallbackCarouselPlan({topic:"홍어 한 점",slideCount:3});
    const plan=await planCarousel({topic:"홍어 한 점",slideCount:5},{generate:async()=>wrongCount});

    expect(plan.slideCount).toBe(5);
    expect(plan.slides.map((slide)=>slide.role)).toEqual(["cover","detail","how-to","pairing","visit"]);
  });

  it("returns a Gemini plan while preserving the selected topic and fact boundaries in its instruction", async () => {
    const providerPlan=createFallbackCarouselPlan({topic:"비 오는 날 홍어",slideCount:5});
    generateJson.mockResolvedValue(providerPlan);

    const response=await POST(new Request("http://localhost/api/images/plan",{method:"POST",body:JSON.stringify({topic:"비 오는 날 홍어"})}));
    const body=await response.json();
    const prompt=String(generateJson.mock.calls[0][0]);

    expect(body).toEqual({plan:providerPlan,provider:"gemini"});
    expect(prompt).toContain("비 오는 날 홍어");
    expect(prompt).toContain("가격, 원산지, 영업시간, 매장 정보");
    expect(prompt).toContain("짧은 한국어");
  });

  it("labels a provider failure as fallback", async () => {
    generateJson.mockImplementation(async()=>{throw new Error("offline");});

    const response=await POST(new Request("http://localhost/api/images/plan",{method:"POST",body:JSON.stringify({topic:"홍어와 막걸리",slideCount:3})}));
    const body=await response.json();

    expect(body.provider).toBe("fallback");
    expect(body.plan.slideCount).toBe(3);
    expect(body.plan.slides[0].headline).toContain("홍어와 막걸리");
  });

  it("labels an invalid provider plan as fallback", async () => {
    generateJson.mockResolvedValue({slideCount:3,styleAnchor:"따뜻한 조명과 흰 그릇, 나무 테이블의 실제 음식 사진 스타일",slides:[]});

    const response=await POST(new Request("http://localhost/api/images/plan",{method:"POST",body:JSON.stringify({topic:"저녁 홍어 한 상",slideCount:5})}));
    const body=await response.json();

    expect(body.provider).toBe("fallback");
    expect(body.plan.slideCount).toBe(5);
    expect(body.plan.slides[0].headline).toContain("저녁 홍어 한 상");
  });
  it("rejects repeated provider scenes and supports a maximum-length image brief",async()=>{
    const repeated=createFallbackCarouselPlan({topic:"홍어전",slideCount:3});
    repeated.slides[1].visualPrompt=repeated.slides[0].visualPrompt;
    const plan=await planCarousel({topic:"홍어전",slideCount:3,imageBrief:"가".repeat(600)},{generate:async()=>repeated});
    expect(plan.slides).toHaveLength(3);
    expect(new Set(plan.slides.map(slide=>slide.visualPrompt)).size).toBe(3);
    expect(plan.slides.every(slide=>slide.visualPrompt.length<=600)).toBe(true);
  });

  it("still returns a rule-based plan when settings cannot be read",async()=>{
    readSettings.mockRejectedValueOnce(new Error("broken settings"));

    const response=await POST(new Request("http://localhost/api/images/plan",{method:"POST",body:JSON.stringify({topic:"홍어와 막걸리",slideCount:3})}));
    const body=await response.json();

    expect(response.status).toBe(200);
    expect(["fallback","gemini"]).toContain(body.provider);
    expect(body.plan.slideCount).toBe(3);
  });

  it("builds the plan instruction from the input", () => {
    const prompt=buildCarouselPlanPrompt({topic:"비 오는 날 홍어",slideCount:3});
    expect(prompt).toContain("\"비 오는 날 홍어\"");
    expect(prompt).toContain("cover → how-to → visit");
    expect(prompt).toContain("기존 이미지 설명: 없음");
    expect(prompt).toContain("가격, 원산지, 영업시간, 매장 정보");
  });

});
