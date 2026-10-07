// @vitest-environment node
// 전체 점검(코드 리뷰)에서 찾은 문제들의 재발 방지.
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
const { menuOf }=await import("@/features/store/menu");
const { sceneMustShow, buildImagePrompt }=await import("@/features/images/openaiRequest");
const { lenientPlanSchema }=await import("@/features/images/planRepair");
const { createFallbackCarouselPlan }=await import("@/features/images/carousel");
const { suggestSeasonMotif }=await import("@/features/images/seasonMotif");
const { applyEvent, flushUsage, recordUsage, setUsageStoreForTests }=await import("@/lib/usage/ledger");

describe("review fixes", () => {
  it("menu words need the 홍어 prefix where a bare word means something else", () => {
    expect(menuOf("미나리 무침").map(item=>item.id)).toEqual(["minari-jeon"]);
    expect(menuOf("애국가를 부르며")).toEqual([]);
    expect(menuOf("홍어 애호가").map(item=>item.id)).toEqual(["hongeo-hoe"]);
    expect(menuOf("홍어애국 한 그릇").map(item=>item.id)).toEqual(["hongeo-aetang"]);
  });
  it("the shop name is not a skate scene", () => {
    const slide={role:"detail" as const,subline:"",headline:"묵동홍어마을 겨울 과메기",points:["김치에 싸서 드셔 보세요"],visualPrompt:"과메기 접시를 가까이",textPosition:"top" as const,layout:"frame" as const,keywords:[],figure:"",titleFont:"auto" as const,bodyFont:"auto" as const,variant:0};
    const brief={topic:"겨울 과메기",count:1,aspectRatio:"4:5" as const,slideIndex:2,slideTotal:5,styleAnchor:"따뜻한 조명",slide};
    expect(sceneMustShow(brief)).not.toMatch(/skate|홍어를/);
    expect(buildImagePrompt({...brief,topic:"겨울 별미",slide:{...slide,headline:"묵동홍어마을 겨울 별미"}})).not.toContain("Hongeo is Korean fermented skate");
  });
  it("repairs an unknown season instead of dropping the AI plan", () => {
    const raw=JSON.parse(JSON.stringify(createFallbackCarouselPlan({topic:"홍어 한 점",slideCount:5})));
    raw.design.season="가을";
    const fixes:string[]=[];
    expect(lenientPlanSchema(5,fixes).parse(raw).design.season).toBe("none");
    expect(fixes).toContain("design.season");
  });
  it("season words do not fire inside other words, and rainy season is not hidden by boknal", () => {
    const march=new Date("2026-03-03T03:00:00Z");
    for(const topic of ["가성비가 좋은 홍어 한 상","모임 준비가 쉬운 삼합","빗살무늬 접시","돌봄 받는 날"])expect(suggestSeasonMotif(topic,march),topic).toBe("none");
    expect(suggestSeasonMotif("빗소리 들으며 막걸리",march)).toBe("rain");
    expect(suggestSeasonMotif("홍어 한 점",new Date("2026-07-12T03:00:00Z"))).toBe("rain");
  });
  it("counts a partial image failure as one call with the images it made", () => {
    const month=applyEvent({month:"2026-10",days:{},lastQuota:{},lastError:{}},{provider:"higgsfield",ok:false,units:2,status:500},new Date("2026-10-07T03:00:00Z"));
    expect(month.days["2026-10-07"].higgsfield).toEqual({calls:1,failures:1,quota:0,units:2});
  });
  it("keeps the month file when reading it fails", async () => {
    const writes:string[]=[];
    setUsageStoreForTests(()=>({read:async()=>{throw new Error("503");},write:async(_name,value)=>{writes.push(value);}}));
    recordUsage({provider:"gemini",ok:true});
    await flushUsage();
    expect(writes).toEqual([]);
    setUsageStoreForTests(null);
  });
});
