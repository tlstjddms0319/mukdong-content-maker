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
    expect(prompt).toContain("음식 사진 장면");
  });

  it("asks for slide points, ships safe fallback points, and drops risky provider points", async () => {
    const prompt=buildCarouselPlanPrompt({topic:"홍어와 가오리",slideCount:3,contentBrief:"코 모양과 냄새가 다르다"});
    expect(prompt).toContain("points 배열");
    expect(prompt).toContain("내용 메모: 코 모양과 냄새가 다르다");

    const fallback=createFallbackCarouselPlan({topic:"홍어와 가오리",slideCount:5});
    expect(fallback.slides[0].points).toEqual([]);
    expect(fallback.slides.slice(1).every(slide=>(slide.points?.length??0)>=2&&slide.points!.every(point=>point.length<=40))).toBe(true);

    const providerPlan=createFallbackCarouselPlan({topic:"홍어와 가오리",slideCount:3});
    providerPlan.slides[0].points=["표지에는 넣지 말아야 할 줄"];
    providerPlan.slides[1].points=["한 점을 만드는 순간","코가 뾰족하면 홍어예요","한 접시 12,000원","냄새 없음 보장","저녁 6시부터 영업"];
    generateJson.mockResolvedValue({...providerPlan,slides:providerPlan.slides.map(slide=>({...slide,points:slide.points?.slice(0,4)}))});
    const response=await POST(new Request("http://localhost/api/images/plan",{method:"POST",body:JSON.stringify({topic:"홍어와 가오리",slideCount:3})}));
    const body=await response.json();
    expect(body.provider).toBe("gemini");
    expect(body.plan.slides[0].points).toEqual([]);
    expect(body.plan.slides[1].points).toEqual(["코가 뾰족하면 홍어예요"]);
  });

  it("asks for drawn scenes and a matching style anchor when an art style is chosen", () => {
    const prompt=buildCarouselPlanPrompt({topic:"홍어 한 점",slideCount:3,imageStyle:"anime"});
    expect(prompt).toContain("애니메이션 일러스트로 그릴 음식 장면");
    expect(prompt).not.toContain("음식 사진 장면으로");
    const fallback=createFallbackCarouselPlan({topic:"홍어 한 점",slideCount:3,imageStyle:"anime"});
    expect(fallback.styleAnchor).toContain("애니메이션");
    expect(fallback.slides.every(slide=>!slide.visualPrompt.includes("사진"))).toBe(true);
    expect(createFallbackCarouselPlan({topic:"홍어 한 점",slideCount:3}).styleAnchor).toContain("실제 음식 사진 질감");
  });

});
