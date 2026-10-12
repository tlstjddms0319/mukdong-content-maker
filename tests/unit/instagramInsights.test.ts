// @vitest-environment node
import { describe,expect,it,vi } from "vitest";
import { collectInstagram,createInsightsClient,INSIGHTS_SCOPE } from "@/features/metrics/instagramInsights";
import type { InstagramDay,InstagramPost } from "@/features/metrics/store";
import type { InstagramConnection } from "@/features/instagram/schema";

const ok=(body:unknown)=>({ok:true,status:200,json:async()=>body}) as Response;
const bad=(status=400)=>({ok:false,status,json:async()=>({error:{message:"metric not supported"}})}) as Response;
const conn=(scopes:InstagramConnection["scopes"]=["instagram_business_basic","instagram_business_content_publish",INSIGHTS_SCOPE])=>({instagramUserId:"ig1",username:"mukdong",accessToken:"secret-token",expiresAt:"2027-01-01T00:00:00.000Z",scopes,connectedAt:"2026-10-01T00:00:00.000Z",updatedAt:"2026-10-01T00:00:00.000Z"});

describe("인사이트 호출",()=>{
  it("계정 인사이트를 한 번에 요청하고 total_value를 읽는다. 응답에 없는 지표는 빈칸",async()=>{
    const fetcher=vi.fn().mockResolvedValue(ok({data:[{name:"reach",total_value:{value:340}},{name:"views",total_value:{value:900}}]}));
    const value=await createInsightsClient(fetcher).dayInsights("ig1","t","2026-10-11");
    expect(value).toEqual({reach:340,views:900});
    const url=new URL(fetcher.mock.calls[0][0]);
    expect(url.searchParams.get("metric_type")).toBe("total_value");
    expect(url.searchParams.get("since")).toBe(String(Date.parse("2026-10-11T00:00:00+09:00")/1000));
  });
  it("한꺼번에 요청이 400이면 지표별로 다시 요청해 되는 것만 저장한다",async()=>{
    const fetcher=vi.fn(async(input:string)=>{
      const metric=new URL(input).searchParams.get("metric")!;
      if(metric.includes(","))return bad();
      if(metric==="profile_views")return bad();
      return ok({data:[{name:metric,total_value:{value:7}}]});
    });
    const value=await createInsightsClient(fetcher as unknown as typeof fetch).dayInsights("ig1","t","2026-10-11");
    expect(value.profileViews).toBeUndefined();
    expect(value.reach).toBe(7);
  });
});

function fakeStore(){
  const saved:Partial<InstagramDay>[]=[];
  return {saved,store:{saveDays:vi.fn(async(_c:string,days:Partial<InstagramDay>[])=>{saved.push(...days);})}};
}
const client=()=>({listMedia:vi.fn().mockResolvedValue([]),accountSnapshot:vi.fn().mockResolvedValue({followers:130,mediaCount:12}),dayInsights:vi.fn().mockResolvedValue({reach:10}),mediaInsights:vi.fn().mockResolvedValue({likes:5,comments:1,saves:2,shares:0,reach:80})});
const noDrafts={listDraftSummaries:async()=>[],readDraft:async()=>null,saveDraft:vi.fn()};

describe("게시물 목록",()=>{
  it("계정의 게시물을 필요한 필드로 요청하고 좋아요·댓글을 읽는다",async()=>{
    const fetcher=vi.fn().mockResolvedValue(ok({data:[{id:"m1",caption:"홍어 한 점",media_type:"CAROUSEL_ALBUM",media_product_type:"FEED",timestamp:"2026-10-10T03:00:00+0000",permalink:"https://www.instagram.com/p/x/",media_url:"https://cdn/x.jpg",like_count:12,comments_count:2}]}));
    const list=await createInsightsClient(fetcher).listMedia("ig1","t");
    expect(new URL(fetcher.mock.calls[0][0]).searchParams.get("fields")).toContain("like_count");
    expect(list).toEqual([{id:"m1",caption:"홍어 한 점",type:"CAROUSEL_ALBUM",product:"FEED",timestamp:"2026-10-10T03:00:00+0000",permalink:"https://www.instagram.com/p/x/",thumbnail:"https://cdn/x.jpg",likes:12,comments:2}]);
  });
  it("영상은 media_url 대신 thumbnail_url을 미리보기로 쓴다",async()=>{
    const fetcher=vi.fn().mockResolvedValue(ok({data:[{id:"r1",media_type:"VIDEO",media_product_type:"REELS",timestamp:"2026-10-10T03:00:00+0000",permalink:"p",media_url:"https://cdn/v.mp4",thumbnail_url:"https://cdn/t.jpg"}]}));
    expect((await createInsightsClient(fetcher).listMedia("ig1","t"))[0].thumbnail).toBe("https://cdn/t.jpg");
  });
});

describe("인사이트 실패 처리",()=>{
  it("지표별로 다시 물어도 하나도 안 되면 빈 기록 대신 오류를 낸다(권한 안내 포함)",async()=>{
    const fetcher=vi.fn().mockResolvedValue(bad(400));
    await expect(createInsightsClient(fetcher).dayInsights("ig1","t","2026-10-11")).rejects.toThrow(/다시 연결/);
  });
  it("게시물 인사이트가 비거나 실패하면 저장된 숫자를 0으로 덮지 않고, 다른 게시물은 계속한다",async()=>{
    const {store}=fakeStore();const c=client();
    c.mediaInsights.mockImplementation(async(id:string)=>{if(id==="gone")throw new Error("HTTP 400");if(id==="empty")return {};return {likes:3};});
    const drafts={listDraftSummaries:async()=>[{id:"a"},{id:"b"},{id:"c"}] as never,readDraft:async(id:string)=>({id}) as never,saveDraft:vi.fn(async(v:unknown)=>v)};
    const media:Record<string,string>={a:"gone",b:"empty",c:"ok"};
    const result=await collectInstagram({connection:conn(),store,client:c,drafts,readPublication:async(id:string)=>({status:"published",mediaId:media[id],publishedAt:"2026-10-10T03:00:00.000Z"}) as never,today:"2026-10-12",filledThrough:"2026-10-11"});
    expect(result.mediaUpdated).toBe(1);
    expect(drafts.saveDraft).toHaveBeenCalledOnce();
    expect(drafts.saveDraft.mock.calls[0][0]).toMatchObject({id:"c"});
  });
});

describe("인스타그램 수집",()=>{
  it("예전 권한뿐이면 건너뛴다",async()=>{
    const {store}=fakeStore();
    const result=await collectInstagram({connection:conn(["instagram_business_basic"]),store,client:client(),drafts:noDrafts,readPublication:async()=>null,today:"2026-10-12",filledThrough:undefined});
    expect(result.skipped).toBe("needs-reconnect");
    expect(store.saveDays).not.toHaveBeenCalled();
  });
  it("팔로워는 오늘 기록에, 인사이트는 최근 30일 안 빠진 날(마지막 이틀은 다시)에 채운다",async()=>{
    const {store,saved}=fakeStore();const c=client();
    const first=await collectInstagram({connection:conn(),store,client:c,drafts:noDrafts,readPublication:async()=>null,today:"2026-10-12",filledThrough:undefined});
    expect(saved[0]).toMatchObject({date:"2026-10-12",followers:130,mediaCount:12});
    expect(c.dayInsights.mock.calls[0][2]).toBe("2026-09-12");
    expect(first.daysFilled).toBe(30);
    expect(first.filledThrough).toBe("2026-10-11");
    c.dayInsights.mockClear();
    await collectInstagram({connection:conn(),store,client:c,drafts:noDrafts,readPublication:async()=>null,today:"2026-10-14",filledThrough:"2026-10-11"});
    expect(c.dayInsights.mock.calls.map(call=>call[2])).toEqual(["2026-10-10","2026-10-11","2026-10-12","2026-10-13"]);
  });
  it("올린 게시물 성과를 채우되 직접 적은 성과는 덮어쓰지 않는다",async()=>{
    const {store}=fakeStore();const c=client();
    const drafts={
      listDraftSummaries:async()=>[{id:"a"},{id:"b"}] as never,
      readDraft:async(id:string)=>({id,performance:id==="b"?{likes:1,comments:0,saves:0,shares:0,recorded_at:"2026-10-10T00:00:00.000Z"}:undefined}) as never,
      saveDraft:vi.fn(async(value:unknown)=>value),
    };
    const pub={status:"published",mediaId:"m1",publishedAt:"2026-10-10T03:00:00.000Z"};
    const result=await collectInstagram({connection:conn(),store,client:c,drafts,readPublication:async()=>pub as never,today:"2026-10-12",filledThrough:"2026-10-11"});
    expect(result.mediaUpdated).toBe(1);
    expect(drafts.saveDraft.mock.calls[0][0]).toMatchObject({id:"a",performance:{likes:5,comments:1,saves:2,shares:0,reach:80,posted_on:"2026-10-10",source:"instagram"}});
  });
  it("계정의 모든 게시물 숫자를 모아 저장하고, 앱으로 올린 게시물은 같은 값을 다시 묻지 않는다",async()=>{
    const posts:unknown[]=[];
    const store={saveDays:vi.fn(),savePosts:vi.fn(async(list:InstagramPost[])=>{posts.push(...list);return list;})};
    const c=client();
    c.listMedia.mockResolvedValue([{id:"m1",type:"IMAGE",timestamp:"2026-10-10T03:00:00+0000",permalink:"p1",likes:12,comments:2},{id:"m2",type:"VIDEO",product:"REELS",timestamp:"2026-09-01T03:00:00+0000",permalink:"p2",likes:4}]);
    c.mediaInsights.mockImplementation(async(id:string)=>id==="m1"?{likes:12,comments:2,saves:5,shares:1,reach:300,views:640}:Promise.reject(new Error("HTTP 500")));
    const drafts={listDraftSummaries:async()=>[{id:"a"}] as never,readDraft:async(id:string)=>({id}) as never,saveDraft:vi.fn(async(v:unknown)=>v)};
    const result=await collectInstagram({connection:conn(),store,client:c,drafts,readPublication:async()=>({status:"published",mediaId:"m1",publishedAt:"2026-10-10T03:00:00.000Z"}) as never,today:"2026-10-12",filledThrough:"2026-10-11"});
    expect(result.posts).toBe(2);
    expect(posts).toEqual([
      expect.objectContaining({id:"m1",likes:12,comments:2,saves:5,shares:1,reach:300,views:640}),
      expect.objectContaining({id:"m2",likes:4}), // 인사이트가 실패해도 목록의 좋아요는 남긴다
    ]);
    expect(c.mediaInsights.mock.calls.filter(call=>call[0]==="m1")).toHaveLength(1);
    expect(result.mediaUpdated).toBe(1);
  });
  it("8일 넘은 게시물은 7일마다, 90일 넘으면 가져오지 않는다",async()=>{
    const {store}=fakeStore();const c=client();
    const drafts={listDraftSummaries:async()=>[{id:"a"}] as never,readDraft:async(id:string)=>({id}) as never,saveDraft:vi.fn(async(v:unknown)=>v)};
    const at=(date:string)=>async()=>({status:"published",mediaId:"m",publishedAt:`${date}T03:00:00.000Z`}) as never;
    const run=(published:string)=>collectInstagram({connection:conn(),store,client:c,drafts,readPublication:at(published),today:"2026-10-12",filledThrough:"2026-10-11"});
    expect((await run("2026-10-02")).mediaUpdated).toBe(0); // 10일째
    expect((await run("2026-09-28")).mediaUpdated).toBe(1); // 14일째
    expect((await run("2026-07-01")).mediaUpdated).toBe(0); // 103일째
  });
});
