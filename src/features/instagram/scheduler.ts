import type { Draft } from "@/features/drafts/schema";
import type { DraftSummary } from "@/features/drafts/summary";
import type { InstagramConnection, Publication } from "./schema";
import { InstagramPublishError, publishApprovedDraft } from "./publish";
import { MAX_PUBLISH_LATENESS_MS, NEEDS_CHECK_MESSAGE, isStalePreparing } from "./publicationState";

// 게시 예정 시각(planned_publish_at)이 지났고 최종 확인이 끝난 초안을 찾아 자동으로 게시한다.
// 사람 대신 누르는 것뿐이므로 게시 로직 자체는 버튼 게시와 같은 publishApprovedDraft를 쓴다.

const DAY_MS=24*60*60*1000;
export const TOKEN_REFRESH_WINDOW_MS=7*DAY_MS;   // 만료 7일 전부터 갱신을 시도한다.
export const TOKEN_REFRESH_MIN_AGE_MS=DAY_MS;    // Meta는 발급 24시간이 지난 토큰만 갱신해 준다.
export const FAILED_RETRY_COOLDOWN_MS=30*60*1000; // 실패한 초안은 30분 뒤에 다시 시도한다.

type PublishDeps=Parameters<typeof publishApprovedDraft>[1];

export type SchedulerDeps=Omit<PublishDeps,"readDraft">&{
  // 목록은 가벼운 요약(이미지 없음)만 읽는다. 게시할 초안의 전체 내용은 게시 단계에서 readDraft로 읽는다.
  listDrafts:()=>Promise<ScheduleView[]>;
  readDraft:PublishDeps["readDraft"];
  saveConnection:(value:InstagramConnection)=>Promise<InstagramConnection>;
  refreshToken:(accessToken:string)=>Promise<{accessToken:string;expiresIn:number}>;
  log?:(message:string)=>void;
  // false면 토큰 갱신만 하고 게시는 하지 않는다(INSTAGRAM_AUTOPUBLISH=off여도 연결이 60일 뒤 끊기지 않게).
  autoPublish?:boolean;
};

export type SchedulerRun={
  checkedAt:string;
  reason?:"not-connected"|"reconnect"|"autopublish-off";
  tokenRefreshed:boolean;
  due:string[];
  published:{draftId:string;mediaId:string|null;alreadyPublished:boolean}[];
  // changed: 목록(요약)에서는 예약 대상이었는데, 저장된 게시물을 다시 읽어 보니 예약이 꺼졌거나 보관함에 들어갔거나 시각이 바뀜.
  skipped:{draftId:string;reason:"published"|"cooldown"|"in-progress"|"needs-check"|"changed"}[];
  failed:{draftId:string;message:string}[];
};

// 예약 시각이 지났고, 너무 오래(6시간 넘게) 지나지는 않은 초안만. 오래 지난 것은 "예약 놓침"으로 화면에 보여 주고 게시하지 않는다.
// 예약 점검에 필요한 칸만. 초안 요약(DraftSummary)과 전체 초안(Draft) 둘 다 이 모양을 만족한다.
export type ScheduleView=Pick<Draft,"id"|"final_review_complete"|"planned_publish_at"|"selected_media_id"|"caption"|"archived">&Partial<Pick<DraftSummary,"hasCaption">>;
export function isDueForPublishing(draft:ScheduleView,now:Date):boolean {
  // 보관함에 넣은 게시물은 예약이 남아 있어도 올리지 않는다(보관 = 지금은 안 올림).
  if(draft.final_review_complete!==true||typeof draft.planned_publish_at!=="string"||draft.archived===true)return false;
  const late=now.getTime()-Date.parse(draft.planned_publish_at);
  return late>=0&&late<=MAX_PUBLISH_LATENESS_MS
    &&Boolean(draft.selected_media_id)
    &&Boolean(draft.caption?.trim());
}

// 만료가 가까운 장기 토큰을 갱신한다. 실패해도 기존 토큰이 살아 있으면 그대로 진행한다.
export async function refreshConnectionIfNeeded(connection:InstagramConnection,deps:Pick<SchedulerDeps,"saveConnection"|"refreshToken"|"log">,now:Date):Promise<{connection:InstagramConnection;refreshed:boolean}> {
  const expiresIn=Date.parse(connection.expiresAt)-now.getTime();
  const age=now.getTime()-Date.parse(connection.updatedAt);
  if(expiresIn>TOKEN_REFRESH_WINDOW_MS||age<TOKEN_REFRESH_MIN_AGE_MS||expiresIn<=0)return {connection,refreshed:false};
  try{
    const token=await deps.refreshToken(connection.accessToken);
    const saved=await deps.saveConnection({...connection,accessToken:token.accessToken,expiresAt:new Date(now.getTime()+token.expiresIn*1000).toISOString(),updatedAt:now.toISOString()});
    return {connection:saved,refreshed:true};
  }catch(error){
    deps.log?.(`[instagram] 토큰 갱신 실패: ${error instanceof Error?error.message:String(error)}`);
    return {connection,refreshed:false};
  }
}

function skipReason(previous:Publication|null,now:Date):SchedulerRun["skipped"][number]["reason"]|null {
  if(!previous)return null;
  if(previous.status==="published")return "published";
  if(previous.status==="preparing"&&!previous.mediaId){
    // 사장님 확인을 기다리는 기록은 매분 Meta에 다시 묻지 않는다. 오래 멈춘 기록은 게시 단계에서 정리하도록 넘긴다.
    if(previous.safeError===NEEDS_CHECK_MESSAGE)return "needs-check";
    if(!isStalePreparing(previous,now.getTime()))return "in-progress";
  }
  if(previous.status==="failed"&&now.getTime()-Date.parse(previous.attemptedAt)<FAILED_RETRY_COOLDOWN_MS)return "cooldown";
  return null;
}

export async function runPublishScheduler(deps:SchedulerDeps):Promise<SchedulerRun> {
  const now=(deps.now??(()=>new Date()))();
  const run:SchedulerRun={checkedAt:now.toISOString(),tokenRefreshed:false,due:[],published:[],skipped:[],failed:[]};
  const stored=await deps.readConnection();
  if(!stored)return {...run,reason:"not-connected"};
  const {connection,refreshed}=await refreshConnectionIfNeeded(stored,deps,now);
  run.tokenRefreshed=refreshed;
  if(Date.parse(connection.expiresAt)<=now.getTime())return {...run,reason:"reconnect"};
  if(deps.autoPublish===false)return {...run,reason:"autopublish-off"};

  const due=(await deps.listDrafts()).filter(draft=>isDueForPublishing(draft,now)).sort((a,b)=>a.planned_publish_at!.localeCompare(b.planned_publish_at!));
  run.due=due.map(draft=>draft.id);
  // 갱신된 토큰을 쓰도록 연결 읽기를 고정한다.
  const publishDeps:PublishDeps={...deps,readConnection:async()=>connection,now:()=>now};
  for(const draft of due){
    const reason=skipReason(await deps.repo.readPublication(draft.id),now);
    if(reason){run.skipped.push({draftId:draft.id,reason});continue;}
    // 목록 요약은 잠깐 옛 상태일 수 있다(다시 읽는 중 취소·보관·글 수정). 올리기 직전에 저장된 게시물을 다시 읽어
    // 예약이 아직 켜져 있고 시각·보관 상태가 맞는지 확인하고, 그 게시물의 지금 글로 올린다.
    const current=await deps.readDraft(draft.id).catch(()=>null);
    if(!current||!isDueForPublishing(current,now)){run.skipped.push({draftId:draft.id,reason:"changed"});continue;}
    try{
      const result=await publishApprovedDraft({draftId:draft.id,approved:true,caption:current.caption},publishDeps);
      run.published.push({draftId:draft.id,mediaId:result.mediaId,alreadyPublished:result.alreadyPublished});
      deps.log?.(`[instagram] 자동 게시 완료: ${draft.id} → ${result.mediaId??"(id 없음)"}`);
    }catch(error){
      const message=error instanceof Error?error.message:String(error);
      run.failed.push({draftId:draft.id,message});
      deps.log?.(`[instagram] 자동 게시 실패: ${draft.id} · ${message}`);
      // 토큰이 죽었으면 나머지도 전부 실패하므로 여기서 멈춘다.
      if(error instanceof InstagramPublishError&&error.kind==="reconnect"){run.reason="reconnect";break;}
    }
  }
  return run;
}
