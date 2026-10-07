// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

const mocks=vi.hoisted(()=>({guard:vi.fn(),read:vi.fn(),score:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/features/auth/guard",()=>({ownerApiError:mocks.guard}));
vi.mock("@/features/images/assetLibrary",()=>({createAssetLibrary:()=>({read:mocks.read})}));
vi.mock("@/features/images/coverCheck",async(importOriginal)=>({...await importOriginal<typeof import("@/features/images/coverCheck")>(),scoreImages:mocks.score}));
const { POST }=await import("@/app/api/images/analyze/route");
const { AnalyzeResponseSchema, photoRank, rankPhotos }=await import("@/features/images/photoAnalysis");
const { coverScore }=await import("@/features/images/coverCheck");

const ID_A="11111111-1111-4111-8111-111111111111",ID_B="22222222-2222-4222-8222-222222222222",ID_C="33333333-3333-4333-8333-333333333333";
// 거의 검은 사진(어두움).
const darkPhoto=async()=>`data:image/jpeg;base64,${(await sharp({create:{width:1200,height:1200,channels:3,background:"#0a0806"}}).jpeg().toBuffer()).toString("base64")}`;
const asset=(id:string,flags:string[])=>({id,preview:"data:image/jpeg;base64,AAAA",quality:{luminance:.5,saturation:.3,cast:0,sharpness:1,longSide:1400,flags}});
const check=(appetite:number,warnings:string[]=[])=>({foodVisible:true,looksLikeSkate:true,textInImage:false,oddHands:false,appetite,lighting:4,composition:4,dark:false,blurry:false,clutter:false,note:"",score:coverScore({appetite,lighting:4,composition:4}),warnings});
const post=(body:unknown)=>POST(new Request("http://localhost/api/images/analyze",{method:"POST",body:JSON.stringify(body)}));

beforeEach(()=>{vi.clearAllMocks();mocks.guard.mockResolvedValue(null);delete process.env.GEMINI_API_KEY;});

describe("owner photo cover recommendation", () => {
  it("is guarded and validates the photo list", async () => {
    mocks.guard.mockResolvedValueOnce(new Response(null,{status:401}));
    expect((await post({photos:[{id:ID_A}]})).status).toBe(401);
    expect((await post({photos:[]})).status).toBe(400);
    expect((await post({photos:Array.from({length:11},(_,i)=>({id:`p${i}`}))})).status).toBe(400);
    expect((await post({photos:[{id:"a",image:"javascript:alert(1)"}]})).status).toBe(400);
  });

  it("uses stored quality, measures data URLs locally, and recommends without Gemini", async () => {
    mocks.read.mockImplementation(async(id:string)=>id===ID_A?asset(ID_A,["blurry"]):id===ID_B?asset(ID_B,[]):null);
    const response=await post({photos:[{id:ID_A},{id:"upload-1",image:await darkPhoto()},{id:ID_B},{id:ID_C}]});
    const data=AnalyzeResponseSchema.parse(await response.json());
    expect(data.photos.map(photo=>photo.labels)).toEqual([["흔들림"],expect.arrayContaining(["어두움"]),[],[]]);
    expect(data.photos[3].measured).toBe(false);
    expect(data.recommended).toBe(ID_B);
    expect(data.ranking[0]).toBe(ID_B);
    expect(data.scored).toBe(false);
    expect(data.scoreAvailable).toBe(false);
    expect(mocks.score).not.toHaveBeenCalled();
  });

  it("asks Gemini only when score:true, only for photos that passed the local check, and ranks by appetite", async () => {
    process.env.GEMINI_API_KEY="test-key";
    mocks.read.mockImplementation(async(id:string)=>id===ID_A?asset(ID_A,["dark"]):asset(id,[]));
    // 로컬 검사만(score 없음): Gemini를 부르지 않는다.
    await post({photos:[{id:ID_A},{id:ID_B},{id:ID_C}]});
    expect(mocks.score).not.toHaveBeenCalled();
    mocks.score.mockResolvedValue([check(2),check(5)]);
    const data=AnalyzeResponseSchema.parse(await (await post({photos:[{id:ID_A},{id:ID_B},{id:ID_C}],score:true,topic:"홍어전 이야기"})).json());
    expect(mocks.score).toHaveBeenCalledTimes(1);
    expect(mocks.score.mock.calls[0][0]).toHaveLength(2);
    expect(mocks.score.mock.calls[0][1].expectedFood.name).toBe("홍어전");
    expect(data.scored).toBe(true);
    expect(data.recommended).toBe(ID_C);
    expect(data.ranking).toEqual([ID_C,ID_B,ID_A]);
    expect(data.photos[0].appetite).toBeNull();
    expect(data.photos[2].appetite?.appetite).toBe(5);
  });

  it("falls back to local ranking when some or all Gemini checks fail", async () => {
    process.env.GEMINI_API_KEY="test-key";
    mocks.read.mockImplementation(async(id:string)=>asset(id,id===ID_A?["lowres"]:[]));
    mocks.score.mockResolvedValue(null);
    const data=AnalyzeResponseSchema.parse(await (await post({photos:[{id:ID_A},{id:ID_B}],score:true})).json());
    expect(data.scored).toBe(false);
    expect(data.recommended).toBe(ID_B);
    expect(data.message).toContain("밝기·선명도만");
    mocks.score.mockResolvedValue([null,check(3)]);
    const partial=AnalyzeResponseSchema.parse(await (await post({photos:[{id:ID_A},{id:ID_B}],score:true})).json());
    expect(partial.message).toContain("일부 사진");
  });

  it("keeps the owner's order on ties", () => {
    expect(rankPhotos([{id:"a",rank:photoRank({flags:[]})},{id:"b",rank:photoRank({flags:[]})},{id:"c",rank:photoRank({flags:["cast"]})}])).toEqual(["a","b","c"]);
  });
});
