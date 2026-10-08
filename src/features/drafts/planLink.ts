// 한 달 기획 ↔ 초안 연결(순수 함수). 서버(초안 저장)와 화면(기획표 상태 표시)이 같이 쓴다.
// - 기획표의 게시일(plan_date, YYYY-MM-DD)을 초안에 남겨 두면 어느 기획 칸에서 시작한 초안인지 정확히 안다.
// - 처음 저장할 때 그 날짜의 기본 게시 시각(한국 시간 18:00, 저녁 메뉴를 고르는 시간대)을 게시 희망일시로 채운다.

export const PLAN_DATE_PATTERN=/^\d{4}-\d{2}-\d{2}$/;
export const PLAN_POST_TIME_KST="18:00";

// "2026-10-06" → 그날 한국 시간 18:00의 ISO 시각. 이미 지난 시각이면 null(지난 날짜에 자동 게시를 걸지 않는다).
export function plannedAtFromPlanDate(date:string|undefined,now=Date.now()):string|null {
  if(!date||!PLAN_DATE_PATTERN.test(date))return null;
  const at=Date.parse(`${date}T${PLAN_POST_TIME_KST}:00+09:00`);
  return Number.isFinite(at)&&at>now?new Date(at).toISOString():null;
}

// 지금의 한국 날짜(YYYY-MM-DD). 서버·브라우저 시간대와 상관없이 같은 값을 낸다.
export const kstToday=(now=Date.now())=>new Date(now+9*3_600_000).toISOString().slice(0,10);

// 기획 칸의 진행 상태. 기획만 → 이미지 저장 → 문안까지 → 최종 확인 완료. 날짜가 지났는데 초안이 없으면 "놓침".
export type PlanItemState="planned"|"missed"|"images"|"caption"|"reviewed";
export type PlanDraftSummary={id:string;topic:string;plan_date?:string;hasImages:boolean;hasCaption:boolean;reviewed:boolean};
export const PLAN_STATE_LABELS:Record<PlanItemState,string>={planned:"주제만 정함",missed:"날짜 지남",images:"사진 저장됨",caption:"사진·글 완성",reviewed:"최종 확인 완료"};

const titleKey=(title:string)=>title.replace(/[\s?!.,]/g,"");
const progress=(draft:PlanDraftSummary)=>draft.reviewed?3:draft.hasCaption?2:draft.hasImages?1:0;
// 기획 칸에 연결된 초안이 이미지·문안·최종 확인 중 하나라도 진행됐는지("다시 기획하기"가 이 칸은 그대로 둔다).
export const planDraftStarted=(draft:PlanDraftSummary|undefined)=>Boolean(draft&&progress(draft)>0);

// 기획 칸에 해당하는 초안 찾기: 같은 게시일에서 시작한 초안을 먼저, 없으면(연결 전 옛 초안) 같은 제목의 날짜 없는 초안.
// 여러 개면 가장 많이 진행된 초안을 고른다.
export function matchPlanDraft(item:{date:string;title:string},drafts:PlanDraftSummary[]):PlanDraftSummary|undefined {
  const key=titleKey(item.title);
  const same=drafts.filter(draft=>titleKey(draft.topic)===key);
  const linked=same.filter(draft=>draft.plan_date===item.date);
  const pool=linked.length?linked:same.filter(draft=>!draft.plan_date);
  return pool.sort((a,b)=>progress(b)-progress(a))[0];
}

export function planItemState(item:{date:string},draft:PlanDraftSummary|undefined,today:string):PlanItemState {
  if(draft?.reviewed)return "reviewed";
  if(draft?.hasCaption)return "caption";
  if(draft?.hasImages)return "images";
  return item.date<today?"missed":"planned";
}
