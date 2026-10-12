// @vitest-environment node
// 이유 깊이(결과물 점검 2026-10-12, 4회 내내 2.8~3.0/5)와 가게 이야기 메모.
// - 이유가 원인의 이름(성분·구조·온도·조리 과정·감각·풍습) 없이 "~해서 맛있어요"로 끝나면 카드 검수·올릴 글 검사가 잡는다.
// - 사장님이 설정에 적은 가게 사실은 AI가 근거로 쓰고, 사실 검사도 메모에 있는 말은 통과시킨다.
import { describe, expect, it } from "vitest";
import { buildCarouselPlanPrompt, createFallbackCarouselPlan, type CarouselPlan } from "@/features/images/carousel";
import { slideCopyIssues } from "@/features/images/planReview";
import { guardSlidePoints } from "@/features/images/slidePoints";
import { buildCopyPrompt, shallowReasonIssues } from "@/features/copy/writing";
import { NAMES_CAUSE, comparedKeys, comparedPair } from "@/features/copy/explain";
import { checkTextClaims } from "@/features/guard/service";
import { cleanStoreNotes, storeNotesRule, storeNotesTopicRule } from "@/features/store/storeNotes";
import { buildTopicPrompt } from "@/features/topics/prompt";
import { AppSettingsSchema } from "@/features/settings/schema";
import { DEFAULT_SETTINGS } from "@/features/settings/defaults";

const NOTES="홍어는 들어오는 날 직접 손질해요.\n홍어는 흑산도산을 써요.\n묵은지는 3개월 숙성해요.";

function deck(copy:Array<{headline:string;points:string[]}>,topic="홍어찜은 왜 쪄도 살이 쫀득할까?"):CarouselPlan {
  const base=createFallbackCarouselPlan({topic,slideCount:5,track:"photo"});
  return {...base,slideCount:5,slides:base.slides.slice(0,5).map((slide,i)=>({...slide,subline:"",...copy[i]}))};
}

describe("reasons must name a cause",()=>{
  it("treats a linking word alone ('~해서') as no reason, and a named cause as a reason",()=>{
    expect(NAMES_CAUSE.test("따뜻하게 먹어서 더 맛있어요")).toBe(false);
    expect(NAMES_CAUSE.test("열에 콜라겐이 젤라틴으로 풀려요")).toBe(true);
    expect(NAMES_CAUSE.test("비 오는 날 들일을 쉬던 풍습이 있어요")).toBe(true);
    expect(NAMES_CAUSE.test("결론은 이거예요")).toBe(false);
  });

  it("flags a reason card that only links a result with '~해서'",()=>{
    const found=slideCopyIssues(deck([
      {headline:"홍어찜은 왜 쪄도 살이 쫀득할까?",points:[]},
      {headline:"따뜻하게 먹어서 더 맛있어요",points:["그래서 자꾸 손이 가요"]},
      {headline:"열에 콜라겐이 풀려요",points:["식으면 젤라틴이 다시 굳어요"]},
      {headline:"연골 뼈가 씹는 맛을 더해요",points:["오독한 식감이 살결과 대비돼요"]},
      {headline:"홍어찜은 콜라겐 덕에 쫀득해요",points:[]},
    ]),"photo").map(issue=>`${issue.slide}:${issue.message}`).join("\n");
    expect(found).toContain("2:이 장은 결과(맛·느낌)만");
    expect(found).not.toContain("3:이 장은 결과(맛·느낌)만");
    expect(found).not.toContain("4:이 장은 결과(맛·느낌)만");
  });

  it("flags caption reason paragraphs with no named cause, but not the closing paragraph",()=>{
    const shallow="따뜻하게 먹으면 더 맛있게 느껴져요. 그래서 자꾸 생각나요.\n\n열에 콜라겐이 젤라틴으로 풀리며 살이 촉촉해져요.\n\n결국 홍어찜은 따뜻할 때 가장 좋아요.";
    expect(shallowReasonIssues(shallow)).toEqual([expect.stringContaining("정보 1번째 문단")]);
    expect(shallowReasonIssues("열에 콜라겐이 풀려요.\n\n그래서 쫀득해요.")).toEqual([]);
  });

  it("asks notes and caption for a cause → change → sensation chain",()=>{
    const caption=buildCopyPrompt({topic:"홍어는 왜 상하지 않고 삭을까?",audience:"A"} as never,"medium");
    expect(caption).toContain("① 원인이 되는 것의 이름");
    const plan=buildCarouselPlanPrompt({topic:"홍어는 왜 상하지 않고 삭을까?",slideCount:5,track:"photo"});
    expect(plan).toContain("원리 사슬");
  });
});

describe("store notes (가게 이야기 메모)",()=>{
  it("reads old settings without the field as an empty memo",()=>{
    const {storeNotes:_ignored,...old}=DEFAULT_SETTINGS;
    expect(AppSettingsSchema.parse(old).storeNotes).toBe("");
  });

  it("adds nothing to prompts when the memo is empty",()=>{
    expect(storeNotesRule("  \n ")).toBe("");
    expect(storeNotesTopicRule("")).toBe("");
    expect(buildCarouselPlanPrompt({topic:"홍어는 왜 삭힐까?",slideCount:5,track:"photo"})).not.toContain("[가게 이야기 메모]");
    expect(cleanStoreNotes(" a \r\n\r\n b ")).toBe("a\nb");
  });

  it("puts the memo into the topic, plan and caption prompts as citable store facts",()=>{
    const topic=buildTopicPrompt({storeName:"묵동홍어마을"} as never,undefined,[],[],[],NOTES);
    const plan=buildCarouselPlanPrompt({topic:"홍어는 왜 삭힐까?",slideCount:5,track:"photo"},{storeNotes:NOTES});
    const caption=buildCopyPrompt({topic:"홍어는 왜 삭힐까?",audience:"A"} as never,"medium",{storeNotes:NOTES});
    for(const prompt of [topic,plan,caption]){
      expect(prompt).toContain("[가게 이야기 메모]");
      expect(prompt).toContain("직접 손질해요");
    }
    expect(plan).toContain("메모에 없는 가게 사실은 여전히 만들지 말고");
  });

  it("lets the fact check pass facts written in the memo, and only those",()=>{
    expect(checkTextClaims("이 가게 홍어는 흑산도산이에요").blocked.length).toBeGreaterThan(0);
    expect(checkTextClaims("이 가게 홍어는 흑산도산이에요",{storeNotes:NOTES})).toMatchObject({blocked:[],verify:[]});
    expect(checkTextClaims("묵은지는 3개월 숙성해요",{storeNotes:NOTES}).verify).toEqual([]);
    // 메모와 다른 숫자는 여전히 확인 대상
    expect(checkTextClaims("묵은지는 5개월 숙성해요",{storeNotes:NOTES}).verify.length).toBeGreaterThan(0);
    // 향 보장은 메모와 상관없이 막는다
    expect(checkTextClaims("냄새가 전혀 안 나요",{storeNotes:"냄새가 전혀 안 나요"}).blocked.length).toBeGreaterThan(0);
  });

  it("keeps a card point that states a memo fact",()=>{
    const plan=deck([
      {headline:"묵은지는 왜 홍어와 맞을까?",points:[]},
      {headline:"오래 익은 묵은지는 산미가 깊어요",points:["묵은지는 3개월 숙성해요"]},
      {headline:"젖산이 암모니아 향을 눌러요",points:["산이 향을 덜 느끼게 해요"]},
      {headline:"아삭한 결이 쫀득함과 대비돼요",points:["씹는 맛이 갈려요"]},
      {headline:"묵은지 산미가 홍어 향을 받쳐요",points:[]},
    ],"묵은지는 왜 홍어와 맞을까?");
    expect(guardSlidePoints(plan).slides[1].points).toEqual([]);
    expect(guardSlidePoints(plan,{storeNotes:NOTES}).slides[1].points).toEqual(["묵은지는 3개월 숙성해요"]);
  });
});

describe("comparison names followed by a question word",()=>{
  it("reads '배다리와 지평은 어떤 맛의 차이가 날까?' as 배다리 vs 지평",()=>{
    const pair=comparedPair("배다리와 지평은 어떤 맛의 차이가 날까?");
    expect(pair).toEqual({first:"배다리",second:"지평"});
    expect(comparedKeys(pair!)).toEqual(["배다리","지평"]);
    expect(comparedPair("배다리 막걸리와 지평막걸리의 맛의 차이점은 어디서 오는 걸까?")).toEqual({first:"배다리 막걸리",second:"지평막걸리"});
  });
});

describe("fifth eval run findings",()=>{
  it("reads '배다리와 지평은 왜 맛이 다를까요?' as 배다리 vs 지평",()=>{
    expect(comparedPair("배다리와 지평은 왜 맛이 다를까요?")).toEqual({first:"배다리",second:"지평"});
  });
  it("treats a cover that only asks the reader's feelings as vague",async()=>{
    const {VAGUE_COVER}=await import("@/features/copy/explain");
    expect(VAGUE_COVER.test("지평과 배다리 막걸리를 고를 때 고민되시죠?")).toBe(true);
    expect(VAGUE_COVER.test("배다리는 톡 쏘는데 지평은 왜 부드러울까?")).toBe(false);
  });
});
