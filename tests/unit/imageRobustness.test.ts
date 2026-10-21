// @vitest-environment node
// 사장님 지적(2026-10-13): 홍어찜 그림이 빗살처럼 징그럽게 나옴, 캐릭터가 병에 얼굴만 붙고 장마다 바뀜, 이미지 AI가 한 번 실패하면 바로 "다 만들지 못했어요".
import { describe, expect, it, vi } from "vitest";
import { buildImagePrompt } from "@/features/images/openaiRequest";
import { buildConceptPrompt, CONCEPT_KINDS } from "@/features/images/concepts";
import { createFallbackCarouselPlan } from "@/features/images/carousel";

vi.mock("server-only",()=>({}));

const slide=(headline:string,topic:string)=>({...createFallbackCarouselPlan({topic,slideCount:5,track:"photo"}).slides[1],headline,points:[]});

describe("cooked skate dishes are not drawn with raw-skate fiber detail",()=>{
  it("tones down fibers for 홍어찜 and keeps the raw description for 홍어회",()=>{
    const jjim=buildImagePrompt({topic:"홍어찜은 왜 쪄도 살이 쫀득할까?",count:1,aspectRatio:"4:5",slide:slide("찌는 열에 콜라겐이 풀려요","홍어찜은 왜 쪄도 살이 쫀득할까?"),slideIndex:2,slideTotal:5} as never);
    expect(jjim).toContain("never exaggerate the fibers into combs");
    expect(jjim).not.toContain("separate band of pale ivory cartilage");
    const hoe=buildImagePrompt({topic:"홍어회는 왜 쫀득할까?",count:1,aspectRatio:"4:5",slide:slide("콜라겐이 촘촘히 얽혀 있어요","홍어회는 왜 쫀득할까?"),slideIndex:2,slideTotal:5} as never);
    expect(hoe).toContain("separate band of pale ivory cartilage");
  });
});

describe("character concepts",()=>{
  it("are only for visibly different things, with the same characters in every drawn slide",()=>{
    const character=CONCEPT_KINDS.find(kind=>kind.id==="character")!;
    expect(character.when).toContain("술 상표끼리");
    const plan=createFallbackCarouselPlan({topic:"홍어와 가오리는 왜 다르게 먹을까?",slideCount:5,track:"photo"});
    const prompt=buildConceptPrompt(plan,"홍어와 가오리는 왜 다르게 먹을까?","photo");
    expect(prompt).toContain("같은 캐릭터들이 나오고");
    expect(prompt).toContain("병·잔·그릇에 얼굴만 붙인 것은 안 됨");
  });
});
