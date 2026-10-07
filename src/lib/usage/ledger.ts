import "server-only";
import path from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { remoteStore } from "@/lib/files/remoteStore";

// AI 사용량 장부. 설정 화면의 "AI 사용량" 카드가 읽는다.
// Gemini·OpenAI·Cloudflare는 "남은 무료 한도"를 알려 주는 API가 없어서, 앱이 직접 호출 수·실패·한도 초과(429 등)를 센다.
// Groq만 응답 머리글로 남은 요청 수를 알려 주므로 마지막 값을 함께 적는다.
// 장부는 달마다 한 파일(usage/YYYY-MM.json, Supabase가 있으면 거기, 없으면 DATA_DIR). 호출마다 쓰지 않고 잠깐 모았다가 쓴다.
// 기록 실패는 조용히 넘어간다(사용량 표시는 보조 기능이라 실제 생성을 막으면 안 된다).

export const USAGE_PROVIDERS=["gemini","groq","cloudflare","gemini-vision","higgsfield","cloudflare-image","openai-image"] as const;
export type UsageProvider=typeof USAGE_PROVIDERS[number];
export type UsageCounter={calls:number;failures:number;quota:number;units:number};
export type GroqLimits={remainingRequests?:number;limitRequests?:number;remainingTokens?:number;limitTokens?:number;at:string};
export type UsageMonth={
  month:string;
  days:Record<string,Partial<Record<UsageProvider,UsageCounter>>>;
  lastQuota:Partial<Record<UsageProvider,string>>;      // 마지막으로 한도 초과(429·크레딧 부족)를 받은 때
  lastError:Partial<Record<UsageProvider,{at:string;status:number}>>;
  groq?:GroqLimits;
};
export type UsageEvent={provider:UsageProvider;ok:boolean;status?:number;quota?:boolean;units?:number};

// 한국 시간 날짜(YYYY-MM-DD). 무료 한도가 대개 하루 단위라 날짜별로 센다.
export const kstDay=(now:Date)=>new Date(now.getTime()+9*3_600_000).toISOString().slice(0,10);
const emptyMonth=(month:string):UsageMonth=>({month,days:{},lastQuota:{},lastError:{}});

export type UsageStore={read(name:string):Promise<string|null>;write(name:string,value:string):Promise<void>};
export function usageStore(root=process.env.DATA_DIR??path.join(process.cwd(),"data")):UsageStore {
  const remote=remoteStore();
  if(remote)return {read:name=>remote.read(name).catch(()=>null),write:(name,value)=>remote.write(name,value,"application/json")};
  const file=(name:string)=>path.join(root,...name.split("/"));
  return {
    async read(name){try{return await readFile(file(name),"utf8");}catch{return null;}},
    async write(name,value){const target=file(name);await mkdir(path.dirname(target),{recursive:true});const temporary=`${target}.${process.pid}.tmp`;await writeFile(temporary,value);await rename(temporary,target);},
  };
}

// 한 사건을 달 장부에 더한다(순수 함수: 테스트하기 쉽게).
export function applyEvent(month:UsageMonth,event:UsageEvent,now:Date):UsageMonth {
  const day=kstDay(now),at=now.toISOString();
  const counters={...month.days[day]};
  const current=counters[event.provider]??{calls:0,failures:0,quota:0,units:0};
  const quota=event.quota??(event.status===429);
  counters[event.provider]={calls:current.calls+1,failures:current.failures+(event.ok?0:1),quota:current.quota+(quota?1:0),units:current.units+(event.ok?event.units??1:0)};
  return {
    ...month,
    days:{...month.days,[day]:counters},
    lastQuota:quota?{...month.lastQuota,[event.provider]:at}:month.lastQuota,
    lastError:!event.ok?{...month.lastError,[event.provider]:{at,status:event.status??0}}:month.lastError,
  };
}

const monthOf=(now:Date)=>kstDay(now).slice(0,7);
const fileOf=(month:string)=>`usage/${month}.json`;
function parseMonth(raw:string|null,month:string):UsageMonth {
  if(!raw)return emptyMonth(month);
  try{const value=JSON.parse(raw) as Partial<UsageMonth>;return {...emptyMonth(month),...value,month};}catch{return emptyMonth(month);}
}

// 모아 두었다가 쓰기: 짧은 시간에 여러 번 부르는 일(장마다 문안 검수 등)이 많아 1.5초 동안 모은다.
let pending:Array<{event:UsageEvent;at:Date}>=[];
let pendingGroq:GroqLimits|null=null;
let timer:ReturnType<typeof setTimeout>|null=null;
let queue:Promise<unknown>=Promise.resolve();
// 테스트(vitest) 중에는 실제 data 폴더·Supabase에 쓰지 않도록 기본 장부를 메모리에 둔다.
export function memoryUsageStore():UsageStore {
  const files=new Map<string,string>();
  return {async read(name){return files.get(name)??null;},async write(name,value){files.set(name,value);}};
}
const defaultFactory=():(()=>UsageStore)=>{if(process.env.VITEST){const memory=memoryUsageStore();return ()=>memory;}return ()=>usageStore();};
let storeFactory:()=>UsageStore=defaultFactory();
export function setUsageStoreForTests(factory:(()=>UsageStore)|null){storeFactory=factory??defaultFactory();pending=[];pendingGroq=null;if(timer){clearTimeout(timer);timer=null;}}

export function flushUsage():Promise<unknown> {
  if(timer){clearTimeout(timer);timer=null;}
  const events=pending,groq=pendingGroq;
  pending=[];pendingGroq=null;
  if(!events.length&&!groq)return queue;
  queue=queue.then(async()=>{
    const store=storeFactory();
    // 달이 바뀌는 순간에 걸친 사건도 각자 자기 달 장부에 넣는다.
    const months=new Map<string,typeof events>();
    for(const item of events){const key=monthOf(item.at);months.set(key,[...(months.get(key)??[]),item]);}
    if(groq&&!months.size)months.set(monthOf(new Date(groq.at)),[]);
    for(const [month,items] of months){
      let value=parseMonth(await store.read(fileOf(month)),month);
      for(const item of items)value=applyEvent(value,item.event,item.at);
      if(groq&&monthOf(new Date(groq.at))===month)value={...value,groq};
      await store.write(fileOf(month),JSON.stringify(value));
    }
  }).catch(error=>console.warn("[usage] 사용량을 적지 못했어요:",error instanceof Error?error.message:String(error)));
  return queue;
}

export function recordUsage(event:UsageEvent,now:Date=new Date()):void {
  try{
    pending.push({event,at:now});
    if(!timer)timer=setTimeout(()=>{void flushUsage();},1500);
  }catch{/* 기록 실패는 무시 */}
}

// Groq 응답 머리글(x-ratelimit-*)에서 남은 요청·토큰 수를 읽어 둔다.
export function recordGroqLimits(headers:{get(name:string):string|null}|null|undefined,now:Date=new Date()):void {
  if(!headers)return;
  const num=(name:string)=>{const value=Number(headers.get(name));return Number.isFinite(value)&&headers.get(name)!==null?value:undefined;};
  const limits:GroqLimits={remainingRequests:num("x-ratelimit-remaining-requests"),limitRequests:num("x-ratelimit-limit-requests"),remainingTokens:num("x-ratelimit-remaining-tokens"),limitTokens:num("x-ratelimit-limit-tokens"),at:now.toISOString()};
  if(limits.remainingRequests===undefined&&limits.remainingTokens===undefined)return;
  pendingGroq=limits;
  if(!timer)timer=setTimeout(()=>{void flushUsage();},1500);
}

// 설정 화면용 요약: 오늘·이번 달 합계, 마지막 한도 초과·오류, Groq 남은 양.
export type UsageSummary={
  month:string;today:string;
  providers:Array<{id:UsageProvider;today:UsageCounter;month:UsageCounter;lastQuota:string|null;lastError:{at:string;status:number}|null}>;
  groq:GroqLimits|null;
};
const zero=():UsageCounter=>({calls:0,failures:0,quota:0,units:0});
const add=(a:UsageCounter,b:UsageCounter|undefined):UsageCounter=>b?{calls:a.calls+b.calls,failures:a.failures+b.failures,quota:a.quota+b.quota,units:a.units+b.units}:a;
export function summarize(month:UsageMonth,now:Date=new Date()):UsageSummary {
  const today=kstDay(now);
  return {
    month:month.month,today,
    providers:USAGE_PROVIDERS.map(id=>({
      id,
      today:add(zero(),month.days[today]?.[id]),
      month:Object.values(month.days).reduce((sum,day)=>add(sum,day[id]),zero()),
      lastQuota:month.lastQuota[id]??null,
      lastError:month.lastError[id]??null,
    })),
    groq:month.groq??null,
  };
}
export async function readUsage(now:Date=new Date()):Promise<UsageSummary> {
  await flushUsage();
  const month=monthOf(now);
  return summarize(parseMonth(await storeFactory().read(fileOf(month)),month),now);
}
