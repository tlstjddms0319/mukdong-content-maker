import { describe, expect, it } from "vitest";
import { buildSlideRequestPrompt, fallbackSlideDraft, looksLikeRequest, wantsStoreCard, SlideRequestSchema } from "@/features/images/slideRequest";

const input=(request:string)=>SlideRequestSchema.parse({topic:"홍어가 코를 찡하게 하는 이유",request,source:"ai"});

describe("new slide request", () => {
  it("recognises a store promotion request and never prints the request itself", () => {
    const text="묵동 홍어마을을 홍보하는 마지막 카드뉴스를 넣을거야.\n마지막에 묵동 홍어마을 로고가 들어가면 좋겠어\n홍어 캐릭터도 나오면 좋을 거 같아";
    expect(wantsStoreCard(text)).toBe(true);
    const draft=fallbackSlideDraft(input(text));
    expect(draft.kind).toBe("store");
    expect([draft.headline,...draft.points].join(" ")).not.toMatch(/넣을거야|좋겠어|좋을 거/);
  });
  it("treats instruction-like text as a request and plain copy as copy", () => {
    expect(looksLikeRequest("미나리전과 막걸리를 같이 소개해 줘")).toBe(true);
    expect(looksLikeRequest("묵은지에 싸 먹으면 더 맛있어요")).toBe(false);
    const plain=fallbackSlideDraft(input("묵은지에 싸 먹으면 더 맛있어요\n한입 크기로 싸요"));
    expect(plain).toMatchObject({kind:"content",headline:"묵은지에 싸 먹으면 더 맛있어요",points:["한입 크기로 싸요"]});
  });
  it("tells the text AI that the quoted text is a request, not the card copy", () => {
    const prompt=buildSlideRequestPrompt(input("미나리전 소개해 줘"));
    expect(prompt).toContain("카드에 그대로 쓸 문구가 아닙니다");
    expect(prompt).toContain('"store"');
    expect(prompt).toContain("젓가락으로 한 점을 집어 든 모습은 요청이 그걸 말할 때만");
  });
});
