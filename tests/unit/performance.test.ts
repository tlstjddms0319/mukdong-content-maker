// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { engagementRate, engagementScore, likedTopicTitles, summarizePerformance, type PerformanceDraft } from "@/features/drafts/performance";
import { buildTopicPrompt } from "@/features/topics/prompt";

vi.mock("@/features/auth/guard", () => ({ ownerApiError: async () => null }));

const at="2026-10-01T00:00:00.000Z";
const post=(id:string,topic:string,score:{likes:number;comments?:number;saves?:number;shares?:number;reach?:number},over:Partial<PerformanceDraft>={}):PerformanceDraft=>({id,topic,audience:"A",performance:{likes:score.likes,comments:score.comments??0,saves:score.saves??0,shares:score.shares??0,...(score.reach?{reach:score.reach}:{}),recorded_at:at},...over});

describe("performance", () => {
  it("weights saves and shares above likes and computes a reach rate", () => {
    expect(engagementScore({likes:10,comments:2,saves:3,shares:1})).toBe(10+4+9+3);
    expect(engagementRate({likes:10,comments:0,saves:0,shares:0,reach:400,recorded_at:at})).toBe(2.5);
    expect(engagementRate({likes:10,comments:0,saves:0,shares:0,recorded_at:at})).toBeNull();
  });

  it("summarizes top posts and averages by style, audience and weekday", () => {
    const summary=summarizePerformance([
      post("1","김장날엔 왜 수육일까?",{likes:40,saves:10},{design_style:"webtoon",audience:"B",performance:{likes:40,comments:0,saves:10,shares:0,posted_on:"2026-11-03",recorded_at:at}}),
      post("2","같은 회인데 왜 다를까?",{likes:20},{design_style:"newspaper",planned_publish_at:"2026-11-06T09:00:00.000Z"}),
      post("3","홍어는 왜 톡 쏠까?",{likes:10},{design_style:"webtoon"}),
      {id:"4",topic:"기록 없음",audience:"C"},
    ]);
    expect(summary.recorded).toBe(3);
    expect(summary.top.map(item=>item.topic)).toEqual(["김장날엔 왜 수육일까?","같은 회인데 왜 다를까?","홍어는 왜 톡 쏠까?"]);
    expect(summary.byStyle).toEqual([{key:"webtoon",label:"웹툰·만화",count:2,average:40},{key:"newspaper",label:"신문·기사",count:1,average:20}]);
    expect(summary.byAudience[0]).toMatchObject({key:"B",label:"약속 결정형",average:70});
    // 올린 날: 직접 적은 날(11/3 화) 또는 게시 희망일시의 한국 날짜(11/6 금).
    expect(summary.byWeekday.map(group=>group.label)).toEqual(["화요일","금요일"]);
  });

  it("passes only clearly better-than-average topics to the topic prompt", () => {
    expect(likedTopicTitles([post("1","하나뿐",{likes:99})])).toEqual([]);
    const drafts=[post("1","김장날엔 왜 수육일까?",{likes:50,saves:20}),post("2","보통 주제일까?",{likes:10}),post("3","조용한 주제일까?",{likes:2})];
    expect(likedTopicTitles(drafts)).toEqual(["김장날엔 왜 수육일까?"]);
    const prompt=buildTopicPrompt({storeName:"묵동홍어마을",recommendationRound:0,excludeTitles:[]} as never,undefined,likedTopicTitles(drafts));
    expect(prompt).toContain('"likedTitles":["김장날엔 왜 수육일까?"]');
    expect(buildTopicPrompt({storeName:"묵동홍어마을",recommendationRound:0,excludeTitles:[]} as never)).not.toContain('"likedTitles"');
  });
});

let directory:string|undefined;
afterEach(async()=>{if(directory)await rm(directory,{recursive:true,force:true});directory=undefined;delete process.env.DATA_DIR;vi.resetModules();});

it("records, keeps and clears performance through the draft route", async () => {
  directory=await mkdtemp(path.join(tmpdir(),"mukdong-perf-"));
  process.env.DATA_DIR=directory;
  vi.resetModules();
  const { createDraftRepository }=await import("@/features/drafts/repository");
  const { PATCH, POST }=await import("@/app/api/drafts/route");
  const id="66666666-6666-4666-8666-666666666666";
  const draft={id,status:"ready",topic:"막걸리엔 왜 전일까?",audience:"A",media_candidates:[],selected_media_id:null,copy:null,facts_to_verify:[],store_profile_version:"2026-09-10",created_at:at,updated_at:at,design_style:"film"};
  const request=(method:string,body:unknown)=>new Request("http://localhost/api/drafts",{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  await POST(request("POST",draft));
  expect((await PATCH(request("PATCH",{id,performance:{likes:12,comments:1,saves:4,shares:2,posted_on:"2026-10-06"}}))).status).toBe(200);
  expect((await createDraftRepository(directory).readDraft(id))).toMatchObject({design_style:"film",performance:{likes:12,saves:4,posted_on:"2026-10-06"}});
  // 이미지를 다시 저장해도(POST) 적어 둔 성과는 남는다.
  await POST(request("POST",{...draft,updated_at:"2026-10-07T00:00:00.000Z"}));
  expect((await createDraftRepository(directory).readDraft(id))?.performance?.likes).toBe(12);
  expect((await PATCH(request("PATCH",{id,performance:{likes:-1,comments:0,saves:0,shares:0}}))).status).toBe(400);
  await PATCH(request("PATCH",{id,performance:null}));
  expect((await createDraftRepository(directory).readDraft(id))?.performance).toBeUndefined();
});
