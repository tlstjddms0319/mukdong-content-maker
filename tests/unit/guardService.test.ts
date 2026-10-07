// @vitest-environment node
import { describe, expect, it } from "vitest";
import { checkTextClaims, servingClaimIssues } from "@/features/guard/service";

describe("claim guard", () => {
  it.each(["흑산도 홍어", "냄새 없음", "누구나 먹음", "삭힘 선택 가능", "홍어는 누구나 좋아해요", "향이 전혀 없어요"])("blocks unsupported claim: %s", (text) => {
    expect(checkTextClaims(text).blocked).toHaveLength(1);
  });

  it("marks changing store facts for verification", () => {
    const result = checkTextClaims("삼합 중 50,000원, 월요일부터 토요일 15시부터 영업합니다.");
    expect(result.verify).toEqual(expect.arrayContaining([expect.stringContaining("가격"), expect.stringContaining("영업시간")]));
  });
});

describe("wider claim guard", () => {
  it.each(["냄새 걱정 없이 즐겨요","향이 거의 안 나요","냄새가 안 나요","주차 가능해요","단체 예약 가능해요","포장 가능합니다","예약 가능해요"])("blocks unverified guarantee or service: %s", (text) => {
    expect(checkTextClaims(text).blocked.length).toBeGreaterThan(0);
  });
  it.each([
    ["2만 원대로 즐겨요","가격"],["1만5천원이에요","가격"],["1인 3만원","가격"],
    ["밤 11시까지 열어요","영업시간"],["월요일은 쉬어요","영업시간"],
    ["국내산 홍어예요","원산지"],["칠레산 홍어","원산지"],["목포에서 올라온 홍어","원산지"],
    ["30일 숙성한 홍어","숙성"],["3대째 이어 온 맛","숙성"],
  ])("asks to verify: %s", (text,word) => {
    expect(checkTextClaims(text).verify.join(" ")).toContain(word);
  });
  it.each(["방문 전 전화로 예약 가능 여부를 확인해 보세요.","찬바람이 불면 과메기를 찾는 사람이 많아요.","한 점씩 천천히 맛보세요.","산뜻한 미나리 향이 나요."])("leaves plain guidance alone: %s", (text) => {
    const result=checkTextClaims(text);
    expect(result.blocked).toEqual([]);
    expect(result.verify).toEqual([]);
  });
});

describe("store serving claims", () => {
  it("catches the store asserting what it serves anywhere, but not the reader's plans", () => {
    expect(servingClaimIssues("찬바람이 불면 묵동홍어마을에서 과메기를 내놓아요.")).toHaveLength(1);
    expect(servingClaimIssues("정갈한 삼합 한 상을 준비하고 있습니다.",{storeParagraph:true})).toHaveLength(1);
    expect(servingClaimIssues("연말 모임을 준비하고 있다면, 묵동홍어마을의 메뉴도 살펴보세요.",{storeParagraph:true})).toEqual([]);
    expect(servingClaimIssues("이 조합이 궁금해졌다면, 묵동에서 과메기를 찾을 때 묵동홍어마을의 메뉴도 살펴보세요.",{storeParagraph:true})).toEqual([]);
    expect(servingClaimIssues("과메기는 김과 함께 먹으면 바다 향이 살아나요.")).toEqual([]);
  });
});
