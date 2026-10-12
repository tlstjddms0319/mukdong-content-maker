import { createDraftRepository, withDraftLock } from "@/features/drafts/repository";
import { createInstagramRepository } from "./repository";
import { instagramInsightsClient } from "./metaClient";
import { INSIGHTS_REFRESH_MS, syncInstagramInsights, type InsightsRun } from "./insights";

// 실제 저장소·Meta 클라이언트로 반응 가져오기를 한 번 돌린다. 예약 게시 점검(외부 크론이 1시간마다 부름)에 붙어
// 6시간에 한 번만 돈다(Meta 호출을 아끼고, 숫자도 그보다 자주 바뀌지 않는다).
const store=globalThis as typeof globalThis&{__insightsSync?:{at:number;running?:Promise<InsightsRun|null>}};

export async function runInsightsSync(now=new Date()):Promise<InsightsRun|null> {
  const connection=await createInstagramRepository().readConnection();
  if(!connection)return null;
  const drafts=createDraftRepository();
  return syncInstagramInsights({
    connection,now,client:instagramInsightsClient,
    listDrafts:drafts.listDraftSummaries,
    readPublication:createInstagramRepository().readPublication,
    // 저장하는 사이 사장님이 직접 적었으면 그 숫자를 지킨다(잠금 안에서 다시 읽고 확인).
    savePerformance:(id,performance)=>withDraftLock(id,async()=>{
      const draft=await drafts.readDraft(id);
      if(!draft||(draft.performance&&draft.performance.source!=="instagram"))return;
      await drafts.saveDraft({...draft,performance},{thumbnail:false});
    }),
  });
}

export async function runInsightsSyncIfDue(now=new Date()):Promise<InsightsRun|null> {
  if(process.env.VITEST)return null;
  const state=store.__insightsSync??={at:0};
  if(state.running)return state.running.catch(()=>null);
  if(now.getTime()-state.at<INSIGHTS_REFRESH_MS)return null;
  state.at=now.getTime();
  state.running=runInsightsSync(now).catch(error=>{console.warn("[insights] 반응을 가져오지 못했어요:",error instanceof Error?error.message:String(error));return null;});
  try{
    const run=await state.running;
    if(run?.updated.length)console.info(`[insights] 게시물 ${run.updated.length}개의 반응을 가져왔어요.`);
    return run;
  }finally{state.running=undefined;}
}
