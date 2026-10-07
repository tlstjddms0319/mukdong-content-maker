// @vitest-environment node
import { randomUUID } from "node:crypto";
import { describe,expect,it,vi } from "vitest";
import { isDueForPublishing,refreshConnectionIfNeeded,runPublishScheduler } from "@/features/instagram/scheduler";
import type { InstagramConnection,Publication } from "@/features/instagram/schema";
import type { Draft } from "@/features/drafts/schema";
import { PublicationLockError } from "@/features/instagram/repository";
import { NEEDS_CHECK_MESSAGE } from "@/features/instagram/publicationState";

const NOW=new Date("2026-09-11T00:00:00.000Z");
const iso=(offsetMs:number)=>new Date(NOW.getTime()+offsetMs).toISOString();
const DAY=24*60*60*1000;

function makeDraft(overrides:Partial<Draft>={}):Draft{
  const mediaId=randomUUID();
  return {id:randomUUID(),status:"verify",topic:"홍어",audience:"A",media_candidates:[{id:mediaId,source:"photo",file_id:"data:image/png;base64,AQ==",purpose:"instagram-cover"}],selected_media_id:mediaId,selected_media_ids:[mediaId],copy:null,caption:"예약 문안",planned_publish_at:iso(-60*60*1000),final_review_complete:true,facts_to_verify:[],store_profile_version:"v1",created_at:NOW.toISOString(),updated_at:NOW.toISOString(),...overrides};
}

function makeConnection(overrides:Partial<InstagramConnection>={}):InstagramConnection{
  return {instagramUserId:"ig-1",username:"mukdong",accessToken:"token",expiresAt:iso(20*DAY),scopes:["instagram_business_basic","instagram_business_content_publish"],connectedAt:iso(-10*DAY),updatedAt:iso(-10*DAY),...overrides};
}

function setup(drafts:Draft[],connection:InstagramConnection|null,publications:Record<string,Publication>={}){
  const store=new Map(Object.entries(publications));
  let locked=false;
  const repo={
    readPublication:vi.fn(async(id:string)=>store.get(id)??null),
    savePublication:vi.fn(async(value:Publication)=>{store.set(value.draftId,value);return value;}),
    async withPublicationLock<T>(_id:string,task:()=>Promise<T>){if(locked)throw new PublicationLockError();locked=true;try{return await task();}finally{locked=false;}},
  };
  const meta={createImageContainer:vi.fn(async()=>"container-1"),createCarouselContainer:vi.fn(async()=>"parent-1"),getContainerStatus:vi.fn(async()=>"FINISHED" as const),publishContainer:vi.fn(async()=>`post-${meta.publishContainer.mock.calls.length}`)};
  const saveConnection=vi.fn(async(value:InstagramConnection)=>value);
  const refreshToken=vi.fn(async()=>({accessToken:"fresh-token",expiresIn:5184000}));
  const deps={listDrafts:vi.fn(async()=>drafts),readDraft:vi.fn(async(id:string)=>drafts.find(draft=>draft.id===id)??null),readConnection:vi.fn(async()=>connection),saveConnection,refreshToken,repo,meta,baseUrl:"https://app.example.com",signingSecret:"secret",now:()=>NOW,wait:vi.fn(async()=>{}),log:vi.fn()};
  return {deps,repo,meta,saveConnection,refreshToken,store};
}

describe("Instagram publish scheduler",()=>{
  it("publishes only drafts whose planned time has passed with final review complete",async()=>{
    const due=makeDraft(),future=makeDraft({planned_publish_at:iso(DAY)}),unchecked=makeDraft({final_review_complete:false}),done=makeDraft();
    const published:Publication={draftId:done.id,status:"published",containerId:"c",mediaId:"post-old",safeError:null,attemptedAt:iso(-DAY),publishedAt:iso(-DAY)};
    const {deps,meta} =setup([future,due,unchecked,done],makeConnection(),{[done.id]:published});
    const run=await runPublishScheduler(deps);
    expect(isDueForPublishing(future,NOW)).toBe(false);
    expect(run.due.sort()).toEqual([due.id,done.id].sort());
    expect(run.published).toEqual([{draftId:due.id,mediaId:"post-1",alreadyPublished:false}]);
    expect(run.skipped).toEqual([{draftId:done.id,reason:"published"}]);
    expect(run.failed).toEqual([]);
    expect(meta.publishContainer).toHaveBeenCalledTimes(1);
    expect(deps.refreshToken).not.toHaveBeenCalled();
  });

  it("refreshes a token that expires within a week and keeps going when refresh fails",async()=>{
    const soon=makeConnection({expiresAt:iso(3*DAY),updatedAt:iso(-2*DAY)});
    const refreshed=await refreshConnectionIfNeeded(soon,{saveConnection:async value=>value,refreshToken:async()=>({accessToken:"fresh",expiresIn:5184000})},NOW);
    expect(refreshed.refreshed).toBe(true);
    expect(refreshed.connection.accessToken).toBe("fresh");
    expect(refreshed.connection.expiresAt).toBe(iso(5184000*1000));
    const young=await refreshConnectionIfNeeded(makeConnection({expiresAt:iso(3*DAY),updatedAt:iso(-60*60*1000)}),{saveConnection:async value=>value,refreshToken:vi.fn()},NOW);
    expect(young.refreshed).toBe(false);
    const failing=await refreshConnectionIfNeeded(soon,{saveConnection:async value=>value,refreshToken:async()=>{throw new Error("meta down");},log:vi.fn()},NOW);
    expect(failing.refreshed).toBe(false);
    expect(failing.connection.accessToken).toBe("token");
    const {deps,refreshToken}=setup([makeDraft()],soon);
    const run=await runPublishScheduler(deps);
    expect(refreshToken).toHaveBeenCalledWith("token");
    expect(run.tokenRefreshed).toBe(true);
    expect(run.published).toHaveLength(1);
  });

  it("waits out a cooldown after a failure and retries later",async()=>{
    const recent=makeDraft(),stale=makeDraft();
    const failed=(draftId:string,attemptedAt:string):Publication=>({draftId,status:"failed",containerId:null,mediaId:null,safeError:"실패",attemptedAt,publishedAt:null});
    const {deps}=setup([recent,stale],makeConnection(),{[recent.id]:failed(recent.id,iso(-10*60*1000)),[stale.id]:failed(stale.id,iso(-40*60*1000))});
    const run=await runPublishScheduler(deps);
    expect(run.skipped).toEqual([{draftId:recent.id,reason:"cooldown"}]);
    expect(run.published.map(item=>item.draftId)).toEqual([stale.id]);
  });

  it("stops without publishing when the connection is missing or expired",async()=>{
    const {deps,meta}=setup([makeDraft()],null);
    expect((await runPublishScheduler(deps)).reason).toBe("not-connected");
    const expired=setup([makeDraft()],makeConnection({expiresAt:iso(-DAY),updatedAt:iso(-70*DAY)}));
    const run=await runPublishScheduler(expired.deps);
    expect(run.reason).toBe("reconnect");
    expect(run.published).toEqual([]);
    expect(meta.publishContainer).not.toHaveBeenCalled();
    expect(expired.meta.publishContainer).not.toHaveBeenCalled();
  });

  it("does not publish a post that is more than six hours late (shown as missed instead)",async()=>{
    const late=makeDraft({planned_publish_at:iso(-7*60*60*1000)}),recent=makeDraft({planned_publish_at:iso(-5*60*60*1000)});
    expect(isDueForPublishing(late,NOW)).toBe(false);
    const {deps,meta}=setup([late,recent],makeConnection());
    const run=await runPublishScheduler(deps);
    expect(run.due).toEqual([recent.id]);
    expect(meta.publishContainer).toHaveBeenCalledTimes(1);
  });

  it("settles a publish that got stuck before the container existed and retries it",async()=>{
    const draft=makeDraft();
    const stuck:Publication={draftId:draft.id,status:"preparing",containerId:null,mediaId:null,safeError:null,attemptedAt:iso(-20*60*1000),publishedAt:null};
    const {deps,store}=setup([draft],makeConnection(),{[draft.id]:stuck});
    const run=await runPublishScheduler(deps);
    expect(run.published).toEqual([{draftId:draft.id,mediaId:"post-1",alreadyPublished:false}]);
    expect(store.get(draft.id)).toMatchObject({status:"published",mediaId:"post-1"});
  });

  it("asks Meta about a stuck container: published means done, unknown waits for the owner",async()=>{
    const posted=makeDraft(),unknown=makeDraft(),fresh=makeDraft();
    const stuck=(draftId:string,attemptedAt=iso(-20*60*1000)):Publication=>({draftId,status:"preparing",containerId:`c-${draftId}`,mediaId:null,safeError:null,attemptedAt,publishedAt:null});
    const {deps,meta,store}=setup([posted,unknown,fresh],makeConnection(),{[posted.id]:stuck(posted.id),[unknown.id]:stuck(unknown.id),[fresh.id]:stuck(fresh.id,iso(-2*60*1000))});
    meta.getContainerStatus.mockImplementation((async(id:string)=>id===`c-${posted.id}`?"PUBLISHED":"IN_PROGRESS") as never);
    const run=await runPublishScheduler(deps);
    expect(run.published).toEqual([{draftId:posted.id,mediaId:null,alreadyPublished:true}]);
    expect(run.skipped).toContainEqual({draftId:fresh.id,reason:"in-progress"});
    expect(store.get(unknown.id)?.safeError).toBe(NEEDS_CHECK_MESSAGE);
    expect(meta.publishContainer).not.toHaveBeenCalled();
    // 다음 점검에서는 확인을 기다리는 기록을 다시 묻지 않는다.
    meta.getContainerStatus.mockClear();
    const next=await runPublishScheduler(deps);
    expect(next.skipped).toContainEqual({draftId:unknown.id,reason:"needs-check"});
    expect(meta.getContainerStatus).not.toHaveBeenCalledWith(`c-${unknown.id}`,expect.anything());
  });

  it("only refreshes the token when auto publishing is off",async()=>{
    const soon=makeConnection({expiresAt:iso(3*DAY),updatedAt:iso(-2*DAY)});
    const {deps,meta,refreshToken}=setup([makeDraft()],soon);
    const run=await runPublishScheduler({...deps,autoPublish:false});
    expect(refreshToken).toHaveBeenCalled();
    expect(run).toMatchObject({reason:"autopublish-off",tokenRefreshed:true,due:[]});
    expect(meta.publishContainer).not.toHaveBeenCalled();
  });
});
