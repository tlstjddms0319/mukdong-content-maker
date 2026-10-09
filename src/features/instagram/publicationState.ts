import type { Publication } from "./schema";

// 게시 기록(Publication)과 초안의 예약 정보를 사람이 읽는 "게시 상태"로 바꾼다.
// 버튼 게시·예약 게시(스케줄러)·내 초안 화면이 같은 기준을 쓰도록 한곳에 둔다(순수 함수, 서버·브라우저 공용).

// 예약 시각에서 이만큼 넘게 지난 초안은 자동 게시하지 않는다(무료 서버가 잠들어 있다 깨어난 뒤 며칠 지난 글이 나가는 것을 막는다).
export const MAX_PUBLISH_LATENESS_MS=6*60*60*1000;
// "게시 준비 중"이 이보다 오래 이어지면 도중에 멈춘 것으로 본다(정상 게시는 컨테이너 대기까지 2분 안팎).
export const STALE_PREPARING_MS=15*60*1000;
// 멈춘 게시를 Meta에 물어봐도 결과를 알 수 없을 때 남기는 표시. 사장님이 Instagram에서 직접 확인해 골라야 한다.
export const NEEDS_CHECK_MESSAGE="게시가 중간에 멈췄어요. Instagram에 올라갔는지 확인한 뒤 아래에서 골라 주세요.";

export type PublishState="published"|"publishing"|"needs-check"|"failed"|"missed"|"due"|"scheduled"|"none";
export type PublishStatus={state:PublishState;label:string;detail?:string;publishedAt?:string};

type ScheduleFields={planned_publish_at?:string|null;final_review_complete?:boolean;archived?:boolean};

// 기록이 "게시 준비 중"인데 mediaId 없이 오래 멈춰 있는지(프로세스가 죽었거나 게시 요청 뒤 응답을 못 받음).
export const isStalePreparing=(publication:Publication,now:number)=>publication.status==="preparing"&&!publication.mediaId&&now-Date.parse(publication.attemptedAt)>=STALE_PREPARING_MS;
// 예약 시각이 너무 오래 지났는지.
export const isTooLate=(plannedAt:string,now:number)=>now-Date.parse(plannedAt)>MAX_PUBLISH_LATENESS_MS;

// options.connected=false: 인스타그램이 연결돼 있지 않음(저장된 연결이 없거나 만료). 예약돼 있어도 올라가지 않으므로 "예약됨" 대신 그 사실을 보여 준다.
export function publishStatusOf(draft:ScheduleFields,publication:Publication|null,now:number,options:{connected?:boolean}={}):PublishStatus {
  if(publication?.status==="published"||(publication?.status==="preparing"&&publication.mediaId))
    return {state:"published",label:"게시됨",...(publication.publishedAt?{publishedAt:publication.publishedAt}:{})};
  if(publication?.status==="preparing")
    return publication.safeError===NEEDS_CHECK_MESSAGE||isStalePreparing(publication,now)
      ?{state:"needs-check",label:"게시 확인 필요",detail:NEEDS_CHECK_MESSAGE}
      :{state:"publishing",label:"게시 중"};
  const planned=draft.planned_publish_at;
  // 보관함 게시물은 예약 점검이 올리지 않는다(scheduler.ts).
  const scheduled=Boolean(draft.final_review_complete&&planned&&!draft.archived);
  if(publication?.status==="failed"){
    // 실패했어도 예약 범위 안이면 스케줄러가 30분 뒤 다시 시도한다.
    const retry=scheduled&&planned&&!isTooLate(planned,now)?" 30분 뒤 자동으로 다시 시도해요.":"";
    return {state:"failed",label:"게시 실패",detail:`${publication.safeError??"Instagram 게시에 실패했어요."}${retry}`};
  }
  if(!scheduled||!planned)return {state:"none",label:""};
  const at=Date.parse(planned);
  if(options.connected===false&&!isTooLate(planned,now))return {state:at>now?"scheduled":"due",label:"연결 전이라 안 올라가요",detail:"인스타그램이 연결돼 있지 않아 이 시각에 저절로 올라가지 않아요. 설정에서 인스타그램을 연결해 주세요."};
  if(at>now)return {state:"scheduled",label:"예약됨"};
  if(isTooLate(planned,now))return {state:"missed",label:"예약 놓침",detail:"예약 시각이 6시간 넘게 지나 자동 게시하지 않았어요. 새 올릴 날짜를 저장하면 다시 예약돼요."};
  return {state:"due",label:"게시 대기",detail:"곧 자동으로 게시돼요. 서버가 쉬고 있었다면 깨어난 뒤(최대 1시간쯤) 게시돼요."};
}
