// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { assembleTopics, fallbackTopics, isOtherMenuTopic, normalizeTrendLabels, overusedMenus, suggestTopics, titleMenu, topicMenu } from "@/features/topics/service";
import { menusForDate } from "@/features/store/menu";
import { seasonContext } from "@/features/topics/season";
import { buildTopicPrompt } from "@/features/topics/prompt";

const summary="익숙한 장면에서 출발해 식감 차이를 설명하고 홍어를 관련 사례로 자연스럽게 연결합니다.";
const make=(title:string,id=title)=>({id,title,summary,reason:"이유",audience:"A" as const,imageBrief:"사진",season:"",trend:""});
// 홍어회·삼합이 아닌 메뉴(과메기)로 이어지는 주제.
const makeMenu=(title:string,id=title)=>({...make(title,id),summary:"찬바람 부는 겨울에 찾는 과메기를 소개하고 제철 이유는 출처를 확인한 뒤 씁니다."});
// 미나리전으로 이어지는 주제(주인공 메뉴가 홍어회·과메기와 다르다).
const makeJeon=(title:string,id=title)=>({...make(title,id),summary:"비 오는 날 미나리전과 배다리 막걸리를 곁들이는 장면에서 시작해 어울리는 이유를 단정하지 않고 소개합니다."});
const base={storeName:"묵동홍어마을",round:0,excludeTitles:[],avoidTitles:[]};

describe("topic variety", () => {
  // 정해진 구성(일상 질문 2개 + 홍어 질문 1개)은 없다. AI가 고른 순서(첫 번째가 가장 추천)를 그대로 살린다.
  it("keeps valid AI topics in the AI's order", () => {
    const {topics,filled}=assembleTopics([make("홍어는 왜 겨울에 더 찾을까?"),makeMenu("과메기는 왜 겨울에 찾을까?"),makeJeon("국밥엔 왜 깍두기가 어울릴까?")],base);
    expect(filled).toBe(0);
    expect(topics.map(topic=>topic.title)).toEqual(["홍어는 왜 겨울에 더 찾을까?","과메기는 왜 겨울에 찾을까?","국밥엔 왜 깍두기가 어울릴까?"]);
  });

  it("replaces later topics that repeat a hero menu, so hongeo/samhap cannot fill the whole set", () => {
    const {topics,filled}=assembleTopics([make("홍어는 왜 겨울에 더 찾을까?"),make("굴은 왜 겨울에 맛있을까?"),make("국밥엔 왜 깍두기가 어울릴까?")],base);
    expect(filled).toBe(2);
    expect(topics[0].title).toBe("홍어는 왜 겨울에 더 찾을까?");
    expect(topics.slice(1).every(topic=>topic.id.startsWith("fallback-"))).toBe(true);
    expect(new Set(topics.map(topic=>topicMenu(topic)?.id)).size).toBe(3);
    expect(topics.some(isOtherMenuTopic)).toBe(true);
  });

  it("keeps only one samhap topic even when the AI offers two", () => {
    // 검토에서 찾은 사례: 삼합 주제 둘 + 과메기가 그대로 나왔다(삼합은 3개 중 최대 1개).
    const samhap=(title:string)=>({...make(title),summary:"홍어회에 수육과 묵은지를 곁들이는 삼합 조합을 설명하고 향은 남는다고 알립니다."});
    const {topics,filled}=assembleTopics([samhap("홍어는 왜 수육이랑 먹을까?"),samhap("삼합엔 왜 묵은지를 올릴까?"),makeMenu("과메기는 왜 겨울에 찾을까?")],base);
    expect(filled).toBe(1);
    expect(topics.map(topic=>topic.title).slice(0,2)).toEqual(["홍어는 왜 수육이랑 먹을까?","과메기는 왜 겨울에 찾을까?"]);
    expect(topics.filter(topic=>/삼합|수육/.test(topic.title+topic.summary))).toHaveLength(1);
  });

  it("keeps three valid topics even when none names hongeo", () => {
    // 예전에는 홍어 질문 칸을 채우려고 하나를 준비된 홍어 주제로 바꿨다.
    const input=[makeMenu("굴은 왜 겨울에 맛있을까?"),make("국밥엔 왜 깍두기가 어울릴까?"),makeJeon("전은 왜 비 오는 날 생각날까?")];
    const {topics,filled}=assembleTopics(input,base);
    expect(filled).toBe(0);
    expect(topics.map(topic=>topic.title)).toEqual(input.map(topic=>topic.title));
  });

  it("keeps two hongeo-dish questions when they are good", () => {
    const soup={...make("홍어애탕은 어떤 국물일까?"),summary:"회로만 알던 홍어를 뜨끈한 국물로 먹는 홍어애탕을 소개하고 재료는 사장님께 확인한 뒤 씁니다."};
    const input=[soup,make("홍어를 처음 먹는다면 얼마나 올릴까?"),makeMenu("과메기는 왜 겨울에 찾을까?")];
    const {topics,filled}=assembleTopics(input,base);
    expect(filled).toBe(0);
    expect(topics.map(topic=>topic.title)).toEqual(input.map(topic=>topic.title));
  });

  it("keeps the first topic and replaces the others when all three share one menu", () => {
    const {topics,filled}=assembleTopics([makeMenu("과메기는 왜 겨울에 찾을까?"),makeMenu("과메기는 왜 말릴까?"),makeMenu("과메기엔 왜 김을 싸 먹을까?")],base);
    expect(filled).toBe(2);
    expect(topics[0].title).toBe("과메기는 왜 겨울에 찾을까?");
    expect(topics.slice(1).map(topic=>topicMenu(topic)?.id)).not.toContain("gwamegi");
  });

  it("fills only the topic that broke a rule instead of discarding all three", () => {
    const {topics,filled}=assembleTopics([makeMenu("굴은 왜 겨울에 맛있을까?"),make("묵동홍어마을 국밥은 왜 맛있을까?"),make("전은 왜 비 오는 날 생각날까?")],base);
    expect(filled).toBe(1);
    expect(topics.slice(0,2).map(topic=>topic.title)).toEqual(["굴은 왜 겨울에 맛있을까?","전은 왜 비 오는 날 생각날까?"]);
    expect(topics[2].id).toMatch(/^fallback-/);
  });

  it("replaces a topic shown recently or already drafted", () => {
    const {topics,filled}=assembleTopics([make("수육에는 왜 김치를 곁들일까?"),make("굴은 왜 겨울에 맛있을까?"),makeMenu("과메기는 왜 겨울에 찾을까?")],{...base,avoidTitles:["수육에는 왜 김치를 곁들일까?"]});
    expect(filled).toBe(1);
    expect(topics.map(topic=>topic.title)).not.toContain("수육에는 왜 김치를 곁들일까?");
  });

  it("rotates the prepared topics away from the ones shown recently", () => {
    const first=fallbackTopics(0);
    const next=fallbackTopics(0,[],undefined,first.map(topic=>topic.title));
    expect(next.map(topic=>topic.title)).not.toEqual(first.map(topic=>topic.title));
    expect(next.some(topic=>first.some(shown=>shown.title===topic.title))).toBe(false);
  });

  it("reports a partial fill and only falls back fully when nothing usable came back", async () => {
    const onFallback=vi.fn(),onPartial=vi.fn();
    const whole=await suggestTopics({storeName:"묵동홍어마을"},{suggest:async()=>[makeMenu("굴은 왜 겨울에 맛있을까?","1"),make("국밥엔 왜 깍두기가 어울릴까?","2"),makeJeon("전은 왜 비 오는 날 생각날까?","3")]},onFallback,undefined,onPartial);
    expect(onPartial).not.toHaveBeenCalled();
    expect(whole.map(topic=>topic.id)).toEqual(["1","2","3"]);
    const partial=await suggestTopics({storeName:"묵동홍어마을"},{suggest:async()=>[makeMenu("굴은 왜 겨울에 맛있을까?","1"),{...make("국밥엔 왜 깍두기가 어울릴까?","2"),summary:"짧음"},make("전은 왜 비 오는 날 생각날까?","3")]},onFallback,undefined,onPartial);
    expect(onFallback).not.toHaveBeenCalled();
    expect(onPartial).toHaveBeenCalledWith(1);
    expect(partial.slice(0,2).map(topic=>topic.id)).toEqual(["1","3"]);
    const broken=await suggestTopics({storeName:"묵동홍어마을"},{suggest:async()=>[1,2,3].map(n=>({...make(`광고 ${n}`,String(n)),summary:"짧음"}))},onFallback);
    expect(onFallback).toHaveBeenCalledWith(expect.stringContaining("broke the topic rules"),undefined);
    expect(broken.every(topic=>topic.id.startsWith("fallback-"))).toBe(true);
  });

  it("tells the AI which topics were recently shown", () => {
    const prompt=buildTopicPrompt({storeName:"묵동홍어마을",avoidTitles:["수육에는 왜 김치를 곁들일까?"]});
    expect(prompt).toContain('"recentTitles":["수육에는 왜 김치를 곁들일까?"]');
    expect(buildTopicPrompt({storeName:"묵동홍어마을"})).not.toContain('"recentTitles"');
  });

  it("picks the menu slot by season: gwamegi in winter, not in summer", () => {
    const kst=(date:string)=>new Date(`${date}T12:00:00+09:00`);
    const winter=[0,1,2,3].flatMap(round=>fallbackTopics(round,[],seasonContext(kst("2027-01-25"))));
    expect(winter.some(topic=>topic.title.includes("과메기"))).toBe(true);
    const summer=[0,1,2,3].flatMap(round=>fallbackTopics(round,[],seasonContext(kst("2026-08-25"))));
    expect(summer.some(topic=>topic.title.includes("과메기"))).toBe(false);
    expect(summer.every((_,index)=>index%3!==0||summer.slice(index,index+3).some(isOtherMenuTopic))).toBe(true);
  });

  it("treats gwamegi as in season from November and as coming soon in October", () => {
    expect(menusForDate("2026-11-15","가을").inSeason.map(item=>item.id)).toContain("gwamegi");
    const october=menusForDate("2026-10-07","가을");
    expect(october.inSeason.map(item=>item.id)).not.toContain("gwamegi");
    expect(october.upcoming.map(item=>item.id)).toEqual(["gwamegi"]);
    expect(menusForDate("2026-03-10","봄").inSeason.map(item=>item.id)).not.toContain("gwamegi");
    const prompt=buildTopicPrompt({storeName:"묵동홍어마을"},seasonContext(new Date("2026-10-07T12:00:00+09:00")));
    expect(prompt).toContain('"upcomingMenus":["과메기"]');
  });

  it("brings gwamegi back in October and stops repeating the soup on every refresh", () => {
    const season=seasonContext(new Date("2026-10-07T12:00:00+09:00"));
    let current:string[]=[],recent:string[]=[];
    const menus:string[]=[];
    for(let round=0;round<8;round++){
      const topics=fallbackTopics(round,current,season,recent,{recentMenus:overusedMenus(recent,current)});
      menus.push(...topics.map(topic=>topicMenu(topic)?.id??""));
      current=topics.map(topic=>topic.title);recent=[...current,...recent].slice(0,15);
    }
    expect(menus).toContain("gwamegi");
    // 8번 새로고침(24개) 가운데 홍어애탕이 나온 횟수(예전에는 새로고침마다 나왔다).
    expect(menus.filter(id=>id==="hongeo-aetang").length).toBeLessThanOrEqual(3);
  });

  it("counts recently shown menus, including soup titles without the menu name", () => {
    expect(titleMenu("추운 날엔 왜 뜨끈한 탕이 당길까?")?.id).toBe("hongeo-aetang");
    expect([...overusedMenus([],["과메기는 왜 찬바람이 불면 찾을까?","홍어는 왜 수육이랑 먹을까?"])]).toEqual(["gwamegi"]);
    expect([...overusedMenus(["홍어애탕은 어떤 국물일까?","미나리전엔 왜 막걸리가 생각날까?","추운 날엔 왜 뜨끈한 탕이 당길까?"])]).toEqual(["hongeo-aetang"]);
  });

  it("marks the topic that uses a rising search word, and drops made-up trend labels", () => {
    const season=seasonContext(new Date("2026-10-07T12:00:00+09:00"));
    const topics=fallbackTopics(0,[],season,[],{trends:["과메기"]});
    expect(topics.filter(topic=>topic.trend==="과메기").length).toBe(1);
    const labeled=normalizeTrendLabels([{...makeMenu("과메기는 왜 겨울에 찾을까?"),trend:"과메기"},{...make("국밥엔 왜 깍두기가 어울릴까?"),trend:"과메기"},{...make("굴은 언제 맛있을까?"),trend:"굴"}],["과메기"]);
    expect(labeled.map(topic=>topic.trend)).toEqual(["과메기","",""]);
  });

  it("moves season and search topics to the front, keeping the AI order otherwise", () => {
    const {topics}=assembleTopics([make("홍어는 왜 겨울에 더 찾을까?"),makeJeon("국밥엔 왜 깍두기가 어울릴까?"),{...makeMenu("과메기는 왜 겨울에 찾을까?"),trend:"과메기"}],base);
    expect(topics.map(topic=>topic.title)).toEqual(["과메기는 왜 겨울에 찾을까?","홍어는 왜 겨울에 더 찾을까?","국밥엔 왜 깍두기가 어울릴까?"]);
  });

  it("uses every rising search word that leads to a menu in prepared topics (no one-topic cap)", () => {
    const season=seasonContext(new Date("2026-11-20T12:00:00+09:00"));
    const topics=fallbackTopics(0,[],season,[],{trends:["과메기","막걸리 안주"]});
    expect(topics.map(topic=>topic.trend).filter(Boolean).sort()).toEqual(["과메기","막걸리 안주"]);
  });

  it("asks the AI for menu variety and lists the store menu with seasonal picks", () => {
    const prompt=buildTopicPrompt({storeName:"묵동홍어마을"},seasonContext(new Date("2026-12-20T12:00:00+09:00")));
    for(const menu of ["과메기","미나리전","배다리 막걸리","홍어애탕","홍어무침"])expect(prompt).toContain(menu);
    expect(prompt).toContain("최소 1개는 홍어회·삼합이 아닌 메뉴");
    expect(prompt).toContain("삼합은 3개 중 최대 1개");
    expect(prompt).toMatch(/"seasonMenus":\[[^\]]*"과메기"/);
  });

  it("no longer asks for a fixed two everyday + one hongeo layout", () => {
    const prompt=buildTopicPrompt({storeName:"묵동홍어마을",recommendationRound:1});
    expect(prompt).toContain("몇 번째에 둘지 미리 정하지 마세요");
    expect(prompt).toContain("가장 추천하는 주제를 첫 번째에");
    expect(prompt).not.toContain("마지막 1개는 홍어");
    expect(prompt).not.toContain("- direction:");
    expect(prompt).toContain('"angleHints":');
    expect(prompt).not.toContain('"directions"');
  });

  it("asks for season and search topics first, general topics only when nothing fits", () => {
    const prompt=buildTopicPrompt({storeName:"묵동홍어마을",recommendationRound:0},seasonContext(new Date("2026-10-08T12:00:00+09:00")),[],["방어 +40%","과메기 +20%"]);
    expect(prompt).toContain("3개 모두 되도록 아래 둘 중 하나에서 출발하세요");
    expect(prompt).toContain("정말 이어질 거리가 없을 때만");
    expect(prompt).toContain("되도록 모두 쓰세요");
    // 예전 개수 상한(시기 1~2개, 검색 1개)은 없다.
    expect(prompt).not.toContain("3개 중 1~2개");
    expect(prompt).not.toContain("3개 중 1개는 그 가운데");
  });

  it("builds prepared sets with distinct hero menus, season topics first", () => {
    for(const date of ["2026-10-08","2026-11-20"]){
      const season=seasonContext(new Date(`${date}T12:00:00+09:00`));
      const topics=fallbackTopics(0,[],season);
      expect(topics[0].season,date).not.toBe("");
      expect(new Set(topics.map(topic=>topicMenu(topic)?.id)).size,date).toBe(3);
      expect(topics.some(isOtherMenuTopic),date).toBe(true);
    }
    for(let round=0;round<4;round++){
      const topics=fallbackTopics(round);
      expect(new Set(topics.map(topic=>topicMenu(topic)?.id)).size).toBe(3);
      expect(topics.filter(topic=>/삼합|수육/.test(topic.title+topic.summary)).length).toBeLessThanOrEqual(1);
    }
  });

  it("never offers gwamegi out of its season in prepared topics, but still previews it in October", () => {
    // 검토에서 찾은 사례: 5월·9월에도 "과메기는 왜 찬바람이 불면 찾을까?"가 나왔다(과메기는 11~2월).
    const offMonths=["2026-03-15","2026-05-01","2026-06-20","2026-08-25","2026-09-20","2026-09-28"];
    for(const date of offMonths){
      const season=seasonContext(new Date(`${date}T12:00:00+09:00`));
      for(let round=0;round<4;round++){
        const topics=fallbackTopics(round,[],season);
        expect(topics.some(topic=>topicMenu(topic)?.id==="gwamegi"),`${date} r${round}`).toBe(false);
      }
    }
    const october=seasonContext(new Date("2026-10-08T12:00:00+09:00"));
    expect([0,1,2,3].some(round=>fallbackTopics(round,[],october).some(topic=>topicMenu(topic)?.id==="gwamegi"))).toBe(true);
  });
});
