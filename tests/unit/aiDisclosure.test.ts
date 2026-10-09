// @vitest-environment node
// 검수 보고서 B-8: 글을 쓴 뒤 확인 화면에서 AI 장을 넣으면 "AI 연출 이미지" 안내 없이 올라갈 수 있었다.
import { describe, expect, it } from "vitest";
import { AI_IMAGE_DISCLOSURE, withAiDisclosure } from "@/features/copy/writing";

describe("AI image disclosure added later", () => {
  it("puts the notice before the hashtags, like a freshly written caption", () => {
    const caption="비 오는 날엔 홍어 한 점 어때요?\n\n삭힌 정도에 따라 향이 달라요.\n\n#묵동홍어마을 #묵동맛집";
    expect(withAiDisclosure(caption)).toBe(`비 오는 날엔 홍어 한 점 어때요?\n\n삭힌 정도에 따라 향이 달라요.\n\n${AI_IMAGE_DISCLOSURE}\n\n#묵동홍어마을 #묵동맛집`);
  });
  it("adds it at the end when there are no hashtags, and never twice", () => {
    expect(withAiDisclosure("홍어 한 점 어때요?")).toBe(`홍어 한 점 어때요?\n\n${AI_IMAGE_DISCLOSURE}`);
    const once=withAiDisclosure("홍어 한 점 어때요?\n\n#묵동홍어마을");
    expect(withAiDisclosure(once)).toBe(once);
  });
  it("leaves an empty caption alone (the caption writer adds it)", () => {
    expect(withAiDisclosure("")).toBe("");
  });
});
