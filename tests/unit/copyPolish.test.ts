// @vitest-environment node
// 결과물 점검(2026-10-12, Gemini 글·게시물 6개): 후킹 2.3/5, 뻔한 질문 4/6, 검수 뒤에도 제목 길이 초과 24건, 이유 깊이 3.0.
// 검수 뒤 마지막 다듬기 두 가지(표지 후킹 다시 쓰기, 긴 제목 줄이기)와 "결과만 말하는 이유" 검사를 본다.
import { describe, expect, it, vi } from "vitest";
import { createFallbackCarouselPlan, type CarouselPlan } from "@/features/images/carousel";
import { overLongHeadlines, polishPlan, rewriteCover, shortenHeadlines } from "@/features/images/copyPolish";
import { coverHookProblems, slideCopyIssues } from "@/features/images/planReview";

function deck(copy:Array<{headline:string;subline?:string;points:string[]}>,topic="홍어회는 왜 붉은 살코기 생선과 식감이 다를까?"):CarouselPlan {
  const base=createFallbackCarouselPlan({topic,slideCount:5,track:"photo"});
  return {...base,slideCount:5,slides:base.slides.slice(0,5).map((slide,i)=>({...slide,subline:"",...copy[i]}))};
}
const reported=()=>deck([
  {headline:"홍어회는 왜 붉은 살코기 생선과 식감이 다를까?",subline:"단단한 콜라겐과 숙성의 비밀이 있어요",points:[]},
  {headline:"단단하게 얽힌 콜라겐 조직 때문이에요",points:["치밀한 콜라겐 섬유가 쫀득한 씹는 맛을 내요"]},
  {headline:"지방이 적고 수분 마른 살코기 구조예요",points:["기름기 적은 살결이 단단하게 버텨요"]},
  {headline:"숙성을 거치며 단백질 구조가 변해요",points:["발효 과정이 독특한 탄력과 찰기를 더해줘요"]},
  {headline:"홍어회는 촘촘한 콜라겐과 숙성이 찰진 식감을 만들어요",points:["홍어회를 묵동홍어마을에서 즐겨 보세요"]},
]);

describe("over-long headlines",()=>{
  it("lists the headlines over the card limit with their current and target length",()=>{
    const long=overLongHeadlines(reported(),"photo");
    expect(long.map(item=>item.slide)).toEqual([1,2,3,4,5]);
    expect(long[0]).toMatchObject({max:24,length:"홍어회는 왜 붉은 살코기 생선과 식감이 다를까?".length});
    expect(long[1]).toMatchObject({max:18});
  });

  it("takes only shortened headlines that now fit, and keeps the rest",async()=>{
    const ai={generate:vi.fn(async()=>({items:[
      {slide:2,headline:"콜라겐 섬유가 촘촘히 얽혀요"},
      {slide:3,headline:"지방이 적고 수분이 적은 살코기 구조라서 단단해요"}, // 여전히 길다 → 버린다
      {slide:5,headline:"촘촘한 콜라겐이 찰기를 만들어요"},
    ]}))};
    const {plan,shortened}=await shortenHeadlines(reported(),"photo",ai);
    expect(shortened).toBe(2);
    expect(plan.slides[1].headline).toBe("콜라겐 섬유가 촘촘히 얽혀요");
    expect(plan.slides[2].headline).toBe("지방이 적고 수분 마른 살코기 구조예요");
    expect(plan.slides[4].headline).toBe("촘촘한 콜라겐이 찰기를 만들어요");
    const prompt=String((ai.generate.mock.calls[0] as unknown[])[0]);
    expect(prompt).toMatch(/지금 \d+자 → 18자 이내/);
  });
});

describe("cover hook rewrite",()=>{
  it("picks the AI's best valid option and skips ones that hype, are vague, too long or drop the menu",async()=>{
    const ai={generate:vi.fn(async()=>({best:0,options:[
      {type:"의외의 정체",headline:"충격! 홍어회 식감의 비밀",subline:"왜 쫀득할까요?"},            // 과장 → 버린다
      {type:"오해 깨기",headline:"참치처럼 부드러울 줄 알았나요?",subline:"왜 쫀득할까요?"},       // 메뉴(홍어) 빠짐 → 버린다
      {type:"공감 장면",headline:"홍어회는 왜 이렇게 쫀득할까?",subline:"깊은 식감의"},             // 끝맺지 않은 부제 → 버린다
      {type:"오해 깨기",headline:"홍어회 쫀득함은 숙성 때문이 아니라고?",subline:""},
    ]}))};
    const {plan,changed,hookType}=await rewriteCover(reported(),"photo",ai);
    expect(changed).toBe(true);
    expect(hookType).toBe("오해 깨기");
    expect(plan.slides[0]).toMatchObject({headline:"홍어회 쫀득함은 숙성 때문이 아니라고?",subline:""});
    expect(String((ai.generate.mock.calls[0] as unknown[])[0])).toContain("오해 깨기");
  });

  it("asks once to shorten options that only failed on length, then picks from them",async()=>{
    // 세 번째 점검(2026-10-12): 좋은 대조형 후보가 25~34자라 모두 버려지고 밋밋한 표지가 남았다.
    const ai={generate:vi.fn()
      .mockResolvedValueOnce({best:0,options:[
        {type:"대조",headline:"홍어회는 왜 붉은 살코기 생선보다 훨씬 쫀득할까?",subline:""},
        {type:"오해 깨기",headline:"이거 알면 홍어 고수예요",subline:"왜 그럴까요?"},
      ]})
      .mockResolvedValueOnce({items:[{slide:1,headline:"홍어회는 왜 참치보다 쫀득할까?"}]})};
    const {plan,changed,hookType}=await rewriteCover(reported(),"photo",ai);
    expect(changed).toBe(true);
    expect(hookType).toBe("대조");
    expect(plan.slides[0].headline).toBe("홍어회는 왜 참치보다 쫀득할까?");
    expect(String((ai.generate.mock.calls[1] as unknown[])[0])).toMatch(/지금 \d+자 → 24자 이내/);
  });

  it("keeps the original cover when no option passes",async()=>{
    const ai={generate:vi.fn(async()=>({best:0,options:[{type:"대조",headline:"이거 알면 홍어 고수예요",subline:"왜 그럴까요?"}]}))};
    const before=reported();
    const {plan,changed}=await rewriteCover(before,"photo",ai);
    expect(changed).toBe(false);
    expect(plan.slides[0]).toEqual(before.slides[0]);
  });

  it("keeps both names of a comparison cover",async()=>{
    const base=deck([{headline:"해물라면과 홍어라면, 무엇이 다를까?",subline:"",points:[]},{headline:"a",points:["b"]},{headline:"c",points:["d"]},{headline:"e",points:["f"]},{headline:"g",points:["h"]}],"해물라면과 홍어라면은 무엇이 다를까?");
    const ai={generate:vi.fn(async()=>({best:0,options:[
      {type:"대조",headline:"홍어라면은 왜 더 얼큰할까?",subline:""},          // 해물라면 빠짐 → 버린다
      {type:"대조",headline:"해물라면은 맑고 홍어라면은 톡 쏴요",subline:"왜 다를까요?"},
    ]}))};
    expect((await rewriteCover(base,"photo",ai)).plan.slides[0].headline).toBe("해물라면은 맑고 홍어라면은 톡 쏴요");
  });

  it("checks cover hooks with the same rules as the card review",()=>{
    expect(coverHookProblems({headline:"홍어찜은 어떤 맛일까?",subline:""},"photo").join(" ")).toMatch(/막연/);
    expect(coverHookProblems({headline:"홍어는 썩은 게 아니라 삭은 거예요",subline:"왜 안 상할까요?"},"photo")).toEqual([]);
  });
});

describe("polishing a plan",()=>{
  it("rewrites the cover, then shortens what is still too long, and survives AI failures",async()=>{
    const ai={generate:vi.fn()
      .mockResolvedValueOnce({best:0,options:[{type:"오해 깨기",headline:"홍어회 쫀득함은 숙성 때문이 아니라고?",subline:""}]})
      .mockRejectedValueOnce(new Error("429"))};
    const result=await polishPlan(reported(),"photo",ai);
    expect(result.plan.slides[0].headline).toBe("홍어회 쫀득함은 숙성 때문이 아니라고?");
    expect(result).toMatchObject({coverChanged:true,shortened:0});
  });
});

describe("reasons that only state a result",()=>{
  it("flags a reason slide with no cause, and passes one that says what changes what",()=>{
    const messages=(plan:CarouselPlan)=>slideCopyIssues(plan,"photo").map(issue=>`${issue.slide}:${issue.message}`).join("\n");
    const vague=deck([
      {headline:"해물라면과 홍어라면, 무엇이 다를까?",subline:"",points:[]},
      {headline:"해물라면은 시원하고, 홍어라면은 깊어요",points:["해물은 시원함을, 홍어는 진한 풍미를 더해요"]},
      {headline:"홍어 향은 요소가 바뀐 거예요",points:["삭히는 동안 요소가 암모니아로 바뀌어요"]},
      {headline:"콜라겐이 얽혀 있어서 쫀득해요",points:["열을 받으면 콜라겐이 풀려요"]},
      {headline:"해물라면은 맑고 홍어라면은 톡 쏴요",points:["둘 다 라면을 묵동홍어마을에서 즐겨 보세요"]},
    ],"해물라면과 홍어라면은 무엇이 다를까?");
    const found=messages(vague);
    expect(found).toContain("2:이 장은 결과(맛·느낌)만");
    expect(found).not.toContain("3:이 장은 결과(맛·느낌)만");
    expect(found).not.toContain("4:이 장은 결과(맛·느낌)만");
  });
});

describe("covers that give the answer away (seventh eval run)",()=>{
  it("rejects a cover naming the cause the body reveals, and a 'secret' tease",()=>{
    const body=["해물은 감칠맛 성분이 우러나요","홍어는 암모니아 향이 퍼져요"];
    expect(coverHookProblems({headline:"해물라면 감칠맛, 홍어라면 암모니아 때문이죠",subline:""},"photo",body).join(" ")).toContain("답('");
    expect(coverHookProblems({headline:"과메기는 그냥 얼기만 할까요?",subline:"겨울 별미의 비밀을 알아봐요"},"photo",[]).join(" ")).toContain("'비밀'");
    expect(coverHookProblems({headline:"홍어회는 썩은 게 아니라 삭히는 거라고?",subline:""},"photo",["요소가 암모니아로 바뀌어요"])).toEqual([]);
  });
  it("gives the cover rewrite common myths to overturn",async()=>{
    const ai={generate:vi.fn(async()=>({best:0,options:[{type:"오해 깨기",headline:"홍어회는 썩은 게 아니라 삭히는 거라고?",subline:""}]}))};
    await rewriteCover(reported(),"photo",ai,"홍어는 왜 상하지 않고 삭을까?");
    const prompt=String((ai.generate.mock.calls[0] as unknown[])[0]);
    expect(prompt).toContain("[오해 깨기 재료]");
    expect(prompt).toContain("홍어는 썩혀 먹는 생선이다");
  });
});

describe("ninth eval run covers",()=>{
  it("flags yes/no cover questions and '속사정' teases, but not myth flips or why-questions",()=>{
    const problems=(headline:string)=>coverHookProblems({headline,subline:""},"photo").join(" ");
    expect(problems("배다리와 지평은 맛이 같을까요?")).toContain("예/아니오");
    expect(problems("과메기가 반쯤 말려야만 하는 진짜 속사정")).toContain("속사정");
    expect(problems("신 묵은지는 상한 김치가 아니라고?")).not.toContain("예/아니오");
    expect(problems("홍어회는 톡 쏘는데 홍어무침은 왜 덜 쏠까?")).toBe("");
  });
});
