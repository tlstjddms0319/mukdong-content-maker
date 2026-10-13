// @vitest-environment node
import { describe, expect, it } from "vitest";
import { pickSkateReference } from "@/features/images/skateReference";
import type { LibraryAsset } from "@/features/images/freeCards";

let seq=0;
function asset(name:string,tags:string[],extra:Partial<LibraryAsset>={}):LibraryAsset {
  seq++;
  return {
    id:`00000000-0000-4000-8000-${String(seq).padStart(12,"0")}`,
    name,tags,kind:"photo",credit:"묵동홍어마을 직접 촬영",
    preview:`data:image/jpeg;base64,${name}`,
    createdAt:`2026-10-${String(10+seq).padStart(2,"0")}T00:00:00.000Z`,lastUsedAt:null,useCount:0,quality:null,
    ...extra,
  };
}
const slide={role:"detail" as const,imageStyle:"photo" as const,headline:"결이 이렇게 살아 있어요",points:["얇게 썰면 결이 비쳐 보여요"],visualPrompt:"접시 위 홍어 살 단면을 가까이 담은 장면",textPosition:"top" as const,keywords:[],layout:"frame" as const,subline:"",figure:"",titleFont:"auto" as const,bodyFont:"auto" as const,variant:0};
const brief={topic:"홍어회는 왜 결이 보일까?",count:1,aspectRatio:"4:5" as const,slide,slideIndex:2,slideTotal:5,styleAnchor:"따뜻한 색온도"};

describe("store skate photo as the image reference", () => {
  it("picks the owner's own raw hongeo photo for a raw skate scene", () => {
    const hoe=asset("홍어회 한 판",["홍어회"]);
    const picked=pickSkateReference([asset("홍어무침",["홍어무침"]),asset("막걸리",["막걸리"]),hoe],brief);
    expect(picked?.id).toBe(hoe.id);
  });
  it("ignores cooked hongeo, illustrations, stock and AI images", () => {
    const assets=[
      asset("홍어애탕",["홍어","애탕"]),
      asset("홍어찜",["홍어"]),
      asset("홍어 캐릭터",["홍어"],{kind:"illustration"}),
      asset("홍어회 샘플",["홍어회"],{kind:"stock"}),
      asset("홍어회 AI",["홍어회"],{kind:"ai-generated"}),
    ];
    expect(pickSkateReference(assets,brief)).toBeUndefined();
  });
  it("does not trust the topic tag the upload screen adds automatically", () => {
    // 홍어 글을 쓰다 올린 과메기 사진에는 "주제:홍어…" 검색어가 붙는다. 사진 속 음식이 아니다.
    expect(pickSkateReference([asset("과메기 한 접시",["주제:홍어회는 왜 결이 보일까","매장 사진"])],brief)).toBeUndefined();
    expect(pickSkateReference([asset("IMG 1234",["주제:홍어 한 상","매장 사진"])],brief)).toBeUndefined();
  });
  it("prefers a sharp, well-lit photo over a flagged one", () => {
    const dark=asset("홍어회 어두운",["홍어회"],{quality:{luminance:0.1,saturation:0.2,cast:0,sharpness:1,longSide:1400,flags:["dark"]}});
    const good=asset("홍어회 밝은",["홍어회"],{quality:{luminance:0.5,saturation:0.3,cast:0,sharpness:9,longSide:1400,flags:[]}});
    expect(pickSkateReference([dark,good],brief)?.id).toBe(good.id);
  });
  it("leaves scenes alone when the owner attached a photo, the style is an illustration, or skate is not the hero", () => {
    const assets=[asset("홍어회",["홍어회"])];
    expect(pickSkateReference(assets,{...brief,referenceImage:"data:image/jpeg;base64,eA==",referenceMode:"source"})).toBeUndefined();
    expect(pickSkateReference(assets,{...brief,imageStyle:"anime"})).toBeUndefined();
    expect(pickSkateReference(assets,{...brief,topic:"과메기는 왜 겨울에 먹을까?",slide:{...slide,headline:"과메기 결이 살아 있어요",points:["과메기를 얇게 썰어요"],visualPrompt:"접시 위 과메기"}})).toBeUndefined();
  });
});
