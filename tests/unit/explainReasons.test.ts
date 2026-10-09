// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { buildCarouselPlanPrompt, createFallbackCarouselPlan, type CarouselPlan } from "@/features/images/carousel";
import { slideCopyIssues } from "@/features/images/planReview";
import { buildCopyPrompt } from "@/features/copy/writing";
import { PROMO_IN_CARD, VAGUE_REASON } from "@/features/copy/explain";

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

  // 사장님이 보낸 4번째 장: 표지는 "왜"를 묻는데 곁들임(쪽파)으로 새고, "조화롭게 잡아줘요"처럼 결과만 말했다.
  it("flags a vague side-dish turn in the pairing slot", () => {
    const base=createFallbackCarouselPlan({topic:"과메기는 왜 찬바람이 불면 찾을까?",slideCount:5,track:"text"});
    const cover={...base.slides[0],headline:"과메기는 왜 찬바람이 불면 찾을까?"};
    const drift:CarouselPlan={...base,slides:base.slides.map((slide,i)=>i===0?cover:i===3?{...slide,headline:"알싸한 쪽파가 맛을 조화롭게 잡아줘요",points:["기름진 맛을 깔끔하게 정돈해줘요"]}:slide)};
    const messages=slideCopyIssues(drift,"text").filter(issue=>issue.slide===4).map(issue=>issue.message).join("\n");
    expect(messages).toContain("표지에 없는 '쪽파' 이야기");
    expect(messages).toContain("결과만 말하는 막연한 제목");
    expect(messages).toContain("결과만 말하고 이유가 없어요");
    for(const text of ["찬바람에 얼었다 녹으며 말라요","식초의 신맛이 기름진 느낌을 덜어 줘요","기름이 올라 고소한 맛이 진해져요"])expect(VAGUE_REASON.test(text),text).toBe(false);
  });

  // 맥락 잇기: 처음엔 질문, 마지막엔 그 질문의 핵심 말을 다시 짚는 분명한 결론.
  it("asks for one question carried to a clear conclusion in cards and caption", () => {
    for(const track of ["text","photo",undefined] as const)expect(buildCarouselPlanPrompt({topic:"과메기는 왜 찬바람이 불면 찾을까?",slideCount:5,...(track?{track}:{})})).toContain("[맥락 잇기]");
    const caption=buildCopyPrompt({topic:"과메기는 왜 찬바람이 불면 찾을까?",audience:"A",slideOutline:["과메기는 왜 찬바람이 불면 찾을까?","찬바람에 얼었다 녹으며 말라요","찬바람에 꾸덕하게 말라야 과메기가 제맛이에요"]} as Parameters<typeof buildCopyPrompt>[0],"medium");
    expect(caption).toContain("[맥락 잇기]");
    expect(caption).toContain("\"찬바람에 꾸덕하게 말라야 과메기가 제맛이에요\"");
  });

  it("flags a last card that does not answer the cover question", () => {
    const base=createFallbackCarouselPlan({topic:"과메기는 왜 찬바람이 불면 찾을까?",slideCount:5,track:"text"});
    const last=base.slides.length-1;
    const withEnd=(headline:string):CarouselPlan=>({...base,slides:base.slides.map((slide,i)=>i===0?{...slide,headline:"과메기는 왜 찬바람이 불면 찾을까?"}:i===last?{...slide,headline}:slide)});
    const endIssues=(plan:CarouselPlan)=>slideCopyIssues(plan,"text").filter(issue=>issue.slide===last+1).map(issue=>issue.message).join("\n");
    expect(endIssues(withEnd("추운 날엔 따뜻하게 드세요"))).toContain("표지 질문의 '과메기'");
    expect(endIssues(withEnd("찬바람에 말라야 과메기가 제맛이에요"))).not.toContain("표지 질문의");
  });
});
