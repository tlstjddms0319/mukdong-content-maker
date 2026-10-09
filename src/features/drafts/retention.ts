// 내 게시물 보관 기간: 만든 지 30일이 지나면 저절로 지운다(저장 공간이 끝없이 늘지 않게, 사장님 결정 2026-10-09).
// 보관함에 넣은 게시물만 지우지 않고 계속 남긴다. 예약이 걸려 있어도 지운다(사장님 결정: 예외 없이 30일).
// 화면·서버가 함께 쓰는 순수 함수(서버 전용 모듈을 불러오지 않는다).
export const DRAFT_RETENTION_DAYS=30;
const DAY_MS=24*60*60*1000;
type Retained={created_at:string;archived?:boolean};

// 지워지는 시각(ms). 만든 시각을 못 읽으면 null(지우지 않는다).
export function draftExpiresAt(draft:Retained):number|null {
  const created=Date.parse(draft.created_at);
  return Number.isFinite(created)?created+DRAFT_RETENTION_DAYS*DAY_MS:null;
}
export const isDraftExpired=(draft:Retained,now:number)=>{
  if(draft.archived)return false;
  const expires=draftExpiresAt(draft);
  return expires!==null&&expires<=now;
};
// 지워지기까지 남은 날(올림). 보관함이거나 날짜를 모르면 null. 화면이 "N일 뒤 지워져요"로 보여 준다.
export function daysUntilDeletion(draft:Retained,now:number):number|null {
  if(draft.archived)return null;
  const expires=draftExpiresAt(draft);
  return expires===null?null:Math.max(0,Math.ceil((expires-now)/DAY_MS));
}
