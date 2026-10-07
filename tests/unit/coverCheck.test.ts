// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

vi.mock("server-only",()=>({}));
const { checkCoverCandidates, clearCoverCheckCache, coverRank, coverScore, coverWarnings, expectedFoodFrom, scoreImages } = await import("@/features/images/coverCheck");

const image=(color="#d9b8a8")=>sharp({create:{width:900,height:1100,channels:3,background:color}}).jpeg().toBuffer();
const reply=(value:object)=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(value)}]}}]}),{status:200});
const GOOD={foodVisible:true,looksLikeSkate:true,textInImage:false,oddHands:false,appetite:4,lighting:4,composition:3,dark:false,blurry:false,clutter:false,note:"윤기가 좋아요",food:"홍어회"};
const asFetch=(fn:unknown)=>fn as typeof fetch;
const bodyOf=(fn:ReturnType<typeof vi.fn>,call=0)=>JSON.parse(String((fn.mock.calls[call] as unknown as [string,RequestInit])[1].body));
const urlOf=(fn:ReturnType<typeof vi.fn>,call=0)=>String((fn.mock.calls[call] as unknown as [string])[0]);

beforeEach(()=>{clearCoverCheckCache();vi.restoreAllMocks();});

describe("AI cover check", () => {
  it("sends a small JPEG with the checklist, a response schema, and turns problems into warnings", async () => {
    const request=vi.fn(async()=>reply({...GOOD,textInImage:true,note:"왼쪽 위에 글자가 있어요"}));
    const [check]=(await checkCoverCandidates([await image()],{apiKey:"key",fetch:asFetch(request)}))!;
    expect(check.warnings).toEqual(["이미지 속 글자"]);
    expect(check.score).toBe(coverScore(GOOD));
    const body=bodyOf(request);
    expect(body.contents[0].parts[0].text).toContain("삭힌 홍어회");
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseJsonSchema.required).toEqual(expect.arrayContaining(["appetite","lighting","composition","dark","blurry","clutter"]));
    const sent=await sharp(Buffer.from(body.contents[0].parts[1].inline_data.data,"base64")).metadata();
    expect(Math.max(sent.width??0,sent.height??0)).toBeLessThanOrEqual(512);
  });

  it("asks about the food named in the topic or slide title", async () => {
    expect(expectedFoodFrom("비 오는 날","홍어전 한 접시").name).toBe("홍어전");
    expect(expectedFoodFrom("홍어 삼합").name).toBe("삼합");
    expect(expectedFoodFrom("오늘의 이야기").name).toBe("홍어");
    // 사장님이 알려 준 다른 메뉴도 기대 음식으로 알아본다.
    expect(expectedFoodFrom("과메기는 왜 찬바람이 불면 찾을까?").name).toBe("과메기");
    expect(expectedFoodFrom("비 오는 날","미나리전 한 장").name).toBe("미나리전");
    expect(expectedFoodFrom("홍어애탕은 어떤 국물일까?").name).toBe("홍어애탕");
    expect(expectedFoodFrom("새콤한 홍어무침").name).toBe("홍어무침");
    expect(expectedFoodFrom("배다리 막걸리 한 잔").name).toBe("막걸리");
    expect(expectedFoodFrom("과메기는 왜 찬바람이 불면 찾을까?").description).toContain("과메기(");
    expect(coverWarnings({...GOOD,looksLikeSkate:false},"미나리전")).toEqual(["미나리전으로 안 보임"]);
    const request=vi.fn(async()=>reply({...GOOD,looksLikeSkate:false}));
    const [check]=(await checkCoverCandidates([await image()],{apiKey:"key",fetch:asFetch(request),expectedFood:expectedFoodFrom("홍어전")}))!;
    expect(bodyOf(request).contents[0].parts[0].text).toContain("홍어전(");
    expect(check.warnings).toEqual(["홍어전으로 안 보임"]);
  });

  it("scores from appetite, lighting and composition and ranks clean candidates first", () => {
    expect(coverScore({appetite:5,lighting:5,composition:5})).toBe(10);
    expect(coverScore({appetite:1,lighting:1,composition:1})).toBe(2);
    const clean={...GOOD,score:coverScore(GOOD),warnings:coverWarnings(GOOD)};
    const texty={...GOOD,textInImage:true,appetite:5,lighting:5,composition:5};
    const dark={...GOOD,dark:true,blurry:true};
    expect(coverRank(clean)).toBeGreaterThan(coverRank({...texty,score:coverScore(texty),warnings:coverWarnings(texty)}));
    expect(coverRank(clean)).toBeGreaterThan(coverRank({...dark,score:coverScore(dark),warnings:coverWarnings(dark)}));
    expect(coverWarnings({...GOOD,looksLikeSkate:false})).toEqual(["홍어로 안 보임"]);
    expect(coverWarnings(dark)).toEqual(["어두움","흐림"]);
  });

  it("keeps the other results when one image fails", async () => {
    // 정사각형 사진만 실패시킨다(보낸 축소본의 크기로 구분).
    const request=vi.fn(async(_url:string,init:RequestInit)=>{
      const meta=await sharp(Buffer.from(JSON.parse(String(init.body)).contents[0].parts[1].inline_data.data,"base64")).metadata();
      return meta.width===meta.height?new Response("boom",{status:500}):reply(GOOD);
    });
    vi.spyOn(console,"warn").mockImplementation(()=>{});
    const square=await sharp({create:{width:600,height:600,channels:3,background:"#d9b8a8"}}).jpeg().toBuffer();
    const results=await scoreImages([square,await image()],{apiKey:"key",fetch:asFetch(request),fallbackModel:""});
    expect(results?.map(Boolean)).toEqual([false,true]);
    clearCoverCheckCache();
    const checks=await checkCoverCandidates([square,await image()],{apiKey:"key",fetch:asFetch(request),fallbackModel:""});
    expect(checks?.map(check=>check.unchecked??false)).toEqual([true,false]);
    expect(checks?.[0].warnings).toEqual(["AI 점검 실패"]);
    expect(coverRank(checks![1])).toBeGreaterThan(coverRank(checks![0]));
  });

  it("retries once with the fallback model on 429, then gives up", async () => {
    const request=vi.fn(async(url:string)=>url.includes("backup-model")?reply(GOOD):new Response("quota",{status:429}));
    const [check]=(await checkCoverCandidates([await image()],{apiKey:"key",model:"main-model",fallbackModel:"backup-model",fetch:asFetch(request)}))!;
    expect(check.unchecked).toBeUndefined();
    expect(request).toHaveBeenCalledTimes(2);
    expect(urlOf(request,1)).toContain("backup-model");
    clearCoverCheckCache();
    const limited=vi.fn(async()=>new Response("quota",{status:429}));
    vi.spyOn(console,"warn").mockImplementation(()=>{});
    expect(await checkCoverCandidates([await image()],{apiKey:"key",model:"main-model",fallbackModel:"backup-model",fetch:asFetch(limited)})).toBeNull();
    expect(limited).toHaveBeenCalledTimes(2);
  });

  it("drops the response schema once if the model rejects it", async () => {
    const request=vi.fn(async(_url:string,init:RequestInit)=>JSON.parse(String(init.body)).generationConfig.responseJsonSchema?new Response("bad schema",{status:400}):reply(GOOD));
    const [check]=(await checkCoverCandidates([await image()],{apiKey:"key",fetch:asFetch(request)}))!;
    expect(check.score).toBe(coverScore(GOOD));
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("does not call Gemini again for the same image", async () => {
    const request=vi.fn(async()=>reply(GOOD));
    const bytes=await image();
    await checkCoverCandidates([bytes],{apiKey:"key",fetch:asFetch(request)});
    await checkCoverCandidates([Buffer.from(bytes)],{apiKey:"key",fetch:asFetch(request)});
    expect(request).toHaveBeenCalledTimes(1);
    // 기대 음식이 다르면 다른 질문이라 다시 점검한다.
    await checkCoverCandidates([bytes],{apiKey:"key",fetch:asFetch(request),expectedFood:expectedFoodFrom("홍어찜")});
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("skips the check without a key or when Gemini fails, and throws in strict mode", async () => {
    expect(await checkCoverCandidates([await image()],{apiKey:""})).toBeNull();
    const failing=vi.fn(async()=>new Response("down",{status:500}));
    vi.spyOn(console,"warn").mockImplementation(()=>{});
    expect(await checkCoverCandidates([await image()],{apiKey:"key",fetch:asFetch(failing)})).toBeNull();
    await expect(checkCoverCandidates([await image("#334455")],{apiKey:"key",fetch:asFetch(failing),strict:true})).rejects.toThrow("Gemini 500");
  });
});
