import { describe,expect,it } from "vitest";
import { TRACK_LOOKS,applyTrack,nextTrackLook,pickTrackLook } from "@/features/images/track";
import { createFallbackCarouselPlan } from "@/features/images/carousel";

describe("갈래 모양 고르기",()=>{
  it("갈래마다 모양 이름이 있고 기존 모양(0번)도 들어 있다",()=>{
    expect(TRACK_LOOKS.photo.map(look=>look.name)).toEqual(["기본","매거진","반반","숙성 도장","순서 카드","레트로 간판","원형 그릇","먹색 액자","경매표","박물관 라벨"]);
    expect(TRACK_LOOKS.text.map(look=>look.name)).toEqual(["기본","메모지","노포 메뉴판","한지 붓글씨","호외 신문","공지 안내판","큰 한 글자","승차권"]);
  });
  it("바로 전 게시물 모양은 피하고, 범위 안에서 고른다",()=>{
    for(let i=0;i<50;i++){
      const look=pickTrackLook("photo",2);
      expect(look).not.toBe(2);
      expect(look).toBeGreaterThanOrEqual(0);
      expect(look).toBeLessThan(TRACK_LOOKS.photo.length);
    }
    expect(pickTrackLook("text",undefined,()=>0)).toBe(0);
    expect(pickTrackLook("text",0,()=>0)).toBe(1);
    expect(pickTrackLook("text",99,()=>.999)).toBe(7); // 저장값이 범위 밖이어도 안전하게
  });
  it("'다른 모양으로'는 다음 모양으로 돌고 끝에서 처음으로 간다",()=>{
    expect(nextTrackLook("text",0)).toBe(1);
    expect(nextTrackLook("text",7)).toBe(0);
    expect(nextTrackLook("photo",9)).toBe(0);
  });
  it("갈래 맞추기(applyTrack)를 다시 해도 고른 모양은 그대로 남는다",()=>{
    const plan=applyTrack(createFallbackCarouselPlan({topic:"홍어 한 점",track:"photo"}),"photo");
    const looked={...plan,design:{...plan.design,look:3}};
    expect(applyTrack(looked,"photo").design.look).toBe(3);
    expect(applyTrack(createFallbackCarouselPlan({topic:"홍어 한 점",track:"photo"}),"photo").design.look).toBe(0);
  });
});

describe("확인 화면의 모양 표시",()=>{
  it("갈래 게시물이면 지금 모양 이름과 번호, 아니면 없음",async()=>{
    const { trackLookOf }=await import("@/features/images/generationStore");
    const plan=applyTrack(createFallbackCarouselPlan({topic:"홍어 한 점",track:"text"}),"text");
    expect(trackLookOf({input:{track:"text"} as never,plan:{...plan,design:{...plan.design,look:2}}})).toEqual({name:"노포 메뉴판",number:3,count:8,track:"text",look:2});
    expect(trackLookOf({input:{} as never,plan})).toBeNull();
    // 저장된 모양 번호가 목록보다 크면(모양을 줄였을 때) 마지막 모양으로 본다
    expect(trackLookOf({input:{track:"text"} as never,plan:{...plan,design:{...plan.design,look:15}}})?.name).toBe("승차권");
  });
});
