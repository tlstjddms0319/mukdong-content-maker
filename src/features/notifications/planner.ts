import { kstToday } from "@/features/drafts/planLink";
import { isTooLate } from "@/features/instagram/publicationState";
import type { SchedulerRun } from "@/features/instagram/scheduler";
import type { NotificationPrefs, PushMessage } from "./schema";

// 지금 보낼 휴대폰 알림을 고른다(순수 함수). 저장소·발송은 runtime.ts가 맡는다.
// 같은 알림은 key로 한 번만 보낸다. 날마다 오는 알림은 key에 한국 날짜를 넣는다.

const HOUR_MS=3_600_000,DAY_MS=24*HOUR_MS;
// 밤에는 날마다 오는 알림을 보내지 않는다(한국 시간 22시~). 아침에 설정한 시각이 지나면 그날 처음 깨어날 때 보낸다.
export const QUIET_FROM_HOUR=22;
// 장기 토큰은 만료 7일 전부터 자동 갱신한다. 3일 남았는데도 갱신이 안 됐으면 사장님이 다시 연결해야 한다.
export const CONNECTION_WARN_MS=3*DAY_MS;
// 예약 놓침은 최근 3일 안의 예약만 알린다(오래된 예약까지 한꺼번에 울리지 않게).
const MISSED_LOOKBACK_MS=3*DAY_MS;

export type NotifyDraft={id:string;topic:string;created_at:string;plan_date?:string;planned_publish_at?:string|null;final_review_complete?:boolean;archived?:boolean};

export type NotifyInput={
  now:Date;
  prefs:NotificationPrefs;
  sent:Record<string,string>;
  drafts:NotifyDraft[];
  // 이번 달 기획표에서 오늘 날짜의 주제(있으면).
  planToday?:{title:string}|null;
  connection?:{expiresAt:string}|null;
  // 방금 돈 예약 게시 점검 결과(게시됨·실패 알림).
  run?:Pick<SchedulerRun,"published"|"failed">|null;
  // 예약 놓침 후보 가운데 실제로 게시되지 않은 초안(runtime이 게시 기록을 확인해 넘긴다).
  missed?:NotifyDraft[];
};

const kstHour=(now:Date)=>new Date(now.getTime()+9*HOUR_MS).getUTCHours();
const kstWeekday=(now:Date)=>new Date(now.getTime()+9*HOUR_MS).getUTCDay();
const quote=(topic:string)=>`‘${topic.length>30?`${topic.slice(0,29)}…`:topic}’`;

// 예약 시각이 6시간 넘게 지나 자동 게시하지 않은 초안(최근 3일 안). 게시 기록 확인 전 후보.
export function missedCandidates(drafts:NotifyDraft[],now:Date):NotifyDraft[] {
  return drafts.filter(draft=>{
    if(!draft.final_review_complete||draft.archived||!draft.planned_publish_at)return false;
    const late=now.getTime()-Date.parse(draft.planned_publish_at);
    return isTooLate(draft.planned_publish_at,now.getTime())&&late<=MISSED_LOOKBACK_MS;
  });
}

// 날마다 오는 알림(올리는 날·쉰 날짜·연결)을 보낼 시간인지: 설정한 시각부터 밤 10시 전까지.
export const isDaytime=(now:Date,prefs:NotificationPrefs)=>{const hour=kstHour(now);return hour>=prefs.hour&&hour<QUIET_FROM_HOUR;};

export function planNotifications(input:NotifyInput):PushMessage[] {
  const {now,prefs,sent,drafts}=input;
  const today=kstToday(now.getTime());
  const topics=new Map(drafts.map(draft=>[draft.id,draft.topic]));
  const messages:PushMessage[]=[];
  const add=(message:PushMessage)=>{if(!sent[message.key]&&!messages.some(item=>item.key===message.key))messages.push(message);};

  if(prefs.publishResults){
    for(const item of input.run?.published??[]){
      if(item.alreadyPublished)continue;
      const topic=topics.get(item.draftId);
      add({key:`published:${item.draftId}`,title:"인스타그램에 올라갔어요",body:topic?`${quote(topic)} 예약 글이 올라갔어요.`:"예약한 글이 올라갔어요.",url:"/drafts"});
    }
    for(const item of input.run?.failed??[]){
      const topic=topics.get(item.draftId);
      add({key:`failed:${item.draftId}:${today}`,title:"인스타그램 올리기 실패",body:`${topic?`${quote(topic)} `:""}예약 글을 올리지 못했어요. 30분 뒤 다시 시도해요. 계속 안 되면 내 게시물에서 확인해 주세요.`,url:"/drafts"});
    }
  }

  if(!isDaytime(now,prefs))return messages;

  // 예약 놓침은 예약 시각 6시간 뒤(18시 예약이면 자정)에 생기므로 밤에 울리지 않게 낮에 알린다.
  if(prefs.publishResults)for(const draft of input.missed??[])
    add({key:`missed:${draft.id}:${draft.planned_publish_at}`,title:"예약 글이 안 올라갔어요",body:`${quote(draft.topic)} 예약 시각이 지나 올리지 못했어요. 내 게시물에서 새 날짜를 정해 주세요.`,url:"/drafts"});

  if(prefs.connection&&input.connection){
    const left=Date.parse(input.connection.expiresAt)-now.getTime();
    if(left<=0)add({key:`expired:${input.connection.expiresAt}`,title:"인스타그램 연결이 끊겼어요",body:"예약 글이 올라가지 않아요. 설정에서 ‘다시 연결’을 눌러 주세요.",url:"/settings"});
    else if(left<=CONNECTION_WARN_MS)add({key:`expiring:${input.connection.expiresAt}`,title:"인스타그램 연결이 곧 끊겨요",body:`${Math.max(1,Math.ceil(left/DAY_MS))}일 뒤 연결이 끊겨요. 설정에서 ‘다시 연결’을 눌러 주세요.`,url:"/settings"});
  }

  let madeDay=false;
  if(prefs.makeDay&&(prefs.weekdays.includes(kstWeekday(now))||input.planToday)){
    // 오늘 올릴 글을 이미 만들었거나 예약해 뒀으면 알리지 않는다.
    const started=drafts.some(draft=>!draft.archived&&(draft.plan_date===today||kstToday(Date.parse(draft.created_at))===today||(draft.final_review_complete&&draft.planned_publish_at&&kstToday(Date.parse(draft.planned_publish_at))===today)));
    if(!started){
      const plan=input.planToday;
      add({key:`make:${today}`,title:"오늘은 인스타그램 올리는 날이에요",body:plan?`오늘 주제는 ${quote(plan.title)}예요. 눌러서 바로 만들어 보세요.`:"주제만 고르면 금방 만들어져요. 눌러서 시작해 보세요.",url:plan?"/plan":"/"});
      madeDay=true;
    }
  }

  if(prefs.quietDays>0&&!madeDay){
    const last=drafts.reduce((max,draft)=>Math.max(max,Date.parse(draft.created_at)||0),0);
    if(last>0){
      const lastDay=kstToday(last);
      const days=Math.round((Date.parse(today)-Date.parse(lastDay))/DAY_MS);
      // quietDays마다 한 번(5일·10일·15일째…). 새 글을 만들면 lastDay가 바뀌어 처음부터 센다.
      if(days>=prefs.quietDays)add({key:`quiet:${lastDay}:${Math.floor(days/prefs.quietDays)}`,title:`${days}일째 새 글이 없어요`,body:"꾸준히 올려야 손님이 기억해요. 오늘 하나 만들어 볼까요?",url:"/"});
    }
  }
  return messages;
}

// 보낸 기록 가운데 40일 넘은 것은 지운다(파일이 끝없이 커지지 않게).
export function pruneSent(sent:Record<string,string>,now:Date):Record<string,string> {
  const limit=now.getTime()-40*DAY_MS;
  return Object.fromEntries(Object.entries(sent).filter(([,at])=>Date.parse(at)>=limit));
}
