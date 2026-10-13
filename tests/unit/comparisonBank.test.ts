// @vitest-environment node
// 비교 주제 목록(store/principles.ts COMPARISON_PAIRS)과 올릴 글 다듬기(copy/captionPolish.ts).
// 점검 7~9회: 비교 주제는 매번 "흐리다"(대부분 배다리 vs 지평), 올릴 글은 9번 모두 기준(500자)보다 짧았다.
import { describe, expect, it, vi } from "vitest";
import { COMPARISON_PAIRS, comparisonPairOf, comparisonPairRule, comparisonTopicRule } from "@/features/store/principles";
import { checkTextClaims } from "@/features/guard/service";
import { assembleTopics } from "@/features/topics/service";
import type { TopicSuggestion } from "@/features/topics/schema";
import { buildCarouselPlanPrompt } from "@/features/images/carousel";
import { buildCopyPrompt } from "@/features/copy/writing";
import { buildTopicPrompt } from "@/features/topics/prompt";
import { expandInformation, fitHook, polishCaption } from "@/features/copy/captionPolish";
import type { GeneratedCopy } from "@/features/copy/schema";

const topic=(title:string,id:string):TopicSuggestion=>({id,title,summary:"두 대상이 무엇 때문에 다른지 원리와 함께 기준마다 견주어 설명합니다.",reason:"궁금해요",audience:"A",imageBrief:"두 음식을 나란히",season:"",trend:""});

describe("comparison pairs",()=>{
  it("recognizes the owner's examples and says how each side differs",()=>{
    expect(comparisonPairOf("홍어와 가오리는 왜 다르게 먹을까?")?.id).toBe("skate-vs-ray");
    expect(comparisonPairOf("삭힌 홍어와 생홍어는 무엇이 다를까?")?.id).toBe("fermented-vs-fresh");
    expect(comparisonPairOf("홍어회는 톡 쏘는데 홍어무침은 왜 덜 쏠까?")?.id).toBe("hoe-vs-muchim");
    expect(comparisonPairOf("배다리와 지평은 왜 맛이 다를까?")).toBeUndefined();
    const rule=comparisonPairRule("삭힌 홍어와 생홍어는 무엇이 다를까?");
    expect(rule).toContain("삭힌 홍어는 ~, 생홍어는 ~");
    expect(rule).toContain("향:");
  });

  it("only states facts the fact check allows, and every pair has at least two criteria",()=>{
    for(const pair of COMPARISON_PAIRS){
      expect(pair.differences.length,pair.id).toBeGreaterThanOrEqual(2);
      for(const item of pair.differences){
        const result=checkTextClaims(item.text);
        expect(result.blocked,`${pair.id}:${item.criterion}`).toEqual([]);
        expect(result.verify,`${pair.id}:${item.criterion}`).toEqual([]);
      }
    }
  });

  it("puts the pair list into topic suggestions and the differences into plan and caption prompts",()=>{
    expect(comparisonTopicRule()).toContain("홍어 vs 가오리");
    expect(buildTopicPrompt({storeName:"묵동홍어마을"} as never)).toContain("[비교 주제]");
    const title="홍어와 가오리는 왜 다르게 먹을까?";
    expect(buildCarouselPlanPrompt({topic:title,slideCount:5,track:"photo"})).toContain("[비교 근거: 홍어 vs 가오리]");
    expect(buildCopyPrompt({topic:title,audience:"A"} as never,"medium")).toContain("[비교 근거: 홍어 vs 가오리]");
  });

  it("drops brand-vs-brand AI topics unless the store memo has both brands",()=>{
    const ai=[topic("배다리와 지평은 왜 맛이 다를까?","a"),topic("홍어와 가오리는 왜 다르게 먹을까?","b"),topic("과메기는 왜 냉동실이 아니라 찬바람에 말릴까?","c")];
    const base={storeName:"묵동홍어마을",round:0,excludeTitles:[],avoidTitles:[]};
    const without=assembleTopics(ai,base);
    expect(without.topics.map(item=>item.title)).not.toContain("배다리와 지평은 왜 맛이 다를까?");
    expect(without.rejected.pair).toBe(1);
    const withNotes=assembleTopics(ai,{...base,hints:{storeNotes:"배다리 막걸리는 쌀과 밀을 섞어 빚어요.\n지평 막걸리는 쌀로 빚어요."}});
    expect(withNotes.topics.map(item=>item.title)).toContain("배다리와 지평은 왜 맛이 다를까?");
  });
});

const caption=(over:Partial<GeneratedCopy>={}):GeneratedCopy=>({
  topic:"홍어는 왜 삭을까?",audience:"A",
  hook:"생선은 상하는데 홍어는 왜 삭을까요?",
  information:"홍어 살에는 요소가 많아요. 삭히는 동안 미생물의 효소가 요소를 암모니아로 분해해 톡 쏘는 향이 생겨요.\n\n그래서 홍어는 상하지 않고 삭는 음식이 됐다고 해요.",
  store_connection:"홍어가 궁금해졌다면 묵동에서 홍어를 알아볼 때 묵동홍어마을의 메뉴도 살펴보세요.",
  call_to_action:"프로필의 네이버 플레이스에서 메뉴를 확인해 보세요.",
  hashtags:["#홍어"],facts_used:[],facts_to_verify:[],image_disclosure:null,hook_options:[],...over,
});
const secondParagraph="홍어는 뼈가 단단한 뼈가 아니라 연골이에요. 그래서 회로 썰면 살 사이의 흰 연골까지 함께 씹히고, 쫀득한 살과 오독한 연골이 한입에서 대비돼요. 삭히는 동안 단백질이 조금씩 분해되어 살은 더 찰지게 느껴진다고 해요. 향이 먼저 오고 식감이 뒤따라오니, 처음 먹는 사람에게는 이 순서가 낯설게 느껴질 수 있어요.";
const longParagraph="암모니아는 알칼리성이라 살이 알칼리성으로 바뀌면 다른 부패균이 자라기 어려워진다고 알려져 있어요. 보통 생선은 시간이 지나면 부패균이 늘어 상하지만, 홍어는 이 암모니아 덕분에 오래 두어도 상하지 않고 삭아요. 그래서 옛날 뱃길로 오래 실어 와도 먹을 수 있었고, 그 향이 오히려 홍어의 맛이 되었어요. 코로 먼저 오는 톡 쏘는 향은 기체가 된 암모니아가 날아오르기 때문이에요.";

describe("caption polish",()=>{
  it("swaps an over-long first sentence for a short hook option",()=>{
    const long=caption({hook:"생선은 시간이 지나면 상하는데 홍어는 오히려 오래 둘수록 삭아서 더 맛있어진다는 이야기, 혹시 들어 보셨어요? 오늘은 그 이유를 알아봐요.",hook_options:["생선은 상하는데 홍어는 왜 삭을까요?"]});
    expect(fitHook(long)).toMatchObject({swapped:true,copy:{hook:"생선은 상하는데 홍어는 왜 삭을까요?"}});
    expect(fitHook(caption()).swapped).toBe(false);
  });

  it("adds a reason paragraph when the caption is short, and keeps the original when the AI misses",async()=>{
    const short=caption();
    const [first,last]=short.information.split("\n\n");
    const good={generate:vi.fn(async()=>({information:`${first}\n\n${longParagraph}\n\n${secondParagraph}\n\n${last}`}))};
    const result=await expandInformation(short,"medium",good);
    expect(result.expanded).toBe(true);
    expect(result.copy.information).toContain("알칼리성");
    expect(String((good.generate.mock.calls[0] as unknown[])[0])).toContain("원인이 되는 것의 이름");
    const tooShort={generate:vi.fn(async()=>({information:"짧아요."}))};
    expect((await expandInformation(short,"medium",tooShort)).expanded).toBe(false);
    const failing={generate:vi.fn(async()=>{throw new Error("429");})};
    expect(await polishCaption(short,"medium",failing)).toMatchObject({expanded:false,copy:short});
  });
});
