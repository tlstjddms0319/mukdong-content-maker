import type { InstagramConnection,Publication } from "@/features/instagram/schema";
import type { Draft } from "@/features/drafts/schema";
import type { Performance } from "@/features/drafts/performance";
import { addDays,dateRange,diffDays,kstDateOf,kstStartSeconds } from "./dates";
import type { InstagramDay,MetricsStore } from "./store";

export const INSIGHTS_SCOPE="instagram_business_manage_insights";
// impressions는 없어진 지표라 묻지 않는다. profile_views는 문서마다 지원 여부가 달라, 실패하면 그 칸만 비운다.
const ACCOUNT_METRICS={reach:"reach",views:"views",accounts_engaged:"accountsEngaged",total_interactions:"totalInteractions",profile_views:"profileViews",website_clicks:"websiteClicks"} as const;
const MEDIA_METRICS={likes:"likes",comments:"comments",saved:"saves",shares:"shares",reach:"reach",views:"views"} as const;
type MediaValues=Partial<Record<(typeof MEDIA_METRICS)[keyof typeof MEDIA_METRICS],number>>;
const BACKFILL_DAYS=30;

// 권한을 끄고 연결했거나 권한이 사라지면 Meta는 400·403을 준다. 그때는 다시 연결이 답이므로 함께 안내한다.
class InsightsHttpError extends Error{constructor(readonly status:number){super(`Instagram 인사이트 요청 실패(HTTP ${status})${status===400||status===403?". 권한이 없으면 설정에서 인스타그램을 다시 연결해 주세요.":""}`);}}

export function createInsightsClient(fetcher:typeof fetch=fetch,version=process.env.INSTAGRAM_API_VERSION??"v24.0"){
  async function get(pathname:string,params:Record<string,string>){
    const url=new URL(`https://graph.instagram.com/${version}/${pathname}`);url.search=new URLSearchParams(params).toString();
    const response=await fetcher(url.toString(),{cache:"no-store"});
    if(!response.ok)throw new InsightsHttpError(response.status);
    return response.json() as Promise<Record<string,unknown>>;
  }
  const valueOf=(item:{total_value?:{value?:unknown};values?:{value?:unknown}[]})=>{const v=item.total_value?.value??item.values?.at(-1)?.value;return typeof v==="number"?v:undefined;};
  // 한 번에 묻고, 400이면(지원 안 되는 지표가 섞임) 지표마다 따로 물어 되는 것만 남긴다.
  async function insights<M extends Record<string,string>>(pathname:string,metrics:M,extra:Record<string,string>,token:string){
    const read=(body:Record<string,unknown>)=>{
      const out:Partial<Record<M[keyof M],number>>={};
      for(const item of (Array.isArray(body.data)?body.data:[]) as {name?:string}[]){
        const key=metrics[item.name as keyof M];const value=valueOf(item as never);
        if(key&&value!==undefined)out[key as M[keyof M]]=value;
      }
      return out;
    };
    try{return read(await get(pathname,{...extra,metric:Object.keys(metrics).join(","),access_token:token}));}
    catch(error){
      if(!(error instanceof InsightsHttpError)||error.status!==400)throw error;
      const parts=await Promise.all(Object.keys(metrics).map(metric=>get(pathname,{...extra,metric,access_token:token}).then(read).catch(()=>null)));
      // 하나도 안 되면(권한 없음·지운 게시물) 빈 기록을 성공처럼 남기지 않고 처음 오류를 그대로 알린다.
      if(parts.every(part=>part===null))throw error;
      return Object.assign({},...parts.filter(Boolean)) as Partial<Record<M[keyof M],number>>;
    }
  }
  return {
    async accountSnapshot(userId:string,token:string){
      const body=await get(userId,{fields:"followers_count,media_count",access_token:token});
      return {followers:typeof body.followers_count==="number"?body.followers_count:undefined,mediaCount:typeof body.media_count==="number"?body.media_count:undefined};
    },
    dayInsights(userId:string,token:string,date:string){
      return insights(`${userId}/insights`,ACCOUNT_METRICS,{period:"day",metric_type:"total_value",since:String(kstStartSeconds(date)),until:String(kstStartSeconds(addDays(date,1)))},token) as Promise<Partial<InstagramDay>>;
    },
    mediaInsights(mediaId:string,token:string){return insights(`${mediaId}/insights`,MEDIA_METRICS,{},token) as Promise<MediaValues>;},
  };
}
export type InsightsClient=ReturnType<typeof createInsightsClient>;

type DraftAccess={listDraftSummaries:()=>Promise<{id:string}[]>;readDraft:(id:string)=>Promise<Draft|null>;saveDraft:(value:Draft,options?:{thumbnail?:boolean})=>Promise<unknown>};
export type CollectInstagramDeps={
  connection:InstagramConnection|null;store:Pick<MetricsStore,"saveDays">;client:InsightsClient;
  drafts:DraftAccess;readPublication:(draftId:string)=>Promise<Publication|null>;
  today:string;filledThrough:string|undefined;now?:()=>Date;
  withLock?:<T>(id:string,work:()=>Promise<T>)=>Promise<T>;
};

export async function collectInstagram(deps:CollectInstagramDeps){
  const {connection,today}=deps;
  if(!connection)return {skipped:"not-connected" as const,daysFilled:0,mediaUpdated:0};
  if(!connection.scopes.includes(INSIGHTS_SCOPE))return {skipped:"needs-reconnect" as const,daysFilled:0,mediaUpdated:0};
  if(Date.parse(connection.expiresAt)<=(deps.now??(()=>new Date()))().getTime())return {skipped:"expired" as const,daysFilled:0,mediaUpdated:0};
  const {instagramUserId:id,accessToken:token}=connection;
  // 팔로워 수는 그 시점의 값이라 지난 날로 채울 수 없다. 오늘 기록에 남긴다.
  await deps.store.saveDays("instagram",[{date:today,...await deps.client.accountSnapshot(id,token)}]);
  // 마지막 이틀은 숫자가 늦게 확정되므로 다시 가져온다. Meta는 최근 30일만 준다.
  const earliest=addDays(today,-BACKFILL_DAYS),yesterday=addDays(today,-1);
  const from=deps.filledThrough?[addDays(deps.filledThrough,-1),earliest].sort().at(-1)!:earliest;
  const days=from<=yesterday?dateRange(from,yesterday):[];
  for(const date of days)await deps.store.saveDays("instagram",[{date,...await deps.client.dayInsights(id,token,date)}]);
  const mediaUpdated=await collectMedia(deps,token);
  return {daysFilled:days.length,mediaUpdated,filledThrough:days.length?yesterday:deps.filledThrough};
}

// 앱으로 올린 게시물: 올린 뒤 7일은 날마다, 90일까지는 7일마다. 직접 적은 성과는 그대로 둔다.
async function collectMedia(deps:CollectInstagramDeps,token:string){
  let updated=0;
  const lock=deps.withLock??(async(_id,work)=>work());
  for(const {id} of await deps.drafts.listDraftSummaries()){
    const publication=await deps.readPublication(id).catch(()=>null);
    if(publication?.status!=="published"||!publication.mediaId||!publication.publishedAt)continue;
    const postedOn=kstDateOf(publication.publishedAt),age=diffDays(postedOn,deps.today);
    if(age<0||age>90||(age>7&&age%7!==0))continue;
    // 한 게시물이 실패해도(지운 게시물 등) 다른 게시물은 계속한다. 값이 비면 저장된 숫자를 0으로 덮지 않는다.
    const values=await deps.client.mediaInsights(publication.mediaId,token).catch(()=>({} as MediaValues));
    if(!Object.keys(values).length)continue;
    const saved=await lock(id,async()=>{
      const draft=await deps.drafts.readDraft(id);
      if(!draft||(draft.performance&&draft.performance.source!=="instagram"))return false;
      const performance:Performance={likes:values.likes??0,comments:values.comments??0,saves:values.saves??0,shares:values.shares??0,...(values.reach!==undefined?{reach:values.reach}:{}),posted_on:postedOn,recorded_at:new Date().toISOString(),source:"instagram"};
      await deps.drafts.saveDraft({...draft,performance},{thumbnail:false});
      return true;
    });
    if(saved)updated++;
  }
  return updated;
}
