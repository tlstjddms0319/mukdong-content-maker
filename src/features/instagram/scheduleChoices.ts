// "예약해서 올리기"에서 고를 수 있는 시각(한국 시간). 사장님이 달력을 열지 않고 한 번에 고르게 자주 쓰는 시각만 둔다.
// 모두 지금보다 30분 이상 뒤인 것만 보인다(바로 다가오는 시각은 "바로 올리기"가 낫고, 서버가 쉬고 있으면 1시간마다 깨우는 작업이 올 때까지 최대 1시간쯤 늦을 수 있다).
const KST_OFFSET_MS=9*60*60*1000;
const MIN_LEAD_MS=30*60*1000;

export type ScheduleChoice={label:string;iso:string};

// 한국 날짜(오늘+dayOffset)의 hour:00을 UTC ISO 문자열로.
function kstAt(now:number,dayOffset:number,hour:number):string {
  const kst=new Date(now+KST_OFFSET_MS);
  return new Date(Date.UTC(kst.getUTCFullYear(),kst.getUTCMonth(),kst.getUTCDate()+dayOffset,hour)-KST_OFFSET_MS).toISOString();
}

export function quickScheduleChoices(now=Date.now()):ScheduleChoice[] {
  const choices:ScheduleChoice[]=[
    {label:"오늘 점심 12시",iso:kstAt(now,0,12)},
    {label:"오늘 저녁 6시",iso:kstAt(now,0,18)},
    {label:"내일 점심 12시",iso:kstAt(now,1,12)},
    {label:"내일 저녁 6시",iso:kstAt(now,1,18)},
  ];
  return choices.filter(choice=>Date.parse(choice.iso)-now>=MIN_LEAD_MS).slice(0,3);
}

// "10월 9일(금) 저녁 6:00" 처럼 사장님이 읽기 쉬운 한국 시각.
export function formatKstTime(iso:string):string {
  const kst=new Date(Date.parse(iso)+KST_OFFSET_MS);
  const hour=kst.getUTCHours(),minute=String(kst.getUTCMinutes()).padStart(2,"0");
  const part=hour<6?"새벽":hour<12?"오전":hour<17?"오후":"저녁";
  const shown=hour%12===0?12:hour%12;
  return `${kst.getUTCMonth()+1}월 ${kst.getUTCDate()}일(${"일월화수목금토"[kst.getUTCDay()]}) ${part} ${shown}:${minute}`;
}

// datetime-local 입력값("2026-10-09T18:00", 한국 시간으로 본다) ↔ ISO.
export const localInputToIso=(value:string)=>new Date(`${value}:00+09:00`).toISOString();
export const isoToLocalInput=(iso:string)=>new Date(Date.parse(iso)+KST_OFFSET_MS).toISOString().slice(0,16);
