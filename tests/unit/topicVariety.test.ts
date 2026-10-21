// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { meaningfulPhotoName } from "@/features/images/photoName";
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
    const {topics,filled}=assembleTopics([make("홍어는 왜 겨울에 더 찾을까?"),makeMenu("과메기는 왜 겨울에 찾을까?"),makeJeon("미나리전엔 왜 초간장이 어울릴까?")],base);
    expect(filled).toBe(0);
    expect(topics.map(topic=>topic.title)).toEqual(["홍어는 왜 겨울에 더 찾을까?","과메기는 왜 겨울에 찾을까?","미나리전엔 왜 초간장이 어울릴까?"]);
  });

  // 홍어 자체를 다루는 주제는 갈래가 다르면 두 개까지(홍어 상식·과학 주제가 버려지지 않게), 세 개는 안 된다.
  it("allows two hongeo topics but not a whole set of them", () => {
    const {topics,filled}=assembleTopics([make("홍어는 왜 겨울에 더 찾을까?"),make("홍어는 왜 찬 바다에서 맛이 들까?"),make("홍어엔 왜 깍두기도 어울릴까?")],base);
    expect(filled).toBe(1);
    expect(topics.slice(0,2).map(topic=>topic.title)).toEqual(["홍어는 왜 겨울에 더 찾을까?","홍어는 왜 찬 바다에서 맛이 들까?"]);
    expect(topics[2].id.startsWith("fallback-")).toBe(true);
    expect(new Set(topics.map(topic=>topicMenu(topic)?.id)).size).toBe(2);
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
    const soup={...make("홍어애탕은 어떤 국물일까?"),summary:"회로만 알던 홍어를 뜨끈한 국물로 먹는 홍어애탕을 소개하고 재료는 사장님께 확인한 뒤 씁니다."};
    const input=[makeMenu("과메기는 왜 냉동실이 아니라 찬바람에 말릴까?"),soup,makeJeon("미나리전은 왜 비 오는 날 생각날까?")];
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
    const {topics,filled}=assembleTopics([makeMenu("과메기는 왜 냉동실이 아니라 찬바람에 말릴까?"),make("묵동홍어마을 국밥은 왜 맛있을까?"),make("미나리전은 왜 비 오는 날 생각날까?")],base);
    expect(filled).toBe(1);
    expect(topics.slice(0,2).map(topic=>topic.title)).toEqual(["과메기는 왜 냉동실이 아니라 찬바람에 말릴까?","미나리전은 왜 비 오는 날 생각날까?"]);
    expect(topics[2].id).toMatch(/^fallback-/);
  });

  // 사장님 결정(2026-10-21): '했던 주제'와 같아도 거르지 않는다(피할 목록은 프롬프트에 "되도록"으로만). 지금 화면 주제만 거른다.
  it("keeps AI topics even when they match recently shown ones, but still drops the ones on screen", () => {
    const recent=["과메기는 왜 찬바람이 불면 찾을까?","미나리전엔 왜 막걸리가 생각날까?","홍어애탕은 어떤 국물일까?"];
    const aetang={...make(recent[2]),summary:"찬바람 부는 날 홍어애탕 한 그릇을 소개하고 재료와 맛은 사장님께 확인한 뒤 씁니다."};
    const all=assembleTopics([makeMenu(recent[0]),makeJeon(recent[1]),aetang],{...base,avoidTitles:recent});
    expect(all.filled).toBe(0);
    expect(all.rejected).toEqual({});
    expect(all.topics.map(topic=>topic.title)).toEqual(recent);
    // 지금 화면의 제목(excludeTitles)은 여전히 쓰지 않고, 그 이유를 센다.
    const now=assembleTopics([makeMenu(recent[0]),makeJeon("미나리전은 왜 비 오는 날 생각날까?"),{...aetang,title:"홍어애탕은 어떤 국물일까"}],{...base,excludeTitles:[recent[0]]});
    expect(now.topics.map(topic=>topic.title)).not.toContain(recent[0]);
    expect(now.rejected).toEqual({current:1,question:1});
  });

  it("accepts a quoted question title and a menu named only in the title", () => {
    const {filled}=assembleTopics([{...makeMenu("“과메기는 왜 겨울에 찾을까?”"),summary:"찬바람 부는 계절에 사람들이 찾는 이유를 출처를 확인해 설명하는 방향입니다."},makeJeon("미나리전은 왜 비 오는 날 생각날까?"),make("홍어는 왜 삭혀 먹을까?")],base);
    expect(filled).toBe(0);
  });

  it("keeps a topic shown recently or already drafted (2026-10-21: not a filter any more)", () => {
    const {topics,filled}=assembleTopics([make("홍어에는 왜 김치를 곁들일까?"),make("홍어는 왜 찬 바다에서 맛이 들까?"),makeMenu("과메기는 왜 겨울에 찾을까?")],{...base,avoidTitles:["홍어에는 왜 김치를 곁들일까?"]});
    expect(filled).toBe(0);
    expect(topics.map(topic=>topic.title)).toContain("홍어에는 왜 김치를 곁들일까?");
  });

  it("rotates the prepared topics away from the ones shown recently", () => {
    const first=fallbackTopics(0);
    const next=fallbackTopics(0,[],undefined,first.map(topic=>topic.title));
    expect(next.map(topic=>topic.title)).not.toEqual(first.map(topic=>topic.title));
    expect(next.some(topic=>first.some(shown=>shown.title===topic.title))).toBe(false);
  });

  it("reports a partial fill and only falls back fully when nothing usable came back", async () => {
    const onFallback=vi.fn(),onPartial=vi.fn();
    const whole=await suggestTopics({storeName:"묵동홍어마을"},{suggest:async()=>[makeMenu("과메기는 왜 냉동실이 아니라 찬바람에 말릴까?","1"),make("홍어엔 왜 깍두기도 어울릴까?","2"),makeJeon("미나리전은 왜 비 오는 날 생각날까?","3")]},onFallback,undefined,onPartial);
    expect(onPartial).not.toHaveBeenCalled();
    expect(whole.map(topic=>topic.id)).toEqual(["1","2","3"]);
    const partial=await suggestTopics({storeName:"묵동홍어마을"},{suggest:async()=>[makeMenu("과메기는 왜 냉동실이 아니라 찬바람에 말릴까?","1"),{...make("홍어엔 왜 깍두기도 어울릴까?","2"),summary:"짧음"},make("미나리전은 왜 비 오는 날 생각날까?","3")]},onFallback,undefined,onPartial);
    expect(onFallback).not.toHaveBeenCalled();
    expect(onPartial).toHaveBeenCalledWith(1);
    expect(partial.slice(0,2).map(topic=>topic.id)).toEqual(["1","3"]);
    const broken=await suggestTopics({storeName:"묵동홍어마을"},{suggest:async()=>[1,2,3].map(n=>({...make(`광고 ${n}`,String(n)),summary:"짧음"}))},onFallback);
    expect(onFallback).toHaveBeenCalledWith(expect.stringContaining("broke the topic rules"),undefined,{question:3});
    expect(broken.every(topic=>topic.id.startsWith("fallback-"))).toBe(true);
  });

  it("tells the AI which topics were recently shown", () => {
    const prompt=buildTopicPrompt({storeName:"묵동홍어마을",avoidTitles:["홍어에는 왜 김치를 곁들일까?"]});
    expect(prompt).toContain('"recentTitles":["홍어에는 왜 김치를 곁들일까?"]');
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
    // 8번 새로고침(24개) 가운데 홍어애탕이 나온 횟수(예전에는 새로고침마다 나왔다). 원리 노트 기반 애탕 주제 2개를 더해(2026-10-13) 상한을 4로.
    expect(menus.filter(id=>id==="hongeo-aetang").length).toBeLessThanOrEqual(4);
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
    const labeled=normalizeTrendLabels([{...makeMenu("과메기는 왜 겨울에 찾을까?"),trend:"과메기"},{...make("홍어엔 왜 깍두기도 어울릴까?"),trend:"과메기"},{...make("굴은 언제 맛있을까?"),trend:"굴"}],["과메기"]);
    expect(labeled.map(topic=>topic.trend)).toEqual(["과메기","",""]);
  });

  it("moves season and search topics to the front, keeping the AI order otherwise", () => {
    const {topics}=assembleTopics([make("홍어는 왜 겨울에 더 찾을까?"),makeJeon("미나리전엔 왜 초간장이 어울릴까?"),{...makeMenu("과메기는 왜 겨울에 찾을까?"),trend:"과메기"}],base);
    expect(topics.map(topic=>topic.title)).toEqual(["과메기는 왜 겨울에 찾을까?","홍어는 왜 겨울에 더 찾을까?","미나리전엔 왜 초간장이 어울릴까?"]);
  });

  it("uses every rising search word that leads to a menu in prepared topics (no one-topic cap)", () => {
    const season=seasonContext(new Date("2026-11-20T12:00:00+09:00"));
    const topics=fallbackTopics(0,[],season,[],{trends:["과메기","막걸리 안주"]});
    expect(topics.map(topic=>topic.trend).filter(Boolean).sort()).toEqual(["과메기","막걸리 안주"]);
  });

  it("keeps season badges: loose AI labels, unlabeled in-season menus, and prepared in-season topics", async () => {
    const season=seasonContext(new Date("2026-10-08T12:00:00+09:00"));
    const aetang={...make("홍어애탕은 어떤 국물일까?"),summary:"찬바람 부는 날 홍어애탕 한 그릇을 소개하고 재료와 맛은 사장님께 확인한 뒤 씁니다."};
    const topics=await suggestTopics({storeName:"묵동홍어마을"},{suggest:async()=>[{...makeMenu("과메기는 왜 찬바람이 불면 찾을까?"),season:"가을 제철"},aetang,{...makeJeon("막걸리엔 왜 전이 생각날까?"),season:"곧 막걸리의 날"}]},undefined,season);
    expect(Object.fromEntries(topics.map(topic=>[topic.title,topic.season]))).toEqual({"과메기는 왜 찬바람이 불면 찾을까?":"가을","홍어애탕은 어떤 국물일까?":"가을","막걸리엔 왜 전이 생각날까?":"막걸리의 날"});
    // 준비된 주제: 행사 주제가 빠져도(최근에 보여 줌) 제철 메뉴 주제에 계절 표시가 남는다.
    const prepared=fallbackTopics(0,[],season,["막걸리엔 왜 전을 곁들일까?"]);
    expect(prepared.filter(topic=>topic.season).length).toBeGreaterThanOrEqual(2);
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

  // 시기·검색만으로 세 자리를 채우면 "다른 주제 보기"마다 같은 메뉴가 돌아와(사장님 지적 2026-10-09) 1~2개로 줄이고 일반 궁금증을 최소 1개 둔다.
  it("mixes season and search topics with at least one general question", () => {
    const prompt=buildTopicPrompt({storeName:"묵동홍어마을",recommendationRound:0},seasonContext(new Date("2026-10-08T12:00:00+09:00")),[],["방어 +40%","과메기 +20%"]);
    expect(prompt).toContain("3개 중 1~2개는 아래 둘 중 하나에서 출발하세요");
    expect(prompt).toContain("나머지(최소 1개)는 시기와 상관없는 일반 음식 궁금증");
    expect(prompt).not.toContain("3개 모두 되도록");
    expect(prompt).toContain("검색어 주제는 3개 중 최대 2개");
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

describe("topics from the owner's photos", () => {
  it("asks the AI to start every topic from the photo, ahead of the other rules", () => {
    const prompt=buildTopicPrompt({storeName:"묵동홍어마을",photoNotes:["홍어무침 한 접시, 깨 뿌림"]});
    expect(prompt).toContain('"photoNotes":["홍어무침 한 접시, 깨 뿌림"]');
    expect(prompt).toContain("3개 모두 사진에 보이는 음식(가게 메뉴)을 주인공으로");
    expect(buildTopicPrompt({storeName:"묵동홍어마을"})).not.toContain('"photoNotes"');
  });

  it("keeps three AI questions about the same photographed dish (no menu-variety swap)", () => {
    const muchim=(title:string)=>({...make(title),summary:"붉은 양념의 홍어무침 한 접시에서 시작해 새콤한 맛과 어울리는 곁들임을 확인한 뒤 소개합니다."});
    const ai=[muchim("홍어무침은 왜 새콤할까?"),muchim("홍어무침엔 왜 막걸리가 어울릴까?"),muchim("홍어무침은 어떻게 먹으면 좋을까?")];
    const {topics,filled}=assembleTopics(ai,{...base,hints:{photoMenus:new Set(["hongeo-muchim"])}});
    expect(filled).toBe(0);
    expect(topics.map(topic=>topic.title)).toEqual(ai.map(topic=>topic.title));
    // 사진 없이 같은 셋이 오면 예전처럼 메뉴가 겹치는 둘은 다른 메뉴 주제로 바뀐다.
    expect(assembleTopics(ai,base).filled).toBe(2);
  });

  it("fills prepared topics with the photographed menu first, more than once when there are several", () => {
    const topics=fallbackTopics(0,[],undefined,[],{photoMenus:new Set(["gwamegi"])});
    expect(topicMenu(topics[0])?.id).toBe("gwamegi");
    // 예전에는 같은 메뉴를 한 번만 골라, 사진 메뉴 주제가 셋 중 하나뿐이었다(검수 보고서 B-7).
    expect(topics.filter(topic=>topicMenu(topic)?.id==="gwamegi").length).toBeGreaterThanOrEqual(2);
  });

  // 검수 보고서 B-7: AI가 사진과 상관없는 주제를 줘도 "사진을 보고 고른 주제"로 나왔다.
  it("does not keep AI topics about a menu that is not in the photo", () => {
    const muchim=(title:string)=>({...make(title),summary:"붉은 양념의 홍어무침 한 접시에서 시작해 새콤한 맛과 어울리는 곁들임을 확인한 뒤 소개합니다."});
    const aetang={...make("추운 날엔 왜 탕이 당길까?"),summary:"뜨끈한 홍어애탕 한 그릇에서 시작해 국물 맛과 건더기를 확인한 뒤 소개합니다."};
    const {topics,rejected}=assembleTopics([muchim("홍어무침은 왜 새콤할까?"),aetang,muchim("홍어무침엔 왜 막걸리가 어울릴까?")],{...base,hints:{photoMenus:new Set(["hongeo-muchim"])}});
    expect(topics.map(topic=>topic.title)).not.toContain("추운 날엔 왜 탕이 당길까?");
    expect(rejected.photo).toBe(1);
  });

  it("keeps the menu-variety rules when no store menu was found in the photo", () => {
    const samhap=(title:string)=>({...make(title),summary:"홍어 삼합 한 상에서 시작해 수육과 묵은지를 곁들이는 순서를 확인한 뒤 소개합니다."});
    const ai=[samhap("삼합은 왜 셋이 함께일까?"),samhap("삼합은 어떤 순서로 먹을까?"),samhap("삼합엔 왜 묵은지일까?")];
    // 빈 사진 메뉴 목록 = 사진 모드 아님: 삼합 주제가 겹치면 다른 메뉴 주제로 바뀐다.
    expect(assembleTopics(ai,{...base,hints:{photoMenus:new Set<string>()}}).filled).toBeGreaterThan(0);
  });
});

describe("photo file names as topic hints", () => {
  it("uses only names a person gave the photo", () => {
    expect(meaningfulPhotoName("홍어무침.jpg")).toBe("홍어무침");
    expect(meaningfulPhotoName("미나리전_한_접시.png")).toBe("미나리전 한 접시");
    for(const name of ["IMG_1234.JPG","KakaoTalk_20261009_123456789.jpg","스크린샷 2026-10-09 오후 3.12.45.png","사진 3.jpg","PXL_20261009.jpg","image.png","1696812345678.jpg"])
      expect(meaningfulPhotoName(name),name).toBe("");
  });
});

describe("topic answers from the AI that are partly wrong", () => {
  // 검수 보고서 P9: 제목 하나가 120자를 넘으면 세 주제를 통째로 버리고 준비된 주제로 바꿨다.
  it("keeps the good AI topics when one of them is malformed", async () => {
    const good=[makeMenu("과메기는 왜 반쯤 말릴까?","g1"),{...make("막걸리는 왜 사발에 마실까?","g2"),summary:"배다리 막걸리를 사례로 사발에 따르는 이유를 설명하고 본문 작성 전 확인할 정보를 적습니다."}];
    let fallback="";
    const topics=await suggestTopics({storeName:"묵동홍어마을"},{suggest:async()=>[{...make("홍어".repeat(61)+"?","bad")},...good]},reason=>{fallback=reason;});
    expect(fallback).toBe("");
    expect(topics.map(topic=>topic.title)).toEqual(expect.arrayContaining(good.map(topic=>topic.title)));
    expect(topics).toHaveLength(3);
  });
  // 검수 보고서 P3: 검색어 "전"이 "작성 전"에 걸려 홍어 주제에 검색 흐름 표시가 붙었다.
  it("does not attach a one-letter search word to a topic that only contains it inside another word", () => {
    const topic={...make("홍어는 왜 삭힐까?"),summary:"홍어회를 사례로 설명합니다. 본문 작성 전 확인할 정보를 적습니다.",trend:"전"};
    expect(normalizeTrendLabels([topic],["전"])[0].trend).toBe("");
    const minari={...make("미나리전엔 왜 막걸리일까?"),summary:"미나리전 한 접시와 막걸리를 사례로 설명합니다. 본문 작성 전 확인할 정보를 적습니다.",trend:"전"};
    // "전"이 가게 메뉴(미나리전)로 이어지는 말이면 그 메뉴 주제에는 붙는다.
    expect(normalizeTrendLabels([minari],["전"])[0].trend).toBe("전");
    // 메뉴가 아닌 말은 낱말 첫머리에서만: "굴보쌈"은 되고 "얼굴"은 안 된다.
    const oyster={...make("굴보쌈 대신 홍어 삼합은 어떨까?"),summary:"굴보쌈을 찾는 분께 홍어 삼합을 사례로 소개하고 본문 작성 전 확인할 정보를 적습니다.",trend:"굴"};
    expect(normalizeTrendLabels([oyster],["굴"])[0].trend).toBe("굴");
    const face={...make("홍어를 처음 먹을 때 왜 얼굴을 찡그릴까?"),summary:"홍어회의 톡 쏘는 향을 사례로 설명하고 본문 작성 전 확인할 정보를 적습니다.",trend:"굴"};
    expect(normalizeTrendLabels([face],["굴"])[0].trend).toBe("");
  });

  // 사장님 지적(2026-10-10): 제목은 "김장철 수육은 왜 김치와 짝꿍일까?"처럼 홍어와 상관없는데 설명에 삼합을 붙인 주제가 통과했다.
  it("rejects a topic whose title names neither hongeo nor a store menu", () => {
    const forced={...make("김장철 수육은 왜 김치와 떨어질 수 없는 짝꿍일까?"),summary:"김장철 수육과 김치의 조합에서 출발해 홍어를 더한 삼합으로 이어지는 방향입니다."};
    const {topics,rejected}=assembleTopics([forced,makeMenu("과메기는 왜 겨울에 찾을까?"),makeJeon("미나리전은 왜 비 오는 날 생각날까?")],base);
    expect(topics.map(topic=>topic.title)).not.toContain(forced.title);
    expect(rejected).toEqual({menu:1});
  });
});
