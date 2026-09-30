import { createDraftRepository } from "@/features/drafts/repository";
import { createInstagramRepository } from "./repository";
import { instagramPublishingClient, refreshInstagramToken } from "./metaClient";
import { runPublishScheduler, type SchedulerRun } from "./scheduler";

// 실제 저장소·Meta 클라이언트·환경변수를 묶어 스케줄러를 한 번 돌린다. 라우트와 서버 내부 타이머가 함께 쓴다.
export class SchedulerConfigurationError extends Error {}

export async function runScheduledPublishing(log:(message:string)=>void=console.info):Promise<SchedulerRun> {
  const baseUrl=process.env.MEDIA_PUBLIC_BASE_URL,signingSecret=process.env.MEDIA_SIGNING_SECRET;
  if(!baseUrl||!signingSecret)throw new SchedulerConfigurationError("게시 서버 설정이 필요합니다: MEDIA_PUBLIC_BASE_URL, MEDIA_SIGNING_SECRET");
  const drafts=createDraftRepository(),repo=createInstagramRepository();
  return runPublishScheduler({
    listDrafts:drafts.listDrafts,readDraft:drafts.readDraft,
    readConnection:repo.readConnection,saveConnection:repo.saveConnection,repo,
    meta:instagramPublishingClient,refreshToken:refreshInstagramToken,
    baseUrl,signingSecret,log,
  });
}

export const isAutoPublishEnabled=()=>process.env.INSTAGRAM_AUTOPUBLISH!=="off";

let timer:ReturnType<typeof setInterval>|null=null;
let running=false;

// 서버 프로세스 안에서 주기적으로 스케줄러를 돌린다. 한 번에 하나만 돌고, 프로세스 종료를 막지 않는다.
export function startPublishSchedulerLoop(intervalSeconds=Number(process.env.INSTAGRAM_SCHEDULER_INTERVAL_SECONDS)||60){
  if(timer)return timer;
  const tick=async()=>{
    if(running)return;
    running=true;
    try{
      const run=await runScheduledPublishing();
      if(run.due.length)console.info(`[instagram] 예약 게시 점검: 대상 ${run.due.length}, 게시 ${run.published.length}, 건너뜀 ${run.skipped.length}, 실패 ${run.failed.length}`);
    }catch(error){
      if(!(error instanceof SchedulerConfigurationError))console.warn("[instagram] 예약 게시 점검 실패:",error instanceof Error?error.message:String(error));
    }finally{running=false;}
  };
  timer=setInterval(()=>{void tick();},Math.max(15,intervalSeconds)*1000);
  timer.unref?.();
  return timer;
}

export function stopPublishSchedulerLoop(){if(timer){clearInterval(timer);timer=null;}}
