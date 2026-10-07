// @vitest-environment node
import { describe, expect, it } from "vitest";
import { STORE_MENU, heroMenu, josa, mainMenuOf, menuOf, menusInSeason } from "@/features/store/menu";

describe("store menu", () => {
  it("lists the menus the owner named (홍어찜 from the shop poster), each with a look and a category", () => {
    expect(STORE_MENU.map(item=>item.name)).toEqual(["홍어회(삼합 포함)","홍어무침","홍어애탕","홍어찜","과메기","미나리전","배다리 막걸리"]);
    expect(new Set(STORE_MENU.map(item=>item.id)).size).toBe(STORE_MENU.length);
    for(const item of STORE_MENU){
      expect(item.look.length).toBeGreaterThan(20);
      expect(item.lookKo.length).toBeGreaterThan(5);
      expect(["홍어 요리","제철 회","전","술"]).toContain(item.category);
      // 겉모습 묘사에 가격·원산지 같은 사실을 만들지 않는다.
      expect(item.look+item.lookKo).not.toMatch(/원|₩|\d+g|국내산|흑산/);
    }
  });

  it("finds menus in the order they appear in the text", () => {
    expect(menuOf("미나리전엔 왜 막걸리가 생각날까?").map(item=>item.id)).toEqual(["minari-jeon","baedari-makgeolli"]);
    expect(menuOf("홍어 삼합 한 점").map(item=>item.id)).toEqual(["hongeo-hoe"]);
    expect(menuOf("홍어무침과 홍어회").map(item=>item.id)).toEqual(["hongeo-muchim","hongeo-hoe"]);
    expect(menuOf("홍어애탕 한 그릇").map(item=>item.id)).toEqual(["hongeo-aetang"]);
    // 가게 이름이나 확인되지 않은 홍어전은 홍어회로 보지 않는다.
    expect(menuOf("묵동홍어마을 소식")).toEqual([]);
    expect(menuOf("홍어전 한 장")).toEqual([]);
    expect(mainMenuOf(undefined,"오늘의 이야기","과메기 한 접시")?.id).toBe("gwamegi");
  });

  it("picks the hero of a slide from its copy and the topic", () => {
    expect(heroMenu("막걸리 한 잔을 곁들여요","과메기는 왜 찬바람이 불면 찾을까?")?.id).toBe("gwamegi");
    expect(heroMenu("미나리전 한 장을 곁들여요","막걸리 한 잔엔 어떤 안주가 어울릴까?")?.id).toBe("minari-jeon");
    expect(heroMenu("사발에 따라요","막걸리는 왜 사발에 따라 마실까?")?.id).toBe("baedari-makgeolli");
    expect(heroMenu("오늘 이야기","비 오는 날")).toBeUndefined();
  });

  it("keeps seasonal menus to their season and all-year menus always", () => {
    expect(menusInSeason("겨울").map(item=>item.id)).toContain("gwamegi");
    expect(menusInSeason("여름").map(item=>item.id)).not.toContain("gwamegi");
    expect(menusInSeason("여름").map(item=>item.id)).toContain("baedari-makgeolli");
  });

  it("attaches the right Korean particle", () => {
    expect(josa("과메기","이","가")).toBe("과메기가");
    expect(josa("미나리전","이","가")).toBe("미나리전이");
  });
});

describe("hongeo-jjim (홍어찜)", () => {
  it("is its own menu, not sliced hongeo-hoe", async () => {
    const { buildImagePrompt }=await import("@/features/images/openaiRequest");
    const { createFallbackCarouselPlan }=await import("@/features/images/carousel");
    expect(menuOf("홍어찜 한 접시").map(item=>item.id)).toEqual(["hongeo-jjim"]);
    const plan=createFallbackCarouselPlan({topic:"홍어찜은 어떤 맛일까?",slideCount:5});
    expect(plan.slides.map(slide=>slide.headline).join(" ")).not.toContain("삼합");
    const prompt=buildImagePrompt({topic:"홍어찜은 어떤 맛일까?",count:1,aspectRatio:"4:5",slideIndex:2,slideTotal:5,styleAnchor:plan.styleAnchor,slide:plan.slides[1],design:plan.design});
    expect(prompt).toContain("주인공은 홍어찜이다");
    expect(prompt).toContain("홍어찜 장면은 익힌 살의 결");
    expect(prompt).not.toContain("Skate texture:");
    expect(prompt).not.toMatch(/삼합|수육|묵은지/);
  });
});
