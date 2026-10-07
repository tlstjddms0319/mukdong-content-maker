// 사진+AI: 사장님 사진의 "음식 그대로"는 표지에만. 2장부터는 색감·조명만 이어 가고 장면은 장 글대로 만든다.
import { describe, expect, it } from "vitest";
import { referenceFieldsFor } from "@/features/images/generationStore";

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

  it("continues the chosen AI cover in plain AI mode", () => {
    const cover={id:"c",preview:photo,referencePreview:photo,source:"ai-generated" as const};
    expect(referenceFieldsFor("detail",{mode:"ai",photoPreview:"",referenceUse:"source",cover})).toEqual({referenceImage:photo,referenceMode:"continuity"});
    expect(referenceFieldsFor("detail",{mode:"ai",photoPreview:"",referenceUse:"source",cover:undefined})).toEqual({});
  });
});
