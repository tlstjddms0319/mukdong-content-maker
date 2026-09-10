// @vitest-environment node
import { describe, expect, it } from "vitest";
import { checkTextClaims } from "@/features/guard/service";

describe("claim guard", () => {
  it.each(["흑산도 홍어", "냄새 없음", "누구나 먹음", "삭힘 선택 가능"])("blocks unsupported claim: %s", (text) => {
    expect(checkTextClaims(text).blocked).toHaveLength(1);
  });

  it("marks changing store facts for verification", () => {
    const result = checkTextClaims("삼합 중 50,000원, 월요일부터 토요일 15시부터 영업합니다.");
    expect(result.verify).toEqual(expect.arrayContaining([expect.stringContaining("가격"), expect.stringContaining("영업시간")]));
  });
});
