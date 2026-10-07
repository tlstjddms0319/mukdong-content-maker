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
const base={storeName:"묵동홍어마을",round:0,excludeTitles:[],avoidTitles:[]};

describe("topic variety", () => {
  it("keeps valid AI topics and only reorders them into two everyday questions and one hongeo question", () => {
    const {topics,filled}=assembleTopics([make("홍어는 왜 겨울에 더 찾을까?"),makeMenu("과메기는 왜 겨울에 찾을까?"),make("국밥엔 왜 깍두기가 어울릴까?")],base);
    expect(filled).toBe(0);
    expect(topics.map(topic=>topic.title)).toEqual(["과메기는 왜 겨울에 찾을까?","국밥엔 왜 깍두기가 어울릴까?","홍어는 왜 겨울에 더 찾을까?"]);
  });

  it("swaps one everyday slot for another menu when all three lean on hongeo and samhap", () => {
    const {topics,filled}=assembleTopics([make("홍어는 왜 겨울에 더 찾을까?"),make("굴은 왜 겨울에 맛있을까?"),make("국밥엔 왜 깍두기가 어울릴까?")],base);
    expect(filled).toBe(1);
    expect(topics[0].title).toBe("굴은 왜 겨울에 맛있을까?");
    expect(isOtherMenuTopic(topics[1])).toBe(true);
    expect(topics[2].title).toBe("홍어는 왜 겨울에 더 찾을까?");
  });

  it("fills only the slot that broke the rules instead of discarding all three", () => {
    const {topics,filled}=assembleTopics([makeMenu("굴은 왜 겨울에 맛있을까?"),make("국밥엔 왜 깍두기가 어울릴까?"),make("전은 왜 비 오는 날 생각날까?")],base);
    expect(filled).toBe(1);
    expect(topics.slice(0,2).map(topic=>topic.title)).toEqual(["굴은 왜 겨울에 맛있을까?","국밥엔 왜 깍두기가 어울릴까?"]);
    expect(topics[2].title).toMatch(/홍어|삼합/);
    expect(topics[2].id).toMatch(/^fallback-/);
  });

  it("replaces a topic shown recently or already drafted", () => {
    const {topics,filled}=assembleTopics([make("수육에는 왜 김치를 곁들일까?"),make("굴은 왜 겨울에 맛있을까?"),make("홍어는 왜 겨울에 더 찾을까?")],{...base,avoidTitles:["수육에는 왜 김치를 곁들일까?"]});
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
    const partial=await suggestTopics({storeName:"묵동홍어마을"},{suggest:async()=>[makeMenu("굴은 왜 겨울에 맛있을까?","1"),make("국밥엔 왜 깍두기가 어울릴까?","2"),make("전은 왜 비 오는 날 생각날까?","3")]},onFallback,undefined,onPartial);
    expect(onFallback).not.toHaveBeenCalled();
    expect(onPartial).toHaveBeenCalledWith(1);
    expect(partial[0].title).toBe("굴은 왜 겨울에 맛있을까?");
    const broken=await suggestTopics({storeName:"묵동홍어마을"},{suggest:async()=>[1,2,3].map(n=>({...make(`광고 ${n}`,String(n)),summary:"짧음"}))},onFallback);
    expect(onFallback).toHaveBeenCalledWith(expect.stringContaining("broke the topic rules"));
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
      menus.push(...topics.slice(0,2).map(topic=>topicMenu(topic)?.id??""));
      current=topics.map(topic=>topic.title);recent=[...current,...recent].slice(0,15);
    }
    expect(menus).toContain("gwamegi");
    // 일상 질문 두 칸에 홍어애탕이 나온 횟수(예전에는 8번 새로고침 내내 나왔다).
    expect(menus.filter(id=>id==="hongeo-aetang").length).toBeLessThanOrEqual(2);
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

  it("asks the AI for menu variety and lists the store menu with seasonal picks", () => {
    const prompt=buildTopicPrompt({storeName:"묵동홍어마을"},seasonContext(new Date("2026-12-20T12:00:00+09:00")));
    for(const menu of ["과메기","미나리전","배다리 막걸리","홍어애탕","홍어무침"])expect(prompt).toContain(menu);
    expect(prompt).toContain("최소 1개는 홍어회·삼합이 아닌 메뉴");
    expect(prompt).toContain("삼합은 3개 중 최대 1개");
    expect(prompt).toMatch(/"seasonMenus":\[[^\]]*"과메기"/);
  });
});
