// @vitest-environment node
import { describe, expect, it } from "vitest";
import { seasonContext, seasonPromptText } from "@/features/topics/season";
import { fallbackTopics, followsCuriosityBrief, suggestTopics } from "@/features/topics/service";
import { buildTopicPrompt } from "@/features/topics/prompt";

// KST 자정 직후가 UTC로는 전날이므로, 한국 날짜 기준으로 계산되는지도 함께 본다.
const kst=(date:string)=>new Date(`${date}T00:30:00+09:00`);
const names=(date:string)=>seasonContext(kst(date)).events.map(event=>event.name);

describe("season context", () => {
  it("knows the season and upcoming holidays from the Korean date", () => {
    const context=seasonContext(kst("2026-09-20"));
    expect(context.today).toBe("2026-09-20");
    expect(context.season).toBe("가을");
    expect(context.events[0]).toMatchObject({name:"추석",daysAway:0});
  });

  it("finds boknal from gyeong days, matching published dates", () => {
    // 2024 초복 7/15, 2025 초복 7/20, 2023 말복 8/10
    expect(names("2024-07-12")).toContain("초복");
    expect(names("2025-07-17")).toContain("초복");
    expect(names("2023-08-08")).toContain("말복");
    expect(names("2024-07-17")).not.toContain("초복");
  });

  it("marks kimjang, year-end and the last Thursday of October", () => {
    expect(names("2026-11-20")).toContain("김장철");
    expect(names("2026-12-15")).toContain("연말 모임");
    expect(names("2026-10-25")).toContain("막걸리의 날"); // 2026-10-29 목요일
    expect(seasonPromptText(seasonContext(kst("2026-11-20")))).toContain("김장");
  });

  it("puts the season into the topic prompt", () => {
    const prompt=buildTopicPrompt({storeName:"묵동홍어마을"},seasonContext(kst("2026-11-20")));
    expect(prompt).toContain("2026-11-20");
    expect(prompt).toContain("김장철");
    expect(prompt).toContain("season");
  });
});

describe("seasonal topics", () => {
  it("swaps a prepared seasonal topic into the first slot and keeps the curiosity rules", () => {
    const topics=fallbackTopics(0,[],seasonContext(kst("2026-11-20")));
    expect(topics[0]).toMatchObject({season:"김장철",id:"fallback-season-kimjang"});
    expect(followsCuriosityBrief(topics,"묵동홍어마을")).toBe(true);
    expect(fallbackTopics(0,[topics[0].title],seasonContext(kst("2026-11-20")))[0].id).not.toBe("fallback-season-kimjang");
  });

  it("keeps only season labels that match this period", async () => {
    const make=(season:string,index:number)=>({id:`ai-${index}`,title:["김장날엔 왜 수육을 삶을까?","같은 회인데 왜 식감은 다를까?","홍어는 왜 수육이랑 먹을까?"][index],summary:"익숙한 장면에서 시작해 홍어를 구체적인 사례로 연결하는 설명 방향입니다.",reason:"이유",audience:"A" as const,imageBrief:"사진",season});
    const result=await suggestTopics({storeName:"묵동홍어마을"},{suggest:async()=>[make("김장철",0),make("크리스마스",1),make("",2)]},undefined,seasonContext(kst("2026-11-20")));
    // 같은 메뉴(홍어회)라 2·3번째는 준비된 주제로 바뀌고, 그 주제에는 제철 메뉴면 이번 계절("가을")이 붙는다.
    expect(result[0].season).toBe("김장철");
    expect(result.every(topic=>["김장철","가을",""].includes(topic.season))).toBe(true);
  });
});
