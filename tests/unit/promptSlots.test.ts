// @vitest-environment node
// 5칸 구조 이미지 지시문(2026-10-20 계획서 0단계): 긍정 묘사 다섯 칸이 순서대로, 금지는 맨 끝 한 묶음, 메뉴 낱말 은행이 들어간다.
import { describe, expect, it } from "vitest";
import { buildImagePrompt } from "@/features/images/openaiRequest";
import { buildStructuredImagePrompt } from "@/features/images/promptSlots";
import { ImageBriefSchema } from "@/features/images/schema";
import { STORE_MENU } from "@/features/store/menu";

const slide=(over:Record<string,unknown>)=>({role:"cover",layout:"fullscreen",headline:"과메기는 왜 김과 미역에 싸서 먹을까?",subline:"",points:[],visualPrompt:"대나무 소쿠리에 담긴 과메기와 김, 미역, 마늘, 쪽파가 둘러싼 한 상",textPosition:"bottom",figure:"",titleFont:"auto",bodyFont:"auto",variant:0,keywords:["과메기"],...over});
const brief=(over:Record<string,unknown>={})=>ImageBriefSchema.parse({topic:"과메기는 왜 김과 미역에 싸서 먹을까?",count:1,slide:slide({}),slideIndex:1,slideTotal:5,styleAnchor:"따뜻한 색온도, 검은 옹기, 짙은 나무 테이블, 과메기",promptLayout:"structured",...over});

describe("structured prompt",()=>{
  it("orders the five slots, puts prohibitions last as one block, and uses the menu vocabulary bank",()=>{
    const prompt=buildStructuredImagePrompt(brief());
    const order=["[Main dish]","[Plating & tableware]","[Environment & mood]","[Texture details]","[Shot]","[Series consistency]","[Do not]"].map(label=>prompt.indexOf(label));
    expect(order.every(index=>index>=0)).toBe(true);
    expect([...order].sort((a,b)=>a-b)).toEqual(order);
    expect(prompt).toContain("bamboo basket platter (sokuri)");
    expect(prompt).toContain("ultra-glistening oily surface");
    expect(prompt).toContain("Vertical portrait framing");
    expect(prompt).not.toMatch(/홍어|skate/i);
    // 금지는 한 묶음: "No text"가 한 번만.
    expect(prompt.match(/No text/g)?.length).toBe(1);
    // 공통 스타일에서 음식 이름은 걷어 낸다.
    expect(prompt).not.toContain("과메기,");
  });
  it("keeps the skate accuracy rules inside the dish and texture slots",()=>{
    const prompt=buildStructuredImagePrompt(brief({topic:"홍어회는 왜 처음 먹을 때 코가 찡할까?",slide:slide({headline:"홍어회는 왜 코가 찡할까?",visualPrompt:"검은 접시에 줄지어 담긴 홍어회와 초장 종지",keywords:["홍어회"]})}));
    expect(prompt).toContain("dusty mauve-pink");
    expect(prompt).toContain("never bacon, ham or pork belly");
    expect(prompt.indexOf("dusty mauve-pink")).toBeLessThan(prompt.indexOf("[Do not]"));
    const cooked=buildStructuredImagePrompt(brief({topic:"홍어찜은 왜 쪄도 살이 쫀득할까?",slide:slide({headline:"홍어찜은 왜 쫀득할까?",visualPrompt:"접시에 담긴 김 오르는 홍어찜",keywords:["홍어찜"]})}));
    expect(cooked).toContain("opaque ivory cooked flesh");
    expect(cooked).toContain("never exaggerate the fibers");
  });
  it("is used by buildImagePrompt only when asked for, for photo style without a reference image",()=>{
    expect(buildImagePrompt(brief())).toContain("[Main dish]");
    expect(buildImagePrompt(brief({promptLayout:undefined}))).not.toContain("[Main dish]");
    expect(buildImagePrompt(brief({imageStyle:"anime"}))).not.toContain("[Main dish]");
    expect(buildImagePrompt(brief({referenceImage:"data:image/png;base64,AAAA",referenceMode:"dish"}),true)).not.toContain("[Main dish]");
  });
  it("every menu has plating and texture vocabulary without price or origin claims",()=>{
    for(const item of STORE_MENU){
      expect(item.plating.length).toBeGreaterThan(30);
      expect(item.texture.length).toBeGreaterThan(30);
      expect(item.plating+item.texture).not.toMatch(/원|₩|\d+g|국내산|흑산|domestic|Heuksan/);
    }
  });
});
