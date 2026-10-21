// @vitest-environment node
import { describe, expect, it } from "vitest";
import { STORE_MENU, heroMenu, josa, mainMenuOf, menuOf, menusInSeason } from "@/features/store/menu";

describe("store menu", () => {
  it("lists the menus the owner named (홍어찜 from the shop poster), each with a look and a category", () => {
    // 네이버 플레이스 메뉴(2026-10-09 업데이트)로 홍어전·묵은지김치전·해물라면·홍어라면·지평 막걸리를 더했다.
    expect(STORE_MENU.map(item=>item.name)).toEqual(["홍어회(홍어사시미·삼합)","홍어무침","홍어애탕","홍어찜","홍어전","홍어라면","과메기","미나리전","묵은지김치전","해물라면","막걸리(배다리·지평)"]);
    expect(new Set(STORE_MENU.map(item=>item.id)).size).toBe(STORE_MENU.length);
    for(const item of STORE_MENU){
      expect(item.look.length).toBeGreaterThan(20);
      expect(item.lookKo.length).toBeGreaterThan(5);
      expect(["홍어 요리","제철 회","전","식사","술"]).toContain(item.category);
      // 겉모습 묘사에 가격·원산지 같은 사실을 만들지 않는다.
      expect(item.look+item.lookKo).not.toMatch(/원|₩|\d+g|국내산|흑산/);
    }
  });

  it("finds menus in the order they appear in the text", () => {
    expect(menuOf("미나리전엔 왜 막걸리가 생각날까?").map(item=>item.id)).toEqual(["minari-jeon","baedari-makgeolli"]);
    expect(menuOf("홍어 삼합 한 점").map(item=>item.id)).toEqual(["hongeo-hoe"]);
    expect(menuOf("홍어무침과 홍어회").map(item=>item.id)).toEqual(["hongeo-muchim","hongeo-hoe"]);
    expect(menuOf("홍어애탕 한 그릇").map(item=>item.id)).toEqual(["hongeo-aetang"]);
    // 가게 이름은 메뉴가 아니고, 홍어전·홍어라면은 홍어회가 아니라 각자의 메뉴다.
    expect(menuOf("묵동홍어마을 소식")).toEqual([]);
    expect(menuOf("홍어전 한 장").map(item=>item.id)).toEqual(["hongeo-jeon"]);
    expect(menuOf("홍어라면 한 그릇").map(item=>item.id)).toEqual(["hongeo-ramyeon"]);
    // 이 가게는 홍어회를 "홍어사시미"로도 부른다.
    expect(menuOf("홍어사시미 한 접시").map(item=>item.id)).toEqual(["hongeo-hoe"]);
    expect(menuOf("묵은지김치전에 막걸리").map(item=>item.id)).toEqual(["kimchi-jeon","baedari-makgeolli"]);
    expect(menuOf("김치전 한 장").map(item=>item.id)).toEqual(["kimchi-jeon"]);
    expect(menuOf("마무리로 해물라면").map(item=>item.id)).toEqual(["haemul-ramyeon"]);
    expect(menuOf("지평 막걸리 한 병").map(item=>item.id)).toEqual(["baedari-makgeolli"]);
    expect(mainMenuOf(undefined,"오늘의 이야기","과메기 한 접시")?.id).toBe("gwamegi");
  });

  it("picks the hero of a slide from its copy and the topic", () => {
    expect(heroMenu("막걸리 한 잔을 곁들여요","과메기는 왜 찬바람이 불면 찾을까?")?.id).toBe("gwamegi");
    expect(heroMenu("미나리전 한 장을 곁들여요","막걸리 한 잔엔 어떤 안주가 어울릴까?")?.id).toBe("minari-jeon");
    expect(heroMenu("사발에 따라요","막걸리는 왜 사발에 따라 마실까?")?.id).toBe("baedari-makgeolli");
    expect(heroMenu("오늘 이야기","비 오는 날")).toBeUndefined();
    // 곁들임만 말하는 장(2026-10-21): 쪽파·김·미역은 과메기 쌈이라 주제가 홍어라도 과메기가 주인공.
    expect(heroMenu("쪽파의 매운맛이 뒷맛을 끊어요 알싸한 자극이 기름진 뒷맛을 씻어 줘요","홍어와 과메기, 겨울에 같이 먹으면 왜 더 맛있을까?")?.id).toBe("gwamegi");
    expect(heroMenu("김에 싸서 한 입","홍어회는 왜 코가 찡할까?")?.id).toBe("gwamegi");
    expect(heroMenu("뚝배기에서 김이 올라요","홍어애탕은 왜 국물이 묵직할까?")?.id).toBe("hongeo-aetang");
    expect(heroMenu("홍어 한 점에 쪽파를 얹어요","홍어회는 왜 코가 찡할까?")?.id).toBe("hongeo-hoe");
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

describe("menus added from the Naver place menu", () => {
  const brief=async(topic:string)=>{
    const { createFallbackCarouselPlan }=await import("@/features/images/carousel");
    const plan=createFallbackCarouselPlan({topic,slideCount:5});
    return {plan,brief:{topic,count:1,aspectRatio:"4:5" as const,slideIndex:3,slideTotal:5,styleAnchor:plan.styleAnchor,slide:plan.slides[2],design:plan.design}};
  };

  it("writes each new menu's own fallback slides instead of hongeo-hoe words", async () => {
    for(const [topic,dish] of [["묵은지김치전은 왜 막걸리 안주로 찾을까?","김치전"],["술자리 마지막엔 왜 라면이 생각날까? 해물라면","해물라면"],["홍어전은 어떤 맛일까?","홍어전"],["홍어라면은 어떤 맛일까?","홍어라면"]] as const){
      const {plan}=await brief(topic);
      const text=plan.slides.map(slide=>[slide.headline,...slide.points,slide.visualPrompt].join(" ")).join(" ");
      expect(text).toContain(dish);
      expect(text).not.toContain("홍어 살의 단면");
    }
  });

  it("does not treat 묵은지김치전 as a skate table", async () => {
    const { buildImagePrompt }=await import("@/features/images/openaiRequest");
    const {brief:input}=await brief("묵은지김치전은 왜 막걸리 안주로 찾을까?");
    const prompt=buildImagePrompt({...input,slide:{...input.slide,headline:"묵은지김치전 가장자리가 바삭해요",points:["묵은지가 반죽 사이로 보여요"]}});
    expect(prompt).toContain("주인공은 김치전이다");
    expect(prompt).not.toMatch(/skate|Skate texture|홍어/);
  });

  it("draws 홍어라면 as a noodle bowl and 홍어전 as a pan-fried jeon, not raw slices", async () => {
    const { buildImagePrompt }=await import("@/features/images/openaiRequest");
    const ramyeon=buildImagePrompt((await brief("홍어라면은 어떤 맛일까?")).brief);
    expect(ramyeon).toContain("주인공은 홍어라면이다");
    expect(ramyeon).toContain("홍어라면 장면은");
    expect(ramyeon).not.toContain("Show the skate only as sliced pieces");
    expect(ramyeon).not.toContain("Skate texture:");
    const jeon=buildImagePrompt((await brief("홍어전은 어떤 맛일까?")).brief);
    expect(jeon).toContain("주인공은 홍어전이다");
    expect(jeon).toContain("노릇");
    expect(jeon).not.toContain("Skate texture:");
  });
});
