import { mkdir,readFile,rename,writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import { remoteStore } from "@/lib/files/remoteStore";
import { NAVER_SEED,NaverPeriodSchema,type NaverPeriod } from "./naver";

// 채널별 일별 기록은 한 달에 한 파일(metrics/<channel>/YYYY-MM.json)로 둔다. 화면이 몇 달 치를 읽을 때 파일 수가 적다.
// Supabase가 설정돼 있으면 그쪽에 둔다(Render의 /tmp는 재시작 때 지워진다).
const n=z.number().min(0).optional();
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const InstagramDaySchema=z.object({date:day,followers:n,mediaCount:n,reach:n,views:n,accountsEngaged:n,totalInteractions:n,profileViews:n,websiteClicks:n,fetchedAt:z.string()});
export const Ga4DaySchema=z.object({date:day,activeUsers:n,sessions:n,pageViews:n,phoneClicks:n,directionsClicks:n,sources:z.array(z.object({sourceMedium:z.string(),sessions:z.number().min(0)})).default([]),fetchedAt:z.string()});
// 계정의 게시물 하나의 최신 숫자. 날마다 통째로 바꿔 저장한다(지운 게시물은 빠진다).
export const InstagramPostSchema=z.object({
  id:z.string(),caption:z.string().optional(),
  type:z.enum(["IMAGE","CAROUSEL_ALBUM","VIDEO"]),product:z.string().optional(),
  timestamp:z.string(),permalink:z.string(),thumbnail:z.string().optional(),
  likes:n,comments:n,saves:n,shares:n,reach:n,views:n,fetchedAt:z.string(),
});
export type InstagramPost=z.infer<typeof InstagramPostSchema>;
export type InstagramDay=z.infer<typeof InstagramDaySchema>;
export type Ga4Day=z.infer<typeof Ga4DaySchema>;
const ChannelStateSchema=z.object({lastRunOn:day.optional(),lastSuccessAt:z.string().optional(),lastError:z.string().nullable().optional(),filledThrough:day.optional()});
const StateSchema=z.object({instagram:ChannelStateSchema.optional(),ga4:ChannelStateSchema.optional()});
export type ChannelState=z.infer<typeof ChannelStateSchema>;
export type MetricsState=z.infer<typeof StateSchema>;
type Channel="instagram"|"ga4";
type DayOf<C extends Channel>=C extends "instagram"?InstagramDay:Ga4Day;
type DayInput<C extends Channel>=Partial<Omit<DayOf<C>,"date">>&{date:string};
const schemaOf={instagram:InstagramDaySchema,ga4:Ga4DaySchema};

export function createMetricsStore(root=process.env.DATA_DIR??path.join(process.cwd(),"data")){
  const remote=remoteStore();
  const local=(name:string)=>path.join(root,...name.split("/"));
  async function read(name:string){
    if(remote)return remote.read(name);
    try{return await readFile(local(name),"utf8");}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return null;throw error;}
  }
  async function write(name:string,value:unknown){
    const text=JSON.stringify(value);
    if(remote)return remote.write(name,text,"application/json");
    const target=local(name);await mkdir(path.dirname(target),{recursive:true});
    const temporary=`${target}.${randomUUID()}.tmp`;await writeFile(temporary,text,"utf8");await rename(temporary,target);
  }
  const monthName=(channel:Channel,month:string)=>`metrics/${channel}/${month}.json`;
  async function readMonth<C extends Channel>(channel:C,month:string):Promise<Record<string,DayOf<C>>>{
    const raw=await read(monthName(channel,month));
    if(!raw)return {};
    const parsed=JSON.parse(raw) as Record<string,unknown>;
    return Object.fromEntries(Object.entries(parsed).map(([date,value])=>[date,schemaOf[channel].parse(value)])) as Record<string,DayOf<C>>;
  }
  return {
    // 같은 날 기록에 새 값만 덮어쓴다. undefined 칸은 기존 값을 지우지 않는다.
    async saveDays<C extends Channel>(channel:C,days:DayInput<C>[]){
      const byMonth=new Map<string,DayInput<C>[]>();
      for(const d of days)byMonth.set(d.date.slice(0,7),[...(byMonth.get(d.date.slice(0,7))??[]),d]);
      const fetchedAt=new Date().toISOString();
      for(const [month,list] of byMonth){
        const current=await readMonth(channel,month);
        for(const d of list){
          const defined=Object.fromEntries(Object.entries(d).filter(([,v])=>v!==undefined));
          current[d.date]=schemaOf[channel].parse({...current[d.date],...defined,fetchedAt}) as DayOf<C>;
        }
        await write(monthName(channel,month),current);
      }
    },
    async listDays<C extends Channel>(channel:C,from:string,to:string):Promise<DayOf<C>[]>{
      const months:string[]=[];
      for(let m=from.slice(0,7);m<=to.slice(0,7);){months.push(m);const [y,mo]=m.split("-").map(Number);m=mo===12?`${y+1}-01`:`${y}-${String(mo+1).padStart(2,"0")}`;}
      const all=(await Promise.all(months.map(m=>readMonth(channel,m)))).flatMap(o=>Object.values(o));
      return all.filter(d=>d.date>=from&&d.date<=to).sort((a,b)=>a.date.localeCompare(b.date));
    },
    async readNaver():Promise<NaverPeriod[]>{
      const raw=await read("metrics/naver/periods.json");
      if(!raw)return NAVER_SEED;
      return z.array(NaverPeriodSchema).parse(JSON.parse(raw));
    },
    async saveNaver(list:NaverPeriod[]){
      const parsed=z.array(NaverPeriodSchema).parse(list).sort((a,b)=>a.start.localeCompare(b.start));
      await write("metrics/naver/periods.json",parsed);return parsed;
    },
    async readPosts():Promise<InstagramPost[]>{
      const raw=await read("metrics/instagram/posts.json");
      return raw?z.array(InstagramPostSchema).parse(JSON.parse(raw)):[];
    },
    async savePosts(list:InstagramPost[]){
      const parsed=z.array(InstagramPostSchema).parse(list).sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp));
      await write("metrics/instagram/posts.json",parsed);return parsed;
    },
    async readState():Promise<MetricsState>{const raw=await read("metrics/state.json");return raw?StateSchema.parse(JSON.parse(raw)):{};},
    async saveState(state:MetricsState){await write("metrics/state.json",StateSchema.parse(state));},
  };
}
export type MetricsStore=ReturnType<typeof createMetricsStore>;
