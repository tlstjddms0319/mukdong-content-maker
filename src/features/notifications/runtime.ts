import webpush from "web-push";
import { createDraftRepository } from "@/features/drafts/repository";
import { kstToday } from "@/features/drafts/planLink";
import { createInstagramRepository } from "@/features/instagram/repository";
import type { SchedulerRun } from "@/features/instagram/scheduler";
import { readMonthPlan } from "@/features/topics/monthPlanRepository";
import { isDaytime, missedCandidates, planNotifications, pruneSent, type NotifyDraft } from "./planner";
import { readNotificationState, readVapidKeys, updateNotificationState } from "./repository";
import type { PushMessage, StoredPushSubscription } from "./schema";

// 알림을 골라(planner.ts) 등록된 휴대폰들로 보낸다. 서버 내부 타이머(5분마다)와 예약 게시 점검이 부른다.

export type PushSender=(subscription:StoredPushSubscription,payload:string)=>Promise<void>;

// 웹 푸시는 연락처(mailto: 또는 https 주소)를 함께 보내야 한다. 따로 정하지 않으면 배포 주소를 쓴다.
function vapidSubject(){
  const configured=process.env.VAPID_SUBJECT?.trim();
  if(configured)return configured;
  const base=process.env.AUTH_URL??process.env.MEDIA_PUBLIC_BASE_URL??"";
  return /^https:\/\//.test(base)?base:"mailto:owner@example.com";
}

export async function webPushSender():Promise<PushSender> {
  const keys=await readVapidKeys();
  const vapidDetails={subject:vapidSubject(),publicKey:keys.publicKey,privateKey:keys.privateKey};
  // TTL 12시간: 휴대폰이 꺼져 있어도 반나절 안에 켜지면 받는다. 그보다 늦은 알림은 의미가 없다.
  return async(subscription,payload)=>{await webpush.sendNotification({endpoint:subscription.endpoint,keys:subscription.keys},payload,{vapidDetails,TTL:12*3600});};
}

// 404·410: 휴대폰에서 알림을 끄거나 앱 데이터를 지워 더는 없는 구독. 목록에서 뺀다.
const isGone=(error:unknown)=>{const status=(error as {statusCode?:number})?.statusCode;return status===404||status===410;};

export async function deliver(messages:PushMessage[],subscriptions:StoredPushSubscription[],send:PushSender,log:(message:string)=>void=console.warn){
  const delivered=new Set<string>(),gone=new Set<string>();
  for(const message of messages){
    const payload=JSON.stringify({title:message.title,body:message.body,url:message.url,tag:message.key});
    for(const subscription of subscriptions){
      if(gone.has(subscription.endpoint))continue;
      try{await send(subscription,payload);delivered.add(message.key);}
      catch(error){
        if(isGone(error))gone.add(subscription.endpoint);
        else log(`[notifications] 알림 보내기 실패: ${(error as {statusCode?:number})?.statusCode??""} ${error instanceof Error?error.message:String(error)}`);
      }
    }
  }
  return {delivered,gone};
}

// 보낸 알림 기록과 사라진 구독을 저장한다. 하나도 못 보낸 알림은 기록하지 않아 다음 점검에서 다시 시도한다.
async function record(delivered:Set<string>,gone:Set<string>,now:Date){
  if(!delivered.size&&!gone.size)return;
  await updateNotificationState(state=>({
    ...state,
    subscriptions:state.subscriptions.filter(item=>!gone.has(item.endpoint)),
    sent:pruneSent({...state.sent,...Object.fromEntries([...delivered].map(key=>[key,now.toISOString()]))},now),
  }));
}

type CheckOptions={now?:Date;run?:Pick<SchedulerRun,"published"|"failed">|null;send?:PushSender;log?:(message:string)=>void};

// 한 번에 하나만 돈다(타이머와 예약 점검이 겹쳐 같은 알림을 두 번 보내지 않게).
let chain:Promise<unknown>=Promise.resolve();
export function runNotificationCheck(options:CheckOptions={}):Promise<{sent:string[]}> {
  const task=chain.then(()=>checkOnce(options));
  chain=task.catch(()=>undefined);
  return task;
}

async function checkOnce({now=new Date(),run=null,send,log=console.warn}:CheckOptions):Promise<{sent:string[]}> {
  const state=await readNotificationState();
  if(!state.subscriptions.length)return {sent:[]};
  const {prefs}=state;
  const daytime=isDaytime(now,prefs);
  const hasRunEvents=Boolean(run&&(run.published.length||run.failed.length));
  // 낮이 아니고 게시 결과도 없으면 보낼 것이 없다. 초안 목록·기획표를 읽지 않고 끝낸다.
  if(!daytime&&!hasRunEvents)return {sent:[]};

  const drafts=await createDraftRepository().listDraftSummaries();
  const today=kstToday(now.getTime());
  const planToday=daytime&&prefs.makeDay?await readMonthPlan(today.slice(0,7)).then(plan=>plan?.items.find(item=>item.date===today)??null).catch(()=>null):null;
  const instagram=createInstagramRepository();
  const connection=daytime&&prefs.connection?await instagram.readConnection().catch(()=>null):null;
  const missed:NotifyDraft[]=[];
  if(daytime&&prefs.publishResults){
    const candidates=missedCandidates(drafts,now).filter(draft=>!Object.keys(state.sent).some(key=>key.startsWith(`missed:${draft.id}:`)));
    for(const draft of candidates){
      const publication=await instagram.readPublication(draft.id).catch(()=>null);
      if(!(publication?.status==="published"||publication?.mediaId))missed.push(draft);
    }
  }

  const messages=planNotifications({now,prefs,sent:state.sent,drafts,planToday,connection,run,missed});
  if(!messages.length)return {sent:[]};
  const {delivered,gone}=await deliver(messages,state.subscriptions,send??await webPushSender(),log);
  await record(delivered,gone,now);
  return {sent:[...delivered]};
}

// 설정 화면의 "시험 알림 보내기". endpoint를 주면 그 기기에만 보낸다.
export async function sendTestNotification(endpoint?:string,send?:PushSender):Promise<{delivered:number;total:number}> {
  const state=await readNotificationState();
  const targets=endpoint?state.subscriptions.filter(item=>item.endpoint===endpoint):state.subscriptions;
  if(!targets.length)return {delivered:0,total:0};
  const sender=send??await webPushSender();
  let delivered=0;const gone=new Set<string>();
  const payload=JSON.stringify({title:"알림이 잘 와요",body:"이제 올리는 날과 게시 결과를 이 휴대폰으로 알려 드릴게요.",url:"/settings",tag:"test"});
  for(const subscription of targets){
    try{await sender(subscription,payload);delivered++;}
    catch(error){if(isGone(error))gone.add(subscription.endpoint);else console.warn("[notifications] 시험 알림 실패:",error instanceof Error?error.message:String(error));}
  }
  await record(new Set(),gone,new Date());
  return {delivered,total:targets.length};
}

let timer:ReturnType<typeof setInterval>|null=null;

// 서버 프로세스 안에서 5분마다 알림을 점검한다. 무료 서버가 잠든 동안에는 GitHub 예약 작업(1시간마다)이 깨우면서 함께 점검한다.
export function startNotificationLoop(intervalSeconds=Number(process.env.NOTIFICATION_INTERVAL_SECONDS)||300){
  if(timer)return timer;
  timer=setInterval(()=>{
    runNotificationCheck().catch(error=>console.warn("[notifications] 알림 점검 실패:",error instanceof Error?error.message:String(error)));
  },Math.max(30,intervalSeconds)*1000);
  timer.unref?.();
  return timer;
}

export function stopNotificationLoop(){if(timer){clearInterval(timer);timer=null;}}
