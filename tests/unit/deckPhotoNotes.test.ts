// 글 쓰기에 넘기는 "게시물에 실제로 들어간 사진에 보이는 것". (예전 사진+AI 참고 사진 시험은 그 방식과 함께 지웠다.)
import { describe, expect, it } from "vitest";
import { deckPhotoNotes } from "@/features/images/generationStore";

describe("photo notes handed to the caption writer", () => {
  const slide={id:"s",source:"photo" as const};
  it("lists what is in the photos the deck actually uses, once each, in slide order", () => {
    const notes=deckPhotoNotes({mode:"photo",slides:[slide,slide,slide],photoAssignment:[[2],[0],[2]],photoNotes:["홍어회 접시","","막걸리 사발","쓰지 않은 사진"]});
    expect(notes).toEqual(["막걸리 사발","홍어회 접시"]);
  });

  it("returns nothing for an AI deck, an empty deck or unknown photos", () => {
    expect(deckPhotoNotes({mode:"ai",slides:[slide],photoAssignment:[],photoNotes:[]})).toBeUndefined();
    expect(deckPhotoNotes({mode:"photo",slides:[],photoAssignment:[[0]],photoNotes:["접시"]})).toBeUndefined();
    expect(deckPhotoNotes({mode:"photo",slides:[slide],photoAssignment:[[0]],photoNotes:[""]})).toBeUndefined();
  });
});
