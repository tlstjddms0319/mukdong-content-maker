// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildCarouselPlanPrompt, createFallbackCarouselPlan, planCarousel, type CarouselPlan } from "@/features/images/carousel";
import { photosNeeded, normalizeCardLayout } from "@/features/images/design";
import { PICKABLE_STYLES, STYLE_OPTIONS, TRACK_STYLES as TRACK_ONLY, styleCatalogText } from "@/features/images/styleCatalog";
import { TRACK_COPY, TRACK_FIT, applyTrack, fitLine, splitHeadline, trackPointCount, trackPointRoom, type CarouselTrack } from "@/features/images/track";
import { pickFittingStyle } from "@/features/images/variety";
import { rotateStyles } from "@/features/topics/monthPlan";
import { slideCopyIssues } from "@/features/images/planReview";
import { POST } from "@/app/api/images/plan/route";

vi.mock("@/features/auth/guard", () => ({ ownerApiError: async () => null }));
const readSettings=vi.hoisted(()=>vi.fn());
vi.mock("@/features/settings/repository", () => ({ readSettings }));
vi.mock("server-only", () => ({}));
const generateJson=vi.hoisted(()=>vi.fn());
vi.mock("@/lib/ai/geminiClient",()=>({createGeminiClient:()=>({generateJson})}));

// AI가 갈래 규칙을 어기고 길게 쓴 구성안(장 수도 7장이 아닌 5장, 디자인은 다른 계열·테마·계절).
function wordyPlan():CarouselPlan {
  const base=createFallbackCarouselPlan({topic:"비 오는 날 홍어 한 점",slideCount:5});
  return {...base,design:{palette:"night",style:"neon",theme:"retro",titleFont:"jua",bodyFont:"dodum",tone:"calm",season:"rain"},slides:base.slides.map((slide,i)=>i===0
    ?{...slide,headline:"비 오는 저녁, 막걸리 한 잔과 함께 먹는 홍어 한 점은 왜 생각날까",subline:"처음 먹는 친구에게 알려 주는 순서를 차근차근 모았어요"}
    :{...slide,layout:"collage",variant:2,titleFont:"jua",
      headline:"홍어 한 점은 씹을수록 진한 감칠맛이 천천히 올라와요",
      points:["홍어 살은 얇게 썰려 빛에 비추면 결이 또렷하게 보여요","처음이라면 덜 삭힌 쪽부터 작게 한 점 집어 보세요","막걸리 한 모금으로 입안을 정리하고 다음 점을 집어요"]})};
}

const words=(text:string)=>text.split(/\s+/).filter(Boolean);
// 줄인 글의 낱말은 모두 원래 글에 있던 낱말 그대로여야 한다(낱말 가운데를 자르지 않음). 끝의 쉼표는 떼어도 된다.
const wholeWords=(short:string,original:string)=>words(short).every(word=>words(original).some(source=>source===word||source.replace(/[,，·…]+$/,"")===word));

function expectTrackRules(plan:CarouselPlan,track:CarouselTrack){
  expect(plan.slideCount).toBe(5);
  expect(plan.slides).toHaveLength(5);
  expect(plan.design).toEqual({palette:"warm",style:track==="photo"?"photo-focus":"text-focus",theme:"classic",titleFont:"pretendard",bodyFont:"pretendard",tone:"loud",season:"none"});
  const photos=plan.slides.map(slide=>photosNeeded(normalizeCardLayout(slide)));
  expect(photos).toEqual(track==="photo"?[1,1,1,1,1]:[1,0,0,0,0]);
  expect(plan.slides[0].layout).toBe("fullscreen");
  const [cover,...rest]=plan.slides;
  // 글 길이는 카드에 실제로 들어가는 길이(TRACK_FIT)로 본다. AI에게 부탁하는 목표 길이(TRACK_COPY)는 그보다 짧다.
  expect(cover.headline.length).toBeLessThanOrEqual(TRACK_FIT.cover.headline);
  expect((cover.subline??"").length).toBeLessThanOrEqual(TRACK_FIT.cover.subline);
  expect(cover.points).toEqual([]);
  const rule=TRACK_COPY[track];
  for(const slide of rest){
    expect(slide.headline.length,slide.headline).toBeLessThanOrEqual(TRACK_FIT[track].headline);
    expect(slide.points.length).toBeLessThanOrEqual(trackPointCount(track,slide.headline));
    for(const point of slide.points)expect(point.length,point).toBeLessThanOrEqual(trackPointRoom(track,slide.headline,slide.points.length));
    expect(slide.titleFont).toBe("auto");
    expect(slide.variant).toBe(0);
  }
}

describe("track plans", () => {
  beforeEach(()=>{generateJson.mockReset();readSettings.mockReset().mockResolvedValue({textAiProvider:"automatic"});});

  it.each(["photo","text"] as const)("forces count, design and layouts for the %s track but leaves the AI copy for the review step", async track => {
    const plan=await planCarousel({topic:"비 오는 날 홍어 한 점",slideCount:7,track},{generate:async()=>wordyPlan()},{seed:3});
    // 글은 검수 AI가 원래 문장을 보고 고치도록 그대로 둔다(검수 보고서 B-2). 글 맞추기는 plan 경로 마지막에 한다.
    expect(plan.slides.map(slide=>[slide.headline,slide.points])).toEqual(wordyPlan().slides.map(slide=>[slide.headline,slide.points]));
    expectTrackRules(applyTrack(plan,track),track);
    // 길이를 맞출 때 낱말 가운데를 자르지 않는다.
    const original=wordyPlan();
    for(const [i,slide] of plan.slides.entries()){
      const source=[original.slides[i].headline,original.slides[i].subline??"",...original.slides[i].points].join(" ");
      for(const text of [slide.headline,slide.subline??"",...slide.points])expect(wholeWords(text,source),`${text} ⊄ ${source}`).toBe(true);
    }
  });

  it.each(["photo","text"] as const)("keeps the rules in the fallback plan of the %s track and skips the random mix", async track => {
    const topic="비 오는 저녁에 막걸리 한 잔과 함께 먹는 홍어 한 점은 왜 생각날까요";
    expectTrackRules(createFallbackCarouselPlan({topic,track}),track);
    for(let seed=0;seed<8;seed++)expectTrackRules(await planCarousel({topic,track},undefined,{seed}),track);
    // AI가 실패해도(기본 문안) 같은 규칙.
    expectTrackRules(await planCarousel({topic,track},{generate:async()=>{throw new Error("offline");}},{seed:5}),track);
  });

  it("keeps a sentence whole when it fits on the card", () => {
    const plan=createFallbackCarouselPlan({topic:"홍어",slideCount:5});
    const fitted=applyTrack({...plan,slides:plan.slides.map((slide,i)=>i===2?{...slide,headline:"홍어 한 점은 씹을수록 진한 감칠맛이 올라와요",points:[]}:slide)},"photo");
    expect(fitted.slides[2].headline).toBe("홍어 한 점은 씹을수록 진한 감칠맛이 올라와요");
    // 이미 맞는 구성안은 그대로(여러 번 맞춰도 같다).
    expect(applyTrack(fitted,"photo")).toEqual(fitted);
  });

  // 검수 보고서 B-1에서 직접 재현한 반쪽 문장들. 예전에는 앞 낱말을 덜어 내 주어·이유가 사라졌다.
  it("never cuts a sentence into a half that reads like a whole one", () => {
    const plan=createFallbackCarouselPlan({topic:"홍어",slideCount:5});
    const body=(track:CarouselTrack,headline:string,points:string[])=>applyTrack({...plan,slides:plan.slides.map((slide,i)=>i===2?{...slide,headline,points}:slide)},track).slides[2];
    expect(body("photo","홍어는 향이 달라요",["홍어는 삭힌 정도에 따라 향의 세기가 달라요"]).points).toEqual(["홍어는 삭힌 정도에 따라 향의 세기가 달라요"]);
    expect(body("text","왜 홍어는 막걸리와 함께 먹으면 더 맛있을까요?",[]).headline).toBe("왜 홍어는 막걸리와 함께 먹으면 더 맛있을까요?");
    // 글 중심에서 제목이 두 줄이면 짧은 글 하나(18자)만 들어간다: 넘치는 짧은 글은 반쪽("미나리전은 바삭할 때")으로 남기지 않고 뺀다.
    const text=body("text","바삭할 때가 제일 맛있어요 정말로",["미나리전은 바삭할 때 먹어야 향이 살아 있어요","식기 전에 드세요","뜨거울 때 드세요"]);
    expect(text.points).toEqual(["식기 전에 드세요"]);
    // 제목이 한 줄이면 두 개(각 18자)까지.
    expect(body("text","미나리전은 이래요",["식기 전에 드세요","뜨거울 때 드세요","세 번째는 빠져요"]).points).toEqual(["식기 전에 드세요","뜨거울 때 드세요"]);
    // 제목이 한 줄이면 짧은 글 하나는 34자까지 그대로.
    expect(body("text","미나리전은 이래요",["미나리전은 바삭할 때 먹어야 향이 살아 있어요"]).points).toEqual(["미나리전은 바삭할 때 먹어야 향이 살아 있어요"]);
    const cover=applyTrack({...plan,slides:plan.slides.map((slide,i)=>i===0?{...slide,headline:"홍어 처음 드시는 분께 알려 드리는 한 점 먹는 순서"}:slide)},"photo").slides[0];
    expect(cover.headline).toBe("홍어 처음 드시는 분께 알려 드리는 한 점 먹는 순서");
  });

  it("shortens a headline that does not fit with a visible ellipsis instead of dropping its start", () => {
    const plan=createFallbackCarouselPlan({topic:"홍어",slideCount:5});
    const long="홍어는 삭힌 정도에 따라 향의 세기가 달라서 처음 드시는 분은 덜 삭힌 것부터 드시면 좋아요";
    const slide=applyTrack({...plan,slides:plan.slides.map((item,i)=>i===2?{...item,headline:long}:item)},"photo").slides[2];
    expect(slide.headline.length).toBeLessThanOrEqual(TRACK_FIT.photo.headline);
    expect(slide.headline).toMatch(/^홍어는 삭힌 정도에 따라 .*…$/);
    // 쉼표 앞 첫 마디가 넉넉하면 "…" 없이 그 마디만 남긴다.
    const clause=applyTrack({...plan,slides:plan.slides.map((item,i)=>i===2?{...item,headline:"비 오는 날엔 홍어 한 점이 생각나요, 막걸리 한 잔도 곁들이면 더 좋고요"}:item)},"text").slides[2];
    expect(clause.headline).toBe("비 오는 날엔 홍어 한 점이 생각나요");
  });

  it.each(["photo","text"] as const)("ships the prepared copy of every menu on the %s track without cutting it", track => {
    for(const topic of ["홍어회","홍어무침","홍어찜","홍어애탕","과메기","미나리전","막걸리"]){
      const plain=createFallbackCarouselPlan({topic,slideCount:5});
      const tracked=createFallbackCarouselPlan({topic,slideCount:5,track});
      for(const [i,slide] of tracked.slides.entries()){
        if(slide.role==="cover")continue;
        const raw=plain.slides.find(item=>item.role===slide.role)!;
        expect(slide.headline,topic).toBe(raw.headline);
        expect(slide.points,`${topic} ${i}`).toEqual(raw.points.slice(0,TRACK_COPY[track].points));
      }
    }
  });

  it("shortens lines at word boundaries and keeps the sentence ending", () => {
    expect(fitLine("홍어 살은 얇게 썰려 빛에 비추면 결이 또렷하게 보여요",20)).toBe("빛에 비추면 결이 또렷하게 보여요");
    expect(fitLine("비 오는 날엔 홍어 한 점, 막걸리 한 잔이 생각나요",18)).toBe("비 오는 날엔 홍어 한 점");
    expect(fitLine("짧은 글이에요",20)).toBe("짧은 글이에요");
    for(const text of ["가까이 보면 결이 이렇게 살아 있어요","처음이라면 덜 삭힌 쪽부터 작게 한 점 집어 보세요","막걸리한잔과홍어한점을같이드세요아주좋아요"]){
      for(const max of [12,18,20,24]){
        const short=fitLine(text,max);
        expect(short.length).toBeLessThanOrEqual(max);
        expect(short.length).toBeGreaterThan(0);
        if(words(text).length>1)expect(wholeWords(short,text),`${short} ⊄ ${text}`).toBe(true);
      }
    }
  });

  it("does not leave a dangling modifier, adnominal or dependent noun at the start of a shortened line", () => {
    // 한 글자 부사(톡) 뒤, 관형형(삭힌) 뒤, 의존 명사(전에)에서 시작하지 않는다.
    expect(fitLine("톡 쏘는 향을 막걸리가 부드럽게 눌러요",20)).not.toMatch(/^쏘는/);
    expect(fitLine("덜 삭힌 홍어부터 드시면 향에 금방 익숙해져요",20)).not.toMatch(/^홍어부터/);
    expect(fitLine("가게에 오시기 전에 전화로 자리를 확인해 주세요",20)).toBe("전화로 자리를 확인해 주세요");
    // 마디 끝(~려) 뒤에서 시작하는 온전한 문장을 고르고, 자리가 넉넉하면 더 긴 뒷부분을 남긴다.
    expect(fitLine("과메기는 겨울 바닷바람에 말려 쫀득한 식감이 살아 있어요",20)).toBe("쫀득한 식감이 살아 있어요");
    expect(fitLine("과메기는 겨울 바닷바람에 말려 쫀득한 식감이 살아 있어요",24)).toBe("바닷바람에 말려 쫀득한 식감이 살아 있어요");
    // 제목을 나눌 때도 꾸밈말("한") 바로 뒤에서 나누지 않는다.
    const [head,tail]=splitHeadline("비 오는 저녁, 막걸리와 홍어 한 점이 당기는 이유",24,20)!;
    expect(head).not.toMatch(/ 한$/);
    expect(`${head} ${tail}`).toBe("비 오는 저녁, 막걸리와 홍어 한 점이 당기는 이유");
  });

  it("does not let the AI pick a track family when no track was asked for", async () => {
    const plan=await planCarousel({topic:"홍어와 막걸리",slideCount:5},{generate:async()=>{const base=createFallbackCarouselPlan({topic:"홍어와 막걸리",slideCount:5});return {...base,design:{...base.design,style:"text-focus"}};}},{seed:4});
    expect(TRACK_ONLY.has(plan.design.style)).toBe(false);
  });

  it("asks the AI for the track rules in the prompt and keeps the old prompt without a track", () => {
    const photo=buildCarouselPlanPrompt({topic:"비 오는 날 홍어",slideCount:7,track:"photo"});
    // 갈래 게시물은 장 수를 고정하지 않고 AI가 내용에 맞춰 4~9장 중에서 정한다.
    expect(photo).toContain("slideCount는 4~9 중에서");
    expect(photo).not.toContain("slideCount는 7");
    expect(photo).toContain("[갈래: 사진 중심]");
    expect(photo).toContain("headline 한 줄(18자 이내");
    expect(photo).toContain("짧은 글(points) 1개(24자 이내)");
    expect(photo).toContain(`"style":"photo-focus"`);
    expect(photo).not.toContain(styleCatalogText());
    const text=buildCarouselPlanPrompt({topic:"비 오는 날 홍어",track:"text"});
    expect(text).toContain("[갈래: 글 중심]");
    expect(text).toContain("짧은 글(points) 1~2개(각 18자 이내)");
    expect(text).toContain("나머지 장은 browser");
    const plain=buildCarouselPlanPrompt({topic:"비 오는 날 홍어",slideCount:7});
    expect(plain).not.toContain("[갈래");
    expect(plain).toContain("slideCount는 7");
    expect(plain).toContain(styleCatalogText());
  });

  it("measures copy against the track limits in the review step", () => {
    const plan=applyTrack(createFallbackCarouselPlan({topic:"홍어",slideCount:5}),"photo");
    // 사진 중심은 짧은 글 1개가 정상: "요점을 2~4개로" 문제를 만들지 않는다.
    expect(slideCopyIssues(plan,"photo").filter(issue=>issue.message.includes("2~4개"))).toEqual([]);
    expect(slideCopyIssues(plan).some(issue=>issue.message.includes("2~4개"))).toBe(true);
    const long={...plan,slides:plan.slides.map((slide,i)=>i===1?{...slide,headline:"홍어 한 점은 씹을수록 감칠맛이 나요"}:slide)};
    expect(slideCopyIssues(long,"photo").some(issue=>issue.slide===2&&issue.message.includes("18자"))).toBe(true);
  });

  it("returns a track plan from the plan route even when the AI ignores the rules", async () => {
    generateJson.mockResolvedValue(wordyPlan());
    const response=await POST(new Request("http://localhost/api/images/plan",{method:"POST",body:JSON.stringify({topic:"비 오는 날 홍어 한 점",slideCount:3,track:"text"})}));
    const body=await response.json();
    expect(response.status).toBe(200);
    expect(body.provider).not.toBe("fallback");
    expectTrackRules(body.plan,"text");
    // AI에 보낸 구성안 요청은 장 수를 AI에게 맡긴다(요청의 3장은 쓰지 않는다).
    expect(String(generateJson.mock.calls[0][0])).toContain("slideCount는 4~9 중에서");
  });

  it("keeps the slide count the AI chose for a track post, within 4 to 9", async () => {
    const sized=(count:number):CarouselPlan=>{
      const base=wordyPlan(),body=base.slides[1];
      const slides=Array.from({length:count},(_,i)=>i===0?base.slides[0]:{...body,headline:`이유 ${i}번은 이렇게 설명해요`,visualPrompt:`${i}번째 장면, 따뜻한 조명 아래 홍어 한 점`});
      return {...base,slideCount:count,slides};
    };
    const ask=async(count:number)=>{
      generateJson.mockResolvedValueOnce(sized(count));
      const response=await POST(new Request("http://localhost/api/images/plan",{method:"POST",body:JSON.stringify({topic:"비 오는 날 홍어 한 점",track:"photo"})}));
      return response.json();
    };
    for(const count of [4,7,9]){
      const body=await ask(count);
      expect(body.provider).not.toBe("fallback");
      expect(body.plan.slideCount).toBe(count);
      expect(body.plan.slides).toHaveLength(count);
      expect(body.plan.slides[0].role).toBe("cover");
      expect(body.plan.slides.at(-1).role).toBe("visit");
    }
    // 10장 넘게 오면 9장까지만 쓴다(맨 뒤 홍보 카드까지 10장).
    const long=await ask(12);
    expect(long.plan.slides).toHaveLength(9);
  });

  it("rejects an unknown track and keeps the old behaviour without one", async () => {
    const bad=await POST(new Request("http://localhost/api/images/plan",{method:"POST",body:JSON.stringify({topic:"홍어",track:"video"})}));
    expect(bad.status).toBe(400);
    generateJson.mockImplementation(async()=>{throw new Error("offline");});
    const response=await POST(new Request("http://localhost/api/images/plan",{method:"POST",body:JSON.stringify({topic:"홍어와 막걸리",slideCount:3})}));
    const body=await response.json();
    expect(body.plan.slideCount).toBe(3);
    expect(TRACK_ONLY.has(body.plan.design.style)).toBe(false);
  });
});

describe("track-only design families", () => {
  it("never offers the track families to the plan AI, the random mix, the month plan or the style picker", () => {
    for(const id of ["photo-focus","text-focus"] as const){
      expect(TRACK_ONLY.has(id)).toBe(true);
      expect(PICKABLE_STYLES).not.toContain(id);
      expect(styleCatalogText()).not.toContain(id);
      expect(STYLE_OPTIONS.map(([option])=>option)).not.toContain(id);
    }
    const texts=["","홍어 한 점","신메뉴 이벤트","비 오는 날 막걸리 한잔","잔치 명절 어르신"];
    for(const text of texts)for(let seed=0;seed<40;seed++)expect(TRACK_ONLY.has(pickFittingStyle(text,seed))).toBe(false);
    for(const month of ["2026-01","2026-10","2027-05"])expect(rotateStyles(30,month).some(style=>TRACK_ONLY.has(style))).toBe(false);
  });
});

// 실제 사례: 4번째 장이 "왜 물기가 생기지 않을까요?" + "물기가 없어 오래 보관해도 맛이 유지돼요"처럼
// 질문을 던지고 결과만 되풀이했다. 갈래 게시물은 질문을 표지에서만 던지고, 본문은 답 + 이유·확인 방법으로 쓴다.
describe("body slides answer instead of asking", () => {
  it("tells the plan AI to ask only on the cover and to give the reason in the short line", () => {
    const prompt=buildCarouselPlanPrompt({topic:"홍어무침엔 왜 막걸리일까?",slideCount:5,track:"photo"});
    expect(prompt).toContain("질문은 표지에서만 던집니다");
    expect(prompt).toContain("근거나 눈·입으로 확인하는 방법 하나");
    expect(prompt).toContain("물기가 없어 맛이 유지돼요");
  });
  it("flags a question headline on a body slide for the review pass", () => {
    const plan=applyTrack(createFallbackCarouselPlan({topic:"홍어무침",slideCount:5,track:"photo"}),"photo");
    const asked={...plan,slides:plan.slides.map((slide,i)=>i===3?{...slide,headline:"왜 물기가 생기지 않을까요?",points:["물기가 없어 오래 보관해도 맛이 유지돼요."]}:slide)};
    expect(slideCopyIssues(asked,"photo").filter(issue=>issue.slide===4&&issue.field==="headline").map(issue=>issue.message).join(" ")).toContain("질문 대신");
    // 표지 질문은 괜찮다.
    const cover={...plan,slides:plan.slides.map((slide,i)=>i===0?{...slide,headline:"홍어무침엔 왜 막걸리일까요?"}:slide)};
    expect(slideCopyIssues(cover,"photo").some(issue=>issue.slide===1&&issue.message.includes("질문 대신"))).toBe(false);
  });
});

// 사장님 지적: 인스타 독자는 큰 글씨만 훑는다. "홍어랑 삼합은 왜 같이 먹을까?" 뒤에 "홍어를 묵은지에 가볍게 감싸요"(먹는 법),
// 마지막에 "홍어 삼합은 수육에 곁들여요"(정의)가 나오면 궁금증이 안 풀리고 흐름이 끊긴다.
describe("headlines alone answer the cover question", () => {
  const plan=applyTrack(createFallbackCarouselPlan({topic:"홍어랑 삼합은 왜 같이 먹을까?",slideCount:5,track:"text"}),"text");
  const drifting={...plan,slides:plan.slides.map((slide,i)=>[
    {...slide,headline:"홍어랑 삼합은 왜 같이 먹을까?"},
    {...slide,headline:"홍어는 톡 쏘는 향이 강해요",points:["삭힌 정도에 따라 향이 달라요"]},
    {...slide,headline:"홍어를 묵은지에 가볍게 감싸요",points:["묵은지는 오래 익혀 새콤해요"]},
    {...slide,headline:"수육이 향을 부드럽게 눌러요",points:["막걸리 한 모금도 좋아요"]},
    {...slide,headline:"홍어 삼합은 수육에 곁들여요",points:["세 가지를 한 쌈에 먹어요"]},
  ][i])};
  it("tells the plan AI that every body headline answers the cover question and roles are only positions", () => {
    const prompt=buildCarouselPlanPrompt({topic:"홍어랑 삼합은 왜 같이 먹을까?",track:"text"});
    expect(prompt).toContain("제목만 이어 읽어도 표지 질문에 답하는 짧은 글 한 단락");
    expect(prompt).toContain("role은 장의 위치 표시일 뿐");
    expect(prompt).toContain("how-to 장에도 먹는 법 대신 이유");
    expect(prompt).not.toContain("마지막 장은 방문 전 확인할 것 하나로 닫으세요");
  });
  it("flags a how-to headline under a why cover and a short line that brings in a new food", () => {
    const issues=slideCopyIssues(drifting,"text");
    expect(issues.some(issue=>issue.slide===3&&issue.field==="headline"&&issue.message.includes("먹는 법"))).toBe(true);
    expect(issues.some(issue=>issue.slide===4&&issue.field==="points"&&issue.message.includes("막걸리"))).toBe(true);
    // 이유를 말하는 제목은 걸지 않는다.
    expect(issues.some(issue=>issue.slide===4&&issue.message.includes("먹는 법"))).toBe(false);
  });
  it("shows the review AI the headlines in a row and asks for one answer", async () => {
    const { buildPlanReviewPrompt }=await import("@/features/images/planReview");
    const prompt=buildPlanReviewPrompt(drifting,"홍어랑 삼합은 왜 같이 먹을까?",slideCopyIssues(drifting,"text"),{track:"text"});
    expect(prompt).toContain("[제목만 이어 읽기]\n1. 홍어랑 삼합은 왜 같이 먹을까?\n2. 홍어는 톡 쏘는 향이 강해요\n3. 홍어를 묵은지에 가볍게 감싸요");
    expect(prompt).toContain("표지 질문과 상관없는 제목(먹는 법·메뉴 정의·방문 안내)은 표지 질문의 이유로 바꾸세요");
  });
});
