// @vitest-environment node
// "다른 주제 보기"가 준비된 주제만 돌려주던 문제(사장님 지적 2026-10-20). 원인: 원리 노트로 만든 준비 주제를 AI도 같은 노트에서
// 다시 내서(글자까지 같은 제목도 있었음) "최근에 보여 준 주제"로 거절되고, 거절 이유도 "메뉴가 겹쳐서"로 잘못 세어졌다.
// 고침: 한 번 호출에 예비 주제 3개를 같이 받아 거절된 자리를 예비로 채우고, 이유는 '최근 주제'를 먼저 센다.
import { describe, expect, it } from "vitest";
import { assembleTopics } from "@/features/topics/service";
import { buildTopicPrompt, readTopicGeneration, topicGenerationSchema } from "@/features/topics/prompt";
import { principleTopicHints } from "@/features/store/principles";
import { TopicInputSchema } from "@/features/topics/schema";

const summary="익숙한 장면에서 출발해 식감 차이를 설명하고 홍어를 관련 사례로 자연스럽게 연결합니다.";
const make=(title:string,extra="")=>({id:title,title,summary:summary+extra,reason:"이유",audience:"A" as const,imageBrief:"사진",season:"",trend:""});
const gwamegi=(title:string)=>({...make(title),summary:"찬바람 부는 겨울에 찾는 과메기를 소개하고 제철 이유는 출처를 확인한 뒤 씁니다."});
const jeon=(title:string)=>({...make(title),summary:"비 오는 날 미나리전과 배다리 막걸리를 곁들이는 장면에서 시작해 어울리는 이유를 단정하지 않고 소개합니다."});
const base={storeName:"묵동홍어마을",round:0,excludeTitles:[],avoidTitles:[]};

describe("spare topics fill rejected slots",()=>{
  // 사장님 결정(2026-10-21): '했던 주제'는 거르지 않으므로 앞의 셋이 그대로 쓰이고, 예비는 규칙에 걸린 자리에만 들어간다.
  it("keeps the first three even when they match the avoid list, and uses a spare only for a rule-breaking slot",()=>{
    const recent=["홍어회는 왜 처음 먹을 때 코가 먼저 찡할까?","과메기는 왜 냉동실이 아니라 찬바람에 말려야 할까?"];
    const {topics,filled,rejected}=assembleTopics([
      make(recent[0]),gwamegi(recent[1]),jeon("미나리전은 왜 비 오는 날 생각날까?"),
      make("홍어회 흰 줄은 왜 씹어 먹을까?"),gwamegi("과메기는 왜 김에 싸 먹을까?"),jeon("미나리전엔 왜 초간장이 어울릴까?"),
    ],{...base,avoidTitles:recent});
    expect(topics.map(topic=>topic.title)).toEqual([recent[0],recent[1],"미나리전은 왜 비 오는 날 생각날까?"]);
    expect(filled).toBe(0);
    expect(rejected).toEqual({});
    const broken=assembleTopics([
      make("홍어회 즐기기"),gwamegi(recent[1]),jeon("미나리전은 왜 비 오는 날 생각날까?"),
      make("홍어회 흰 줄은 왜 씹어 먹을까?"),
    ],base);
    expect(broken.topics.map(topic=>topic.title)).toEqual([recent[1],"미나리전은 왜 비 오는 날 생각날까?","홍어회 흰 줄은 왜 씹어 먹을까?"]);
    expect(broken.rejected).toEqual({question:1});
  });
});

describe("the AI returns spares in the same call",()=>{
  it("accepts {topics, spares} and reads them in order, spares after the main three",()=>{
    const topic=(id:string)=>({id,title:`${id}는 왜 그럴까?`,summary:"설명",reason:"이유",audience:"A",imageBrief:"사진",season:"",trend:""});
    const parsed=topicGenerationSchema().parse({topics:[topic("a"),topic("b"),topic("c")],spares:[topic("d"),topic("e")]});
    expect(readTopicGeneration(parsed).map(item=>item.id)).toEqual(["a","b","c","d","e"]);
    // 예비가 없어도(예전 응답 모양) 읽는다.
    expect(readTopicGeneration(topicGenerationSchema().parse({topics:[topic("a"),topic("b"),topic("c")]})).length).toBe(3);
  });
  it("asks for three spares that differ from the main three, and tells the AI not to repeat prepared questions from the same principle",()=>{
    const prompt=buildTopicPrompt(TopicInputSchema.parse({storeName:"묵동홍어마을",avoidTitles:["홍어회는 왜 처음 먹을 때 코가 먼저 찡할까?"]}));
    expect(prompt).toContain("spares");
    expect(prompt).toMatch(/예비 주제 3개/);
    expect(principleTopicHints()).toMatch(/recentTitles/);
  });
});

// 표지 "오해 깨기" 재료는 주제·본문이 그 오해를 다룰 때만 꺼낸다(사장님 제보 2026-10-20: 과메기·김 주제에 냉동실 표지).
describe("cover myth material follows the topic, not just the menu",()=>{
  it("keeps the freezer myth out of a gim-wrapping topic but offers it for a cold-wind drying topic",async()=>{
    const { coverMythRule }=await import("@/features/store/principles");
    const gim=coverMythRule("과메기는 왜 김과 미역에 싸서 먹을까?","과메기 한 쌈","해조류의 향이 기름진 맛을 감싸요","김의 짠맛이 균형을 잡아요");
    expect(gim).not.toContain("냉동실");
    const wind=coverMythRule("과메기는 왜 냉동실이 아니라 찬바람에 말려야 할까?","과메기는 왜 찬바람에 말릴까?","얼었다 녹기를 되풀이해요");
    expect(wind).toContain("얼었다 녹기");
  });
});

describe("principle hints skip questions the owner already used",()=>{
  it("drops the freezer hint once a cold-wind drying title was shown, keeps other gwamegi hints, and ends the prompt with the no-repeat rule",async()=>{
    const { usedPrincipleNotes }=await import("@/features/store/principles");
    const used=usedPrincipleNotes(["과메기는 왜 냉동실이 아니라 찬바람에 말려야 할까?"]);
    expect(used.has("gwamegi-freeze")).toBe(true);
    expect(used.has("gwamegi-wrap")).toBe(false);
    expect(principleTopicHints(["과메기는 왜 냉동실이 아니라 찬바람에 말려야 할까?"])).not.toContain("얼었다 녹기");
    expect(principleTopicHints()).toContain("얼었다 녹기");
    const prompt=buildTopicPrompt(TopicInputSchema.parse({storeName:"묵동홍어마을",avoidTitles:["과메기는 왜 냉동실이 아니라 찬바람에 말려야 할까?"]}));
    expect(prompt.trim()).toMatch(/내지 마세요. 같은 원리라도 다른 장면·다른 궁금증이어야 합니다.$/);
    expect(prompt.indexOf("[원리 노트 실마리]")).toBeLessThan(prompt.indexOf("\"recentTitles\":"));
  });
});
