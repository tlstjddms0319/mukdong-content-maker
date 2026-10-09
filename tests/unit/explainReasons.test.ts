// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { buildCarouselPlanPrompt, createFallbackCarouselPlan, type CarouselPlan } from "@/features/images/carousel";
import { slideCopyIssues } from "@/features/images/planReview";
import { buildCopyPrompt } from "@/features/copy/writing";
import { PROMO_IN_CARD } from "@/features/copy/explain";

vi.mock("server-only", () => ({}));

// 사장님 요청(2026-10-09): 표지에서 "왜 그럴까?"를 던지고 본문은 홍보만 하던 문제.
// 이유(과학·감각·문화)로 답하게 하고, 카드 본문에서는 가게 홍보를 빼며, 캡션도 홍보 비중을 줄인다.
describe("explain reasons instead of promoting", () => {
  it("asks the card plan to answer with real reasons and keep the store out of the cards", () => {
    for(const track of ["text","photo"] as const){
      const prompt=buildCarouselPlanPrompt({topic:"홍어는 왜 수육이랑 먹을까?",slideCount:5,track});
      expect(prompt).toContain("[이유 설명]");
      expect(prompt).toContain("가게 이름(묵동홍어마을)·방문 권유");
      expect(prompt).not.toContain("확인된 정보로 쓸 수 없으면 눈이나 입으로");
    }
    const free=buildCarouselPlanPrompt({topic:"홍어는 왜 수육이랑 먹을까?",slideCount:5});
    expect(free).toContain("[이유 설명]");
    expect(free).not.toContain("방문 전 확인할 것으로 닫으세요");
  });

  it("makes the caption mostly explanation with a light store line", () => {
    const prompt=buildCopyPrompt({topic:"홍어는 왜 수육이랑 먹을까?",audience:"C"} as Parameters<typeof buildCopyPrompt>[0],"medium");
    expect(prompt).toContain("[이유 설명]");
    expect(prompt).toContain("약 85%");
    expect(prompt).not.toContain("목표는 매장 방문·예약 검토");
    expect(prompt).not.toContain("관찰 가능한 식감과 개인별 차이만");
    // 가게 연결·행동 제안 칸은 그대로 있다(캡션 검사가 이 칸을 본다).
    expect(prompt).toContain("store_connection");
    expect(prompt).toContain("call_to_action");
  });

  it("flags store promotion inside track cards but not reason sentences", () => {
    const base=createFallbackCarouselPlan({topic:"홍어는 왜 수육이랑 먹을까?",slideCount:5,track:"text"});
    const promo:CarouselPlan={...base,slides:base.slides.map((slide,i)=>i===2?{...slide,headline:"묵동홍어마을로 오세요",points:["주말에 들러 보세요"]}:slide)};
    const messages=slideCopyIssues(promo,"text").filter(issue=>issue.slide===3).map(issue=>issue.message).join("\n");
    expect(messages).toContain("가게 이름·방문 권유");
    expect(messages).toContain("'주말에 들러 보세요'");
    for(const text of ["수육 기름이 톡 쏘는 향을 감싸요","삭히면 요소가 암모니아로 바뀌어요","신맛이 짠맛을 덜 느끼게 해요"])expect(PROMO_IN_CARD.test(text),text).toBe(false);
    // 갈래가 없는 예전 구성안은 이 검사를 하지 않는다.
    expect(slideCopyIssues(promo).some(issue=>issue.message.includes("가게 이름·방문 권유"))).toBe(false);
  });
});
