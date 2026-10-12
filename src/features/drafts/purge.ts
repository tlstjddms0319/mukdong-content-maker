import { createDraftRepository } from "./repository";
import { isDraftExpired } from "./retention";
import { createInstagramRepository } from "@/features/instagram/repository";
import { appendTopicHistory } from "@/features/topics/topicHistory";

// 만든 지 30일이 지난 게시물(보관함 제외)을 지운다(retention.ts). 내 게시물·한 달 계획을 열거나 주제를 추천받을 때 부르고,
// 한 서버에서 6시간에 한 번만 실제로 돈다(목록을 매번 훑지 않게). 실패해도 화면은 그대로 열린다.
// 인스타그램에 올리는 중(준비 중이고 올린 번호가 아직 없음)인 게시물만 이번에 건너뛴다: 손으로 지울 때와 같은 기준으로,
// 올리는 도중 지우면 올린 기록과 어긋난다. 다음 정리 때 지운다. (인스타그램에 묻지 않고 이 서버에 저장된 기록만 읽는다.)
const PURGE_EVERY_MS=6*60*60*1000;
const store=globalThis as typeof globalThis&{__draftPurge?:{at:number;running?:Promise<number>}};

export async function purgeExpiredDrafts(now=Date.now(),deps={drafts:createDraftRepository(),instagram:createInstagramRepository(),history:appendTopicHistory}):Promise<number> {
  const expired=(await deps.drafts.listDraftSummaries()).filter(draft=>isDraftExpired(draft,now));
  let removed=0;
  const gone:string[]=[];
  for(const draft of expired){
    const publication=await deps.instagram.readPublication(draft.id).catch(()=>null);
    if(publication?.status==="preparing"&&!publication.mediaId)continue;
    if(await deps.drafts.deleteDraft(draft.id).catch(()=>false)){removed++;gone.push(draft.topic);}
  }
  // 지운 게시물의 주제는 "했던 주제" 기록에 남겨 다시 추천하지 않는다(topics/topicHistory.ts). 기록을 못 남겨도 지우기는 그대로.
  if(gone.length)await deps.history(gone).catch(error=>console.warn("[drafts] 지운 게시물 주제를 기록하지 못했어요:",error instanceof Error?error.message:String(error)));
  if(removed)console.info(`[drafts] 만든 지 30일이 지난 게시물 ${removed}개를 지웠어요(보관함 제외).`);
  return removed;
}

// 6시간에 한 번만 돈다. 동시에 여러 번 불러도 한 번만 돈다.
export async function purgeExpiredDraftsIfDue(now=Date.now()):Promise<void> {
  // 단위 테스트(vitest)는 날짜가 오래된 시험용 게시물을 쓰므로 저절로 지우지 않는다(purgeExpiredDrafts는 따로 시험한다).
  if(process.env.VITEST)return;
  const state=store.__draftPurge??={at:0};
  if(state.running){await state.running.catch(()=>0);return;}
  if(now-state.at<PURGE_EVERY_MS)return;
  state.at=now;
  state.running=purgeExpiredDrafts(now).catch(error=>{console.warn("[drafts] 오래된 게시물을 지우지 못했어요:",error instanceof Error?error.message:String(error));return 0;});
  try{await state.running;}finally{state.running=undefined;}
}
