import { createDraftRepository,withDraftLock } from "@/features/drafts/repository";
import { createInstagramRepository } from "@/features/instagram/repository";
import { kstToday } from "./dates";
import { collectGa4,getGa4Config } from "./ga4";
import { collectInstagram,createInsightsClient } from "./instagramInsights";
import { createMetricsStore,type ChannelState,type MetricsState } from "./store";

// 스케줄러가 1분마다 부르지만 실제 수집은 채널마다 하루 한 번이다. 한 채널이 실패해도 다른 채널과 게시는 계속한다.
export type MetricsRun={instagram:"ran"|"skipped"|"failed"|"not-due";ga4:"ran"|"failed"|"not-configured"|"not-due";messages:string[]};
const SKIP_MESSAGES={"not-connected":"인스타그램이 연결되지 않았어요.","needs-reconnect":"설정에서 인스타그램을 다시 연결하면 성과를 자동으로 가져와요.","expired":"인스타그램 연결이 만료됐어요. 설정에서 다시 연결해 주세요."} as const;
type Skip=keyof typeof SKIP_MESSAGES;

export async function runDailyMetrics(deps:{
  store:{readState:()=>Promise<MetricsState>;saveState:(s:MetricsState)=>Promise<void>};
  today:string;force?:boolean;now?:()=>Date;
  instagram:(filledThrough:string|undefined)=>Promise<{skipped?:Skip;filledThrough?:string}>;
  ga4:((filledThrough:string|undefined)=>Promise<{filledThrough?:string}>)|null;
}):Promise<MetricsRun>{
  const state=await deps.store.readState();
  const stamp=(deps.now??(()=>new Date()))().toISOString();
  const due=(s?:ChannelState)=>deps.force||s?.lastRunOn!==deps.today;
  const run:MetricsRun={instagram:"not-due",ga4:deps.ga4?"not-due":"not-configured",messages:[]};
  const next:MetricsState={...state};
  if(due(state.instagram)){
    try{
      const result=await deps.instagram(state.instagram?.filledThrough);
      if(result.skipped){run.instagram="skipped";next.instagram={...state.instagram,lastRunOn:deps.today,lastError:SKIP_MESSAGES[result.skipped]};}
      else{run.instagram="ran";next.instagram={...state.instagram,lastRunOn:deps.today,lastSuccessAt:stamp,lastError:null,filledThrough:result.filledThrough??state.instagram?.filledThrough};}
    }catch(error){run.instagram="failed";next.instagram={...state.instagram,lastRunOn:deps.today,lastError:error instanceof Error?error.message:String(error)};}
  }
  if(deps.ga4&&due(state.ga4)){
    try{
      const result=await deps.ga4(state.ga4?.filledThrough);
      run.ga4="ran";next.ga4={...state.ga4,lastRunOn:deps.today,lastSuccessAt:stamp,lastError:null,filledThrough:result.filledThrough??state.ga4?.filledThrough};
    }catch(error){run.ga4="failed";next.ga4={...state.ga4,lastRunOn:deps.today,lastError:error instanceof Error?error.message:String(error)};}
  }
  if(run.instagram!=="not-due"||(run.ga4!=="not-due"&&run.ga4!=="not-configured"))await deps.store.saveState(next);
  for(const [channel,value] of Object.entries(next))if(value?.lastError)run.messages.push(`${channel}: ${value.lastError}`);
  return run;
}

let checkedOn="";
// 실제 저장소·Meta·GA4를 묶는다. 오늘 이미 확인했으면 저장소도 읽지 않는다(1분마다 불리므로).
export async function runDailyMetricsIfDue(force=false){
  const today=kstToday();
  if(!force&&checkedOn===today)return null;
  const store=createMetricsStore(),instagram=createInstagramRepository(),drafts=createDraftRepository();
  const config=getGa4Config();
  const run=await runDailyMetrics({store,today,force,
    instagram:async filledThrough=>collectInstagram({connection:await instagram.readConnection(),store,client:createInsightsClient(),drafts,readPublication:instagram.readPublication,today,filledThrough,withLock:withDraftLock}),
    ga4:config?filledThrough=>collectGa4({config,store,today,filledThrough}):null,
  });
  checkedOn=today;
  return run;
}
