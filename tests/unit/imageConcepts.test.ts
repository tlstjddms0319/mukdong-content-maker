// @vitest-environment node
// 그림 콘셉트(images/concepts.ts, 사장님 요청 2026-10-13): 글 내용에 맞는 그림(캐릭터 대결·상황 일러스트·단면 그림)을 AI가 제안하고
// 사장님이 고르면 장마다 장면·화풍을 바꿔 넣는다. 실사 사진은 늘 첫 번째 선택지다.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only",()=>({}));
import { createFallbackCarouselPlan } from "@/features/images/carousel";
import { CONCEPT_KINDS, applyConcept, buildConceptPrompt, photoConcept, readConceptProposal } from "@/features/images/concepts";
import { resolveImageStyle } from "@/features/images/style";
import { buildImagePrompt } from "@/features/images/openaiRequest";
import { expectedCoverFrom } from "@/features/images/coverCheck";

const plan=createFallbackCarouselPlan({topic:"홍어와 가오리는 왜 다르게 먹을까?",slideCount:5,track:"photo"});
const scene=(n:number)=>`${n}장: 홍어 캐릭터와 가오리 캐릭터가 링 위에서 마주 선 장면, 관중석은 흐릿하게`;
const proposal=(over:Record<string,unknown>={})=>({recommended:0,concepts:[{kind:"character",title:"홍어 vs 가오리 권투",summary:"두 생선 캐릭터가 링 위에서 맞붙어요",reason:"비교 주제라 대결이 잘 어울려요",
  slides:plan.slides.map((_,i)=>({slide:i+1,drawn:i<4,visualPrompt:i<4?scene(i+1):""})),...over}]});

describe("concept proposals",()=>{
  it("always offers the photo concept first, built from the plan's own scenes",()=>{
    const photo=photoConcept(plan);
    expect(photo.kind).toBe("photo");
    expect(photo.summary).toContain("홍어");
    expect(photo.slides.every(slide=>!slide.drawn)).toBe(true);
    expect(photo.slides.map(slide=>slide.visualPrompt)).toEqual(plan.slides.map(slide=>slide.visualPrompt));
  });

  it("tells the AI the kinds, the compared pair, and that the photo track draws only the cover",()=>{
    const prompt=buildConceptPrompt(plan,"홍어와 가오리는 왜 다르게 먹을까?","photo");
    for(const kind of CONCEPT_KINDS.filter(kind=>kind.id!=="photo"))expect(prompt).toContain(`${kind.id} (${kind.label})`);
    expect(prompt).toContain("'홍어'와 '가오리'를 견줍니다");
    expect(prompt).toContain("말풍선");
    expect(buildConceptPrompt(plan,"홍어와 가오리는 왜 다르게 먹을까?","text")).toContain("표지(1장)만 drawn:true");
  });

  it("keeps a valid proposal, falls back to photo for slides with no scene, and drops broken ones",()=>{
    const good=readConceptProposal(proposal(),plan,"photo");
    expect(good.concepts).toHaveLength(1);
    expect(good.concepts[0].slides.map(slide=>slide.drawn)).toEqual([true,true,true,true,false]);
    expect(good.concepts[0].slides[4].visualPrompt).toBe(plan.slides[4].visualPrompt);
    // 글 중심은 표지만 그림이다
    const text=readConceptProposal(proposal(),plan,"text");
    expect(text.concepts[0].slides.map(slide=>slide.drawn)).toEqual([true,false,false,false,false]);
    // 장 수가 다르거나 그림 장이 하나도 없거나 영어 제목이면 버린다
    expect(readConceptProposal(proposal({slides:[{slide:1,drawn:true,visualPrompt:scene(1)}]}),plan,"photo").concepts).toHaveLength(1);
    expect(readConceptProposal(proposal({slides:plan.slides.map((_,i)=>({slide:i+1,drawn:false,visualPrompt:""}))}),plan,"photo").concepts).toHaveLength(0);
    expect(readConceptProposal(proposal({title:"Skate VS Ray"}),plan,"photo").concepts).toHaveLength(0);
    expect(readConceptProposal({nope:true},plan,"photo").concepts).toHaveLength(0);
  });

  it("applies a drawn concept per slide and leaves the photo concept untouched",()=>{
    const {concepts}=readConceptProposal(proposal(),plan,"photo");
    const applied=applyConcept(plan,concepts[0]);
    expect(applied.slides[0]).toMatchObject({imageStyle:"character",visualPrompt:scene(1)});
    expect(applied.slides[4]).toMatchObject({imageStyle:"photo",visualPrompt:plan.slides[4].visualPrompt});
    expect(applied.styleAnchor).toContain("캐릭터 일러스트");
    expect(applied.styleAnchor.length).toBeLessThanOrEqual(500);
    expect(applyConcept(plan,photoConcept(plan))).toBe(plan);
  });
});

describe("drawn slides reach the image prompt",()=>{
  it("prefers the slide's own style over the post style, and relaxes the face rule for characters",()=>{
    expect(resolveImageStyle({imageStyle:"photo",slide:{imageStyle:"character"}})).toBe("character");
    expect(resolveImageStyle({imageStyle:"anime",slide:{imageStyle:"photo"}})).toBe("anime");
    const {concepts}=readConceptProposal(proposal(),plan,"photo");
    const applied=applyConcept(plan,concepts[0]);
    const drawn=buildImagePrompt({topic:"홍어와 가오리는 왜 다르게 먹을까?",count:1,aspectRatio:"4:5",slide:applied.slides[0],slideIndex:1,slideTotal:5,styleAnchor:applied.styleAnchor} as never);
    expect(drawn).toContain("mascot-character illustration");
    expect(drawn).toContain("right number of limbs and fingers");
    expect(drawn).toContain("Cartoon character faces are fine");
    expect(drawn).not.toContain("Skate texture: muted dusty mauve-pink flesh");
    const photo=buildImagePrompt({topic:"홍어와 가오리는 왜 다르게 먹을까?",count:1,aspectRatio:"4:5",slide:applied.slides[4],slideIndex:5,slideTotal:5,styleAnchor:applied.styleAnchor} as never);
    expect(photo).toContain("Editorial food photography");
    expect(photo).toContain("never render a recognizable face");
  });

  it("checks a drawn cover as a drawing of the food, not as a photo",()=>{
    expect(expectedCoverFrom("홍어는 왜 삭을까?",{headline:"홍어는 왜 삭을까?",imageStyle:"photo"}).description).not.toContain("캐릭터");
    const drawn=expectedCoverFrom("홍어는 왜 삭을까?",{headline:"홍어는 썩은 게 아니라고?",imageStyle:"character"});
    expect(drawn.name).toContain("홍어");
    expect(drawn.description).toContain("의인화한 캐릭터");
  });
});
