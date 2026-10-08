// 사진+AI: 사장님 사진의 "음식 그대로"는 표지에만. 2장부터는 색감·조명만 이어 가고 장면은 장 글대로 만든다.
import { describe, expect, it } from "vitest";
import { deckPhotoNotes, referenceFieldsFor } from "@/features/images/generationStore";

const photo="data:image/jpeg;base64,AAAA";

describe("photo + AI reference use per slide", () => {
  it("keeps the food only on the cover and passes the mood to the other slides", () => {
    const state={mode:"mix" as const,photoPreview:photo,referenceUse:"source" as const,cover:undefined};
    expect(referenceFieldsFor("cover",state)).toEqual({referenceImage:photo,referenceMode:"source"});
    for(const role of ["detail","how-to","pairing","visit"] as const)expect(referenceFieldsFor(role,state)).toEqual({referenceImage:photo,referenceMode:"style"});
  });

  it("uses mood only everywhere when the owner chose it", () => {
    const state={mode:"mix" as const,photoPreview:photo,referenceUse:"style" as const,cover:undefined};
    expect(referenceFieldsFor("cover",state).referenceMode).toBe("style");
  });

  it("does not send the AI cover to later slides in plain AI mode (the image AI copied it onto every slide)", () => {
    const cover={id:"c",preview:photo,referencePreview:photo,source:"ai-generated" as const};
    expect(referenceFieldsFor("detail",{mode:"ai",photoPreview:"",referenceUse:"source",cover})).toEqual({});
    expect(referenceFieldsFor("detail",{mode:"ai",photoPreview:"",referenceUse:"source",cover:undefined})).toEqual({});
  });
});

describe("photo notes handed to the caption writer", () => {
  const slide={id:"s",source:"photo" as const};
  it("lists what is in the photos the deck actually uses, once each, in slide order", () => {
    const notes=deckPhotoNotes({mode:"photo",slides:[slide,slide,slide],photoAssignment:[[2],[0],[2]],photoNotes:["홍어회 접시","","막걸리 사발","쓰지 않은 사진"],referenceNote:""});
    expect(notes).toEqual(["막걸리 사발","홍어회 접시"]);
  });
  it("uses the reference photo for photo + AI and nothing when unknown", () => {
    expect(deckPhotoNotes({mode:"mix",slides:[],photoAssignment:[],photoNotes:[],referenceNote:"홍어회 한 접시"})).toEqual(["홍어회 한 접시"]);
    expect(deckPhotoNotes({mode:"mix",slides:[],photoAssignment:[],photoNotes:[],referenceNote:""})).toBeUndefined();
    expect(deckPhotoNotes({mode:"ai",slides:[slide],photoAssignment:[],photoNotes:[],referenceNote:""})).toBeUndefined();
    expect(deckPhotoNotes({mode:"photo",slides:[],photoAssignment:[[0]],photoNotes:["접시"],referenceNote:""})).toBeUndefined();
  });
});
