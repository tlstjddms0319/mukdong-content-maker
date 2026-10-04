// @vitest-environment node
import { describe, expect, it } from "vitest";
import { kstToday, matchPlanDraft, planItemState, plannedAtFromPlanDate, type PlanDraftSummary } from "@/features/drafts/planLink";

const now=Date.parse("2026-10-04T03:00:00Z"); // 한국 시간 10/4 12:00
const draft=(over:Partial<PlanDraftSummary>):PlanDraftSummary=>({id:"d",topic:"막걸리엔 왜 전일까?",hasImages:false,hasCaption:false,reviewed:false,...over});

describe("plan ↔ draft link", () => {
  it("turns a plan date into 18:00 KST and refuses past times or bad input", () => {
    expect(plannedAtFromPlanDate("2026-10-06",now)).toBe("2026-10-06T09:00:00.000Z");
    expect(plannedAtFromPlanDate("2026-10-03",now)).toBeNull();
    expect(plannedAtFromPlanDate("2026-10-6",now)).toBeNull();
    expect(plannedAtFromPlanDate(undefined,now)).toBeNull();
  });

  it("uses the Korean date even when the server clock is UTC", () => {
    expect(kstToday(Date.parse("2026-10-04T16:30:00Z"))).toBe("2026-10-05");
  });

  it("matches the draft started from the same date first, then an unlinked draft with the same title", () => {
    const item={date:"2026-10-06",title:"막걸리엔 왜 전일까?"};
    const linked=draft({id:"linked",plan_date:"2026-10-06",hasImages:true});
    const otherDate=draft({id:"other",plan_date:"2026-10-09",reviewed:true,hasImages:true,hasCaption:true});
    const legacy=draft({id:"legacy",topic:"막걸리엔 왜 전일까",hasCaption:true,hasImages:true});
    expect(matchPlanDraft(item,[otherDate,legacy,linked])?.id).toBe("linked");
    expect(matchPlanDraft(item,[otherDate,legacy])?.id).toBe("legacy");
    expect(matchPlanDraft(item,[otherDate])).toBeUndefined();
  });

  it("reports progress, and marks a past date without a draft as missed", () => {
    expect(planItemState({date:"2026-10-06"},undefined,"2026-10-04")).toBe("planned");
    expect(planItemState({date:"2026-10-02"},undefined,"2026-10-04")).toBe("missed");
    expect(planItemState({date:"2026-10-02"},draft({hasImages:true}),"2026-10-04")).toBe("images");
    expect(planItemState({date:"2026-10-06"},draft({hasImages:true,hasCaption:true}),"2026-10-04")).toBe("caption");
    expect(planItemState({date:"2026-10-06"},draft({hasImages:true,hasCaption:true,reviewed:true}),"2026-10-04")).toBe("reviewed");
  });
});
