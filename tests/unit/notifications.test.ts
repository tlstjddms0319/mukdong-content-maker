// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { missedCandidates, planNotifications, pruneSent, type NotifyDraft } from "@/features/notifications/planner";
import { DEFAULT_NOTIFICATION_PREFS, type StoredPushSubscription } from "@/features/notifications/schema";
import { readNotificationState, readVapidKeys, resetNotificationCaches, updateNotificationState } from "@/features/notifications/repository";
import { deliver, runNotificationCheck, sendTestNotification } from "@/features/notifications/runtime";

// 2026-10-13(화) 한국 시간 오전 11시.
const TUE_11=new Date("2026-10-13T02:00:00.000Z");
const at=(kst:string)=>new Date(`${kst}+09:00`);
const prefs=DEFAULT_NOTIFICATION_PREFS;
const draft=(overrides:Partial<NotifyDraft>={}):NotifyDraft=>({id:"d1",topic:"비 오는 날 홍어전",created_at:"2026-10-10T03:00:00.000Z",...overrides});
const keys=(messages:{key:string}[])=>messages.map(message=>message.key);

describe("planNotifications",()=>{
  it("올리는 요일(기본 화·금) 설정 시각이 지나면 그날 한 번 알린다",()=>{
    const messages=planNotifications({now:TUE_11,prefs,sent:{},drafts:[draft()]});
    expect(keys(messages)).toEqual(["make:2026-10-13"]);
    expect(messages[0].url).toBe("/");
    expect(planNotifications({now:TUE_11,prefs,sent:{"make:2026-10-13":TUE_11.toISOString()},drafts:[draft()]})).toEqual([]);
  });

  it("설정 시각 전·밤 10시 이후·올리는 날이 아닌 날에는 알리지 않는다",()=>{
    expect(planNotifications({now:at("2026-10-13T09:30:00"),prefs,sent:{},drafts:[draft()]})).toEqual([]);
    expect(planNotifications({now:at("2026-10-13T22:10:00"),prefs,sent:{},drafts:[draft()]})).toEqual([]);
    expect(planNotifications({now:at("2026-10-14T11:00:00"),prefs,sent:{},drafts:[draft({created_at:"2026-10-12T03:00:00.000Z"})]})).toEqual([]);
  });

  it("한 달 계획에 오늘 주제가 있으면 요일과 상관없이 그 주제로 알리고 기획표를 연다",()=>{
    const messages=planNotifications({now:at("2026-10-14T11:00:00"),prefs,sent:{},drafts:[draft({created_at:"2026-10-12T03:00:00.000Z"})],planToday:{title:"과메기 제철"}});
    expect(messages[0]).toMatchObject({key:"make:2026-10-14",url:"/plan"});
    expect(messages[0].body).toContain("과메기 제철");
  });

  it("오늘 글을 이미 만들었거나 오늘 예약해 뒀으면 알리지 않는다",()=>{
    expect(planNotifications({now:TUE_11,prefs,sent:{},drafts:[draft({created_at:at("2026-10-13T08:00:00").toISOString()})]})).toEqual([]);
    expect(planNotifications({now:TUE_11,prefs,sent:{},drafts:[draft({plan_date:"2026-10-13"})]})).toEqual([]);
    expect(planNotifications({now:TUE_11,prefs,sent:{},drafts:[draft({final_review_complete:true,planned_publish_at:at("2026-10-13T18:00:00").toISOString()})]})).toEqual([]);
  });

  it("마지막 글 뒤 정한 날수(기본 5일)마다 쉰 날짜를 알린다",()=>{
    const off={...prefs,makeDay:false};
    const old=draft({created_at:at("2026-10-08T12:00:00").toISOString()});
    expect(keys(planNotifications({now:TUE_11,prefs:off,sent:{},drafts:[old]}))).toEqual(["quiet:2026-10-08:1"]);
    expect(planNotifications({now:TUE_11,prefs:off,sent:{},drafts:[old]})[0].title).toBe("5일째 새 글이 없어요");
    expect(planNotifications({now:TUE_11,prefs:{...off,quietDays:0},sent:{},drafts:[old]})).toEqual([]);
    expect(planNotifications({now:TUE_11,prefs:off,sent:{},drafts:[draft({created_at:at("2026-10-10T12:00:00").toISOString()})]})).toEqual([]);
  });

  it("올리는 날 알림을 보내는 날에는 쉰 날짜 알림을 겹쳐 보내지 않는다",()=>{
    expect(keys(planNotifications({now:TUE_11,prefs,sent:{},drafts:[draft({created_at:at("2026-10-01T12:00:00").toISOString()})]}))).toEqual(["make:2026-10-13"]);
  });

  it("예약 게시 결과는 밤에도 바로 알리고, 이미 올라간 글을 다시 확인한 것은 알리지 않는다",()=>{
    const night=at("2026-10-13T23:30:00");
    const messages=planNotifications({now:night,prefs,sent:{},drafts:[draft()],run:{published:[{draftId:"d1",mediaId:"m",alreadyPublished:false},{draftId:"d2",mediaId:"m",alreadyPublished:true}],failed:[{draftId:"d3",message:"x"}]}});
    expect(keys(messages)).toEqual(["published:d1","failed:d3:2026-10-13"]);
    expect(messages[0].body).toContain("비 오는 날 홍어전");
    expect(planNotifications({now:night,prefs:{...prefs,publishResults:false},sent:{},drafts:[],run:{published:[{draftId:"d1",mediaId:"m",alreadyPublished:false}],failed:[]}})).toEqual([]);
  });

  it("예약 놓침은 낮에만 알린다",()=>{
    const missed=[draft({final_review_complete:true,planned_publish_at:at("2026-10-12T18:00:00").toISOString()})];
    expect(planNotifications({now:at("2026-10-13T01:00:00"),prefs,sent:{},drafts:[],missed})).toEqual([]);
    expect(keys(planNotifications({now:TUE_11,prefs:{...prefs,makeDay:false,quietDays:0},sent:{},drafts:[],missed}))).toEqual([`missed:d1:${missed[0].planned_publish_at}`]);
  });

  it("인스타그램 연결이 3일 안에 끊기거나 끊겼으면 알린다",()=>{
    const quiet={...prefs,makeDay:false,quietDays:0};
    expect(planNotifications({now:TUE_11,prefs:quiet,sent:{},drafts:[],connection:{expiresAt:"2026-10-20T00:00:00.000Z"}})).toEqual([]);
    const soon=planNotifications({now:TUE_11,prefs:quiet,sent:{},drafts:[],connection:{expiresAt:"2026-10-15T00:00:00.000Z"}});
    expect(soon[0]).toMatchObject({key:"expiring:2026-10-15T00:00:00.000Z",url:"/settings"});
    expect(soon[0].body).toContain("2일 뒤");
    expect(keys(planNotifications({now:TUE_11,prefs:quiet,sent:{},drafts:[],connection:{expiresAt:"2026-10-12T00:00:00.000Z"}}))).toEqual(["expired:2026-10-12T00:00:00.000Z"]);
  });
});

describe("missedCandidates·pruneSent",()=>{
  it("예약 시각이 6시간 넘게 지난 최근 3일 안의 예약만 후보로 고른다",()=>{
    const drafts=[
      draft({id:"late",final_review_complete:true,planned_publish_at:at("2026-10-13T01:00:00").toISOString()}),
      draft({id:"recent",final_review_complete:true,planned_publish_at:at("2026-10-13T08:00:00").toISOString()}),
      draft({id:"old",final_review_complete:true,planned_publish_at:at("2026-10-05T18:00:00").toISOString()}),
      draft({id:"off",final_review_complete:false,planned_publish_at:at("2026-10-13T01:00:00").toISOString()}),
      draft({id:"archived",archived:true,final_review_complete:true,planned_publish_at:at("2026-10-13T01:00:00").toISOString()}),
    ];
    expect(missedCandidates(drafts,TUE_11).map(item=>item.id)).toEqual(["late"]);
  });

  it("40일 넘은 보낸 기록은 지운다",()=>{
    expect(pruneSent({old:"2026-08-01T00:00:00.000Z",fresh:"2026-10-01T00:00:00.000Z"},TUE_11)).toEqual({fresh:"2026-10-01T00:00:00.000Z"});
  });
});

const subscription=(endpoint:string):StoredPushSubscription=>({endpoint,keys:{p256dh:"p",auth:"a"},createdAt:TUE_11.toISOString()});

describe("deliver",()=>{
  it("받은 기기가 하나라도 있으면 보낸 것으로 치고, 사라진 구독(410)은 골라낸다",async()=>{
    const send=vi.fn(async(target:StoredPushSubscription,_payload:string)=>{void _payload;if(target.endpoint.endsWith("gone"))throw Object.assign(new Error("gone"),{statusCode:410});});
    const result=await deliver([{key:"k",title:"t",body:"b",url:"/"}],[subscription("https://push.example/gone"),subscription("https://push.example/ok")],send,()=>{});
    expect([...result.delivered]).toEqual(["k"]);
    expect([...result.gone]).toEqual(["https://push.example/gone"]);
    expect(JSON.parse(send.mock.calls[1][1])).toEqual({title:"t",body:"b",url:"/",tag:"k"});
  });

  it("일시적인 오류로 못 보낸 알림은 보낸 것으로 치지 않는다(다음 점검에서 다시 보낸다)",async()=>{
    const result=await deliver([{key:"k",title:"t",body:"b",url:"/"}],[subscription("https://push.example/a")],async()=>{throw Object.assign(new Error("busy"),{statusCode:503});},()=>{});
    expect(result.delivered.size).toBe(0);
    expect(result.gone.size).toBe(0);
  });
});

describe("runNotificationCheck (로컬 저장소)",()=>{
  let dataDir="";
  beforeEach(async()=>{
    dataDir=await mkdtemp(path.join(os.tmpdir(),"notify-"));
    vi.stubEnv("DATA_DIR",dataDir);vi.stubEnv("SUPABASE_URL","");vi.stubEnv("SUPABASE_SECRET_KEY","");
    vi.stubEnv("VAPID_PUBLIC_KEY","");vi.stubEnv("VAPID_PRIVATE_KEY","");
    resetNotificationCaches();
  });
  afterEach(async()=>{vi.unstubAllEnvs();resetNotificationCaches();await rm(dataDir,{recursive:true,force:true});});

  it("구독한 기기가 없으면 아무것도 읽거나 보내지 않는다",async()=>{
    const send=vi.fn();
    expect(await runNotificationCheck({now:TUE_11,send})).toEqual({sent:[]});
    expect(send).not.toHaveBeenCalled();
  });

  it("올리는 날 알림을 한 번 보내고 기록해 두며, 사라진 구독은 지운다",async()=>{
    await updateNotificationState(state=>({...state,subscriptions:[subscription("https://push.example/ok"),subscription("https://push.example/gone")]}));
    const send=vi.fn(async(target:StoredPushSubscription)=>{if(target.endpoint.endsWith("gone"))throw Object.assign(new Error("gone"),{statusCode:410});});
    expect(await runNotificationCheck({now:TUE_11,send})).toEqual({sent:["make:2026-10-13"]});
    const state=await readNotificationState();
    expect(Object.keys(state.sent)).toEqual(["make:2026-10-13"]);
    expect(state.subscriptions.map(item=>item.endpoint)).toEqual(["https://push.example/ok"]);
    send.mockClear();
    expect(await runNotificationCheck({now:new Date(TUE_11.getTime()+5*60_000),send})).toEqual({sent:[]});
    expect(send).not.toHaveBeenCalled();
  });

  it("서명 키는 한 번 만들면 저장해 두고 계속 같은 키를 쓴다",async()=>{
    const first=await readVapidKeys();
    resetNotificationCaches();
    expect(await readVapidKeys()).toEqual(first);
  });

  it("시험 알림은 고른 기기에만 보낸다",async()=>{
    await updateNotificationState(state=>({...state,subscriptions:[subscription("https://push.example/a"),subscription("https://push.example/b")]}));
    const send=vi.fn(async(_target:StoredPushSubscription,_payload:string)=>{void _target;void _payload;});
    expect(await sendTestNotification("https://push.example/b",send)).toEqual({delivered:1,total:1});
    expect(send.mock.calls[0][0]).toMatchObject({endpoint:"https://push.example/b"});
  });
});
