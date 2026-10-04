// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { ANCHOR, TREND_GROUPS, cachedTrendKeywords, fetchTrendKeywords, normalizeBatch, resetTrendCache, risingKeywords, trendLabel } from "@/features/topics/naverTrend";
import { buildTopicPrompt } from "@/features/topics/prompt";

// 12주(월요일 시작) 주 단위 구간. 마지막(10/5 주)은 endDate(10/4 토) 기준으로 아직 덜 끝난 주라 버려져야 한다.
const periods=Array.from({length:13},(_,i)=>new Date(Date.parse("2026-07-13T00:00:00Z")+i*7*86_400_000).toISOString().slice(0,10));
const flat=(value:number)=>periods.map(period=>({period,ratio:value}));
const risingAtEnd=(base:number,recent:number)=>periods.map((period,i)=>({period,ratio:i>=10&&i<12?recent:base}));

describe("naver trend", () => {
  afterEach(()=>{resetTrendCache();vi.restoreAllMocks();});

  it("normalizes by the anchor keyword and drops the unfinished last week", () => {
    const series=normalizeBatch([{title:ANCHOR,data:flat(50)},{title:"굴",data:flat(25)}],"2026-10-04");
    expect(series.get("굴")).toHaveLength(12);
    expect(series.get("굴")!.every(value=>value===0.5)).toBe(true);
    expect(series.has(ANCHOR)).toBe(false);
  });

  it("keeps keywords whose last two weeks grew 15% or more, skipping rare ones", () => {
    const series=new Map([["굴",[...Array(10).fill(1),1.5,1.5]],["수육",[...Array(10).fill(1),1.1,1.1]],["희귀",[...Array(10).fill(0.01),0.04,0.04]]]);
    expect(risingKeywords(series)).toEqual([{keyword:"굴",growth:1.5,level:1.5}]);
    expect(trendLabel({keyword:"굴",growth:1.42,level:1})).toBe("굴 +42%");
  });

  it("calls NAVER API HUB in batches of four groups plus the anchor, without leaking into results", async () => {
    const calls:Array<{url:string;headers:Record<string,string>;body:{startDate:string;endDate:string;timeUnit:string;keywordGroups:Array<{groupName:string;keywords:string[]}>}}>=[];
    const fetcher=vi.fn(async(url:string,init:RequestInit)=>{
      const body=JSON.parse(String(init.body));
      calls.push({url,headers:init.headers as Record<string,string>,body});
      return new Response(JSON.stringify({results:body.keywordGroups.map((group:{groupName:string})=>({title:group.groupName,data:group.groupName==="굴"?risingAtEnd(20,30):flat(group.groupName===ANCHOR?40:20)}))}),{status:200});
    });
    const trends=await fetchTrendKeywords({env:{NAVER_CLIENT_ID:"id",NAVER_CLIENT_SECRET:"secret"},fetch:fetcher as unknown as typeof fetch,today:"2026-10-05"});
    expect(calls).toHaveLength(Math.ceil(TREND_GROUPS.length/4));
    expect(calls[0].url).toBe("https://naverapihub.apigw.ntruss.com/search-trend/v1/search");
    expect(calls[0].headers).toMatchObject({"X-NCP-APIGW-API-KEY-ID":"id","X-NCP-APIGW-API-KEY":"secret"});
    expect(calls[0].body).toMatchObject({endDate:"2026-10-04",startDate:"2026-07-12",timeUnit:"week"});
    expect(calls[0].body.keywordGroups).toHaveLength(5);
    expect(calls[0].body.keywordGroups.at(-1)).toEqual({groupName:ANCHOR,keywords:[ANCHOR]});
    expect(trends.map(trend=>trend.keyword)).toEqual(["굴"]);
    expect(trends[0].growth).toBe(1.5);
  });

  it("supports legacy developer-center keys and explains a rejected key", async () => {
    const fetcher=vi.fn(async(_url:string,_init?:RequestInit)=>{void _init;return new Response("{}",{status:401});});
    await expect(fetchTrendKeywords({env:{NAVER_CLIENT_ID:"id",NAVER_CLIENT_SECRET:"secret",NAVER_API_STYLE:"legacy"},fetch:fetcher as unknown as typeof fetch,today:"2026-10-05"})).rejects.toThrow(/401/);
    expect(fetcher.mock.calls[0][0]).toBe("https://openapi.naver.com/v1/datalab/search");
  });

  it("returns nothing without keys and caches results for topic requests", async () => {
    expect(await fetchTrendKeywords({env:{}})).toEqual([]);
    const fetcher=vi.fn(async(_url:string,init:RequestInit)=>{const body=JSON.parse(String(init.body));return new Response(JSON.stringify({results:body.keywordGroups.map((group:{groupName:string})=>({title:group.groupName,data:group.groupName==="굴"?risingAtEnd(20,30):flat(20)}))}),{status:200});});
    const deps={env:{NAVER_CLIENT_ID:"id",NAVER_CLIENT_SECRET:"secret"},fetch:fetcher as unknown as typeof fetch,today:"2026-10-05"};
    const first=await cachedTrendKeywords(deps,0);
    const calls=fetcher.mock.calls.length;
    expect(await cachedTrendKeywords(deps,3_600_000)).toEqual(first);
    expect(fetcher.mock.calls.length).toBe(calls);
  });

  it("adds trend keywords to the topic prompt only when there are some", () => {
    const input={storeName:"묵동홍어마을",recommendationRound:0,excludeTitles:[]} as never;
    expect(buildTopicPrompt(input,undefined,[],["굴 +50%"])).toContain('"trendKeywords":["굴 +50%"]');
    expect(buildTopicPrompt(input)).not.toContain('"trendKeywords"');
  });
});
