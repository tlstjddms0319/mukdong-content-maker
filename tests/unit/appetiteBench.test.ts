// @vitest-environment node
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only",()=>({}));
// @ts-expect-error 스크립트(.mjs)는 타입 선언이 없다.
const { compareToBaseline, scoreCards, sha1 } = await import("../../scripts/appetite-bench.mjs");
const { clearCoverCheckCache } = await import("@/features/images/coverCheck");

// 가짜 Gemini 응답: 그림마다 정해진 점수를 돌려준다. 실제 호출은 하지 않는다.
const reply=(scores:{appetite:number;lighting:number;composition:number})=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({
  foodVisible:true,looksLikeSkate:true,textInImage:true,oddHands:false,dark:false,blurry:false,clutter:false,note:"표지",...scores,
})}]}}]}),{status:200,headers:{"Content-Type":"application/json"}});
const card=(color:string)=>sharp({create:{width:64,height:80,channels:3,background:color}}).jpeg().toBuffer();

describe("appetite benchmark", () => {
  it("scores each new card once and answers repeat runs from the sha1 cache", async () => {
    clearCoverCheckCache();
    const request=vi.fn(async()=>reply({appetite:4,lighting:3,composition:5}));
    const cards=[{style:"omakase",image:await card("#c08070")},{style:"neon",image:await card("#203040")}];
    const cache:Record<string,unknown>={};
    const first=await scoreCards(cards,{cache,apiKey:"test-key",fetch:request});
    expect(first.calls).toBe(2);
    expect(first.failed).toEqual([]);
    expect(first.scores.omakase).toEqual({sha1:sha1(cards[0].image),appetite:4,lighting:3,composition:5});
    expect(Object.keys(cache)).toHaveLength(2);
    // 두 번째 실행: 같은 그림이면 호출 0번(메모리 캐시도 비워 파일 캐시만으로 답하는지 본다).
    clearCoverCheckCache();
    const second=await scoreCards(cards,{cache,apiKey:"test-key",fetch:request});
    expect(second.calls).toBe(0);
    expect(request).toHaveBeenCalledTimes(2);
    expect(second.scores).toEqual(first.scores);
    // 비밀값은 결과·캐시에 남지 않는다.
    expect(JSON.stringify({cache,scores:second.scores})).not.toContain("test-key");
  });

  it("does not cache failed calls and reports them", async () => {
    clearCoverCheckCache();
    const request=vi.fn(async()=>new Response("{}",{status:500}));
    const cache:Record<string,unknown>={};
    const result=await scoreCards([{style:"film",image:await card("#808080")}],{cache,apiKey:"k",fetch:request});
    expect(result.failed).toEqual(["film"]);
    expect(cache).toEqual({});
  });

  it("prints the change against the saved baseline", () => {
    const baseline={scores:{omakase:{sha1:"a",appetite:3,lighting:3,composition:4}}};
    const lines=compareToBaseline({omakase:{sha1:"b",appetite:4,lighting:3,composition:3},neon:{sha1:"c",appetite:2,lighting:2,composition:2}},baseline);
    expect(lines.join("\n")).toContain("appetite 4 (Δ+1)");
    expect(lines.join("\n")).toContain("composition 3 (Δ-1)");
    expect(lines.join("\n")).toContain("neon: appetite 2 · lighting 2 · composition 2 (기준선 없음)");
    expect(lines.at(-1)).toContain("평균 Δ");
  });

  it("explains how to add the key and exits without calling anything when GEMINI_API_KEY is missing", () => {
    // 빈 값으로 두면 .env.local이 있어도 덮어쓰지 않는다(process.loadEnvFile은 이미 있는 값을 그대로 둔다).
    const output=execFileSync(process.execPath,["--conditions=react-server","--experimental-transform-types","--disable-warning=ExperimentalWarning","--import","./scripts/register-ts.mjs","scripts/appetite-bench.mjs"],
      {cwd:resolve("."),env:{...process.env,GEMINI_API_KEY:""},encoding:"utf8"});
    expect(output).toContain("GEMINI_API_KEY가 없어");
    expect(output).toContain(".env.local");
  },60_000);
});
