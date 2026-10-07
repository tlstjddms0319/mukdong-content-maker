import { z } from "zod";
import { StoredStyleIdSchema, StyleIdSchema, type StyleId } from "@/features/images/styleCatalog";
import { TopicSuggestionSchema, type TopicSuggestion } from "./schema";
import { isOtherMenuTopic } from "./service";

// 한 달 콘텐츠 기획. 한 달 안의 게시일(기본: 매주 화·금)을 정하고, 주마다 그 주 날짜의 시즌을 반영한 추천 주제를
// 게시일에 나눠 담는다. 주제를 고르는 일(AI·준비된 주제)은 라우트가 하고, 여기는 날짜·배치·계열 순환만 맡는다(순수 함수).

export const MonthSchema=z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const MonthPlanItemSchema=TopicSuggestionSchema.extend({
  date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  style:StoredStyleIdSchema,
});
export const MonthPlanSchema=z.object({month:MonthSchema,createdAt:z.string().datetime(),items:z.array(MonthPlanItemSchema).max(31)});
export type MonthPlanItem=z.infer<typeof MonthPlanItemSchema>;
export type MonthPlan=z.infer<typeof MonthPlanSchema>;

// 인스타그램 음식 계정은 주 2회 정도가 꾸준히 이어가기 좋다. 화(2)·금(5): 주중 약속을 정하는 날과 주말 직전.
export const DEFAULT_POST_WEEKDAYS=[2,5] as const;

const pad=(value:number)=>String(value).padStart(2,"0");

// 그 달의 게시일 목록(YYYY-MM-DD). from을 주면 그날 이후(포함)만 남긴다(이번 달을 기획할 때 지난 날짜 제외).
export function postDatesForMonth(month:string,weekdays:readonly number[]=DEFAULT_POST_WEEKDAYS,from?:string):string[] {
  const [year,m]=MonthSchema.parse(month).split("-").map(Number);
  const days=new Date(Date.UTC(year,m,0)).getUTCDate();
  const dates:string[]=[];
  for(let day=1;day<=days;day++){
    const date=`${year}-${pad(m)}-${pad(day)}`;
    if(weekdays.includes(new Date(Date.UTC(year,m-1,day)).getUTCDay())&&(!from||date>=from))dates.push(date);
  }
  return dates;
}

// 게시일을 주(월요일 시작) 단위로 묶는다. 주마다 한 번 주제를 추천받아 그 주 게시일에 나눠 담기 위해서다.
export function groupByWeek(dates:string[]):string[][] {
  const weeks=new Map<string,string[]>();
  for(const date of dates){
    const time=Date.parse(`${date}T00:00:00Z`);
    const monday=new Date(time-((new Date(time).getUTCDay()+6)%7)*86_400_000).toISOString().slice(0,10);
    weeks.set(monday,[...(weeks.get(monday)??[]),date]);
  }
  return [...weeks.values()];
}

// 그 주의 추천 주제 3개 가운데 게시일 수만큼 고른다. 시즌 주제를 먼저, 그다음 홍어를 직접 다루는 주제(셋째 칸), 나머지 순.
// 두 개 이상 고를 때 모두 홍어회·삼합이면 마지막 하나를 다른 메뉴(과메기·미나리전·막걸리 등) 주제로 바꾼다.
// 이미 이번 달에 쓴 제목은 건너뛴다.
export function pickWeekTopics(topics:TopicSuggestion[],count:number,used:Set<string>):TopicSuggestion[] {
  const key=(title:string)=>title.replace(/[\s?!.,]/g,"");
  const ranked=[...topics].sort((a,b)=>score(b)-score(a)).filter(topic=>!used.has(key(topic.title)));
  const picked=ranked.slice(0,count);
  if(picked.length>=2&&!picked.some(isOtherMenuTopic)){
    const other=ranked.slice(count).find(isOtherMenuTopic);
    if(other)picked[picked.length-1]=other;
  }
  return picked;
  function score(topic:TopicSuggestion){return (topic.season?2:0)+(/홍어|삼합/.test(topic.title)?1:0);}
}

// 게시물마다 디자인 계열을 돌려 가며 추천한다. 기본 템플릿은 빼고, 같은 계열이 연달아 나오지 않게 한다.
// 시작 위치는 달마다 달라서(달 번호 기준) 매달 같은 순서로 반복되지 않는다.
export function rotateStyles(count:number,month:string):StyleId[] {
  const styles=StyleIdSchema.options.filter(id=>id!=="template");
  const offset=Number(month.slice(5,7))*3+Number(month.slice(0,4));
  return Array.from({length:count},(_,i)=>styles[(offset+i*5)%styles.length]);
}
