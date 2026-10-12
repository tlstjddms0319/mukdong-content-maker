// @vitest-environment node
// 사장님 요청(2026-10-12): 반응 데이터로 배우기. 예전에는 게시 2~3일 뒤 인사이트 숫자를 사장님이 직접 옮겨 적어야 해서
// 성과가 거의 쌓이지 않았다. 앱이 올린 게시물의 반응(도달·저장·공유·좋아요·댓글)을 Instagram에서 가져와 초안 성과로 남기고,
// 이미 있는 "반응 좋았던 주제"(likedTopicTitles)가 주제 추천에 넘긴다.
import { afterEach,describe,expect,it,vi } from "vitest";
import { instagramInsightsClient } from "@/features/instagram/metaClient";
import { INSIGHTS_SCOPE, canReadInsights, syncInstagramInsights } from "@/features/instagram/insights";
import { INSTAGRAM_SCOPES } from "@/features/instagram/oauth";
import { toPublicConnection } from "@/features/instagram/repository";
import type { InstagramConnection, Publication } from "@/features/instagram/schema";
import type { Performance } from "@/features/drafts/performance";

const NOW=new Date("2026-10-12T09:00:00.000Z");
const connection=(scopes:InstagramConnection["scopes"]):InstagramConnection=>({instagramUserId:"ig-1",username:"mukdong",accessToken:"token",expiresAt:"2026-12-01T00:00:00.000Z",scopes,connectedAt:"2026-10-01T00:00:00.000Z",updatedAt:"2026-10-01T00:00:00.000Z"});
const published=(draftId:string,publishedAt:string,mediaId:string|null="media-"+draftId.slice(0,4)):Publication=>({draftId,status:"published",containerId:"c",mediaId,safeError:null,attemptedAt:publishedAt,publishedAt});
const ID=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;

describe("Instagram media insights",()=>{
  afterEach(()=>vi.unstubAllGlobals());

  it("reads reach, saves, shares, likes and comments, and the posting day in Korea",async()=>{
    const fetchMock=vi.fn(async(url:URL)=>{
      if(String(url).includes("/insights"))return {ok:true,json:async()=>({data:[
        {name:"reach",values:[{value:812}]},
        {name:"saved",values:[{value:31}]},
        {name:"shares",total_value:{value:9}},
        {name:"likes",values:[{value:120}]},
        {name:"comments",values:[{value:7}]},
      ]})};
      return {ok:true,json:async()=>({id:"media-1",timestamp:"2026-10-09T16:30:00+0000"})};
    });
    vi.stubGlobal("fetch",fetchMock);
    const result=await instagramInsightsClient.getMediaInsights("media-1","token");
    expect(result).toEqual({reach:812,saves:31,shares:9,likes:120,comments:7,posted_on:"2026-10-10"});
    const insightsUrl=String(fetchMock.mock.calls.find(([url])=>String(url).includes("/insights"))![0]);
    expect(insightsUrl).toContain("media-1/insights");
    expect(new URL(insightsUrl).searchParams.get("metric")).toBe("reach,saved,shares,likes,comments");
  });

  it("asks for the insights permission when connecting, and tells an older connection to reconnect",()=>{
    expect(INSTAGRAM_SCOPES).toContain(INSIGHTS_SCOPE);
    expect(canReadInsights(connection(["instagram_business_basic","instagram_business_content_publish"]))).toBe(false);
    expect(toPublicConnection(connection(["instagram_business_basic","instagram_business_content_publish"])).insights).toBe(false);
    expect(toPublicConnection(connection([...INSTAGRAM_SCOPES])).insights).toBe(true);
  });
});

describe("syncing insights into draft performance",()=>{
  function setup(drafts:Array<{id:string;performance?:Performance}>,publications:Record<string,Publication>){
    const saved:Record<string,Performance>={};
    const client={getMediaInsights:vi.fn(async(mediaId:string)=>({reach:500,saves:20,shares:5,likes:80,comments:4,posted_on:"2026-10-10",mediaId}))};
    const run=()=>syncInstagramInsights({
      connection:connection([...INSTAGRAM_SCOPES]),
      listDrafts:async()=>drafts.map(draft=>({id:draft.id,performance:draft.performance})),
      readPublication:async(id:string)=>publications[id]??null,
      savePerformance:async(id:string,performance:Performance)=>{saved[id]=performance;},
      client,now:NOW,
    });
    return {saved,client,run};
  }

  it("fills in performance for recent published posts, marked as fetched from Instagram",async()=>{
    const {saved,run}=setup([{id:ID(1)}],{[ID(1)]:published(ID(1),"2026-10-10T03:00:00.000Z")});
    expect(await run()).toMatchObject({updated:[ID(1)]});
    expect(saved[ID(1)]).toMatchObject({reach:500,saves:20,shares:5,likes:80,comments:4,posted_on:"2026-10-10",source:"instagram",recorded_at:NOW.toISOString(),fetched_at:NOW.toISOString()});
  });

  it("never overwrites numbers the owner typed in, and skips unpublished, unmatched and old posts",async()=>{
    const manual:Performance={likes:1,comments:1,saves:1,shares:1,recorded_at:"2026-10-11T00:00:00.000Z"};
    const {saved,client,run}=setup(
      [{id:ID(1),performance:manual},{id:ID(2)},{id:ID(3)},{id:ID(4)}],
      {
        [ID(1)]:published(ID(1),"2026-10-10T03:00:00.000Z"),
        [ID(2)]:{...published(ID(2),"2026-10-10T03:00:00.000Z"),status:"failed"},
        [ID(3)]:published(ID(3),"2026-10-10T03:00:00.000Z",null), // 사장님이 "올라감"으로 정리한 게시물(미디어 번호 없음)
        [ID(4)]:published(ID(4),"2026-09-20T03:00:00.000Z"),       // 게시 뒤 7일이 지나 숫자가 거의 굳은 게시물
      },
    );
    await run();
    expect(client.getMediaInsights).not.toHaveBeenCalled();
    expect(saved).toEqual({});
  });

  it("refreshes numbers it fetched before only after a few hours",async()=>{
    const fetched=(at:string):Performance=>({likes:1,comments:1,saves:1,shares:1,recorded_at:at,fetched_at:at,source:"instagram"});
    const {saved,run}=setup(
      [{id:ID(1),performance:fetched("2026-10-12T07:00:00.000Z")},{id:ID(2),performance:fetched("2026-10-12T01:00:00.000Z")}],
      {[ID(1)]:published(ID(1),"2026-10-10T03:00:00.000Z"),[ID(2)]:published(ID(2),"2026-10-10T03:00:00.000Z")},
    );
    await run();
    expect(Object.keys(saved)).toEqual([ID(2)]);
  });

  it("does nothing without the insights permission, and keeps going when one post fails",async()=>{
    const {client,run}=setup([{id:ID(1)}],{[ID(1)]:published(ID(1),"2026-10-10T03:00:00.000Z")});
    const old=await syncInstagramInsights({connection:connection(["instagram_business_basic","instagram_business_content_publish"]),listDrafts:async()=>[{id:ID(1)}],readPublication:async()=>published(ID(1),"2026-10-10T03:00:00.000Z"),savePerformance:async()=>{},client,now:NOW});
    expect(old).toMatchObject({skipped:"no-permission"});
    expect(client.getMediaInsights).not.toHaveBeenCalled();
    client.getMediaInsights.mockRejectedValueOnce(new Error("Meta 400"));
    expect(await run()).toMatchObject({failed:[ID(1)],updated:[]});
  });
});
