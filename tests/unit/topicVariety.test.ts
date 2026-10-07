// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { assembleTopics, fallbackTopics, isOtherMenuTopic, suggestTopics } from "@/features/topics/service";
import { seasonContext } from "@/features/topics/season";
import { buildTopicPrompt } from "@/features/topics/prompt";

const summary="익숙한 장면에서 출발해 식감 차이를 설명하고 홍어를 관련 사례로 자연스럽게 연결합니다.";
const make=(title:string,id=title)=>({id,title,summary,reason:"이유",audience:"A" as const,imageBrief:"사진",season:""});
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

  it("asks the AI for menu variety and lists the store menu with seasonal picks", () => {
    const prompt=buildTopicPrompt({storeName:"묵동홍어마을"},seasonContext(new Date("2026-12-20T12:00:00+09:00")));
    for(const menu of ["과메기","미나리전","배다리 막걸리","홍어애탕","홍어무침"])expect(prompt).toContain(menu);
    expect(prompt).toContain("최소 1개는 홍어회·삼합이 아닌 메뉴");
    expect(prompt).toContain("삼합은 3개 중 최대 1개");
    expect(prompt).toMatch(/"seasonMenus":\[[^\]]*"과메기"/);
  });
});
