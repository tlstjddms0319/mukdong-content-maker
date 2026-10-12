import { z } from "zod";
import { STYLES, StoredStyleIdSchema, type StyleId } from "@/features/images/styleCatalog";

// 게시물 성과 직접 기록과 분석(순수 함수).
// Instagram 연동 전이라도 사장님이 인사이트 화면의 숫자를 옮겨 적으면, 어떤 주제·디자인·요일이 잘 됐는지 모아 보여 주고
// 반응 좋던 주제를 주제 추천 AI에 참고로 넘긴다.

const count=z.number().int().min(0).max(10_000_000);
export const PerformanceSchema=z.object({
  likes:count,
  comments:count,
  saves:count,
  shares:count,
  reach:count.optional(),                                   // 도달(계정 수). 있으면 반응률을 계산한다.
  posted_on:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // 실제로 올린 날(요일 분석용)
  recorded_at:z.string().datetime(),
  // 어디서 온 숫자인지: 사장님이 직접 적은 것(없으면 manual) 또는 Instagram에서 자동으로 가져온 것(instagram/insights.ts).
  // 자동 가져오기는 사장님이 직접 적은 숫자를 덮어쓰지 않는다. fetched_at: 마지막으로 가져온 때(다시 가져올지 정한다).
  source:z.enum(["manual","instagram"]).optional(),
  fetched_at:z.string().datetime().optional(),
});
export type Performance=z.infer<typeof PerformanceSchema>;

// 초안에 남기는 디자인 계열. 구성안이 고른 계열이나 직접 고른 계열(사진만 쓴 초안은 기록하지 않는다).
export const DesignStyleSchema=StoredStyleIdSchema;

// 반응 점수: 저장·공유는 "다시 보고 싶다/알리고 싶다"는 강한 신호라 3배, 댓글 2배, 좋아요 1배.
// (Instagram도 저장·공유를 추천 노출에 크게 반영한다고 알려져 있다. 절대 기준이 아니라 내 게시물끼리 비교하는 용도.)
export const engagementScore=(p:Pick<Performance,"likes"|"comments"|"saves"|"shares">)=>p.likes+p.comments*2+p.saves*3+p.shares*3;
// 도달 대비 반응률(%). 도달을 안 적었으면 null.
export const engagementRate=(p:Performance)=>p.reach?Math.round(engagementScore(p)/p.reach*1000)/10:null;

export type PerformanceDraft={id:string;topic:string;audience:"A"|"B"|"C";design_style?:StyleId;planned_publish_at?:string|null;performance?:Performance};
export type PerformanceGroup={key:string;label:string;count:number;average:number};
export type PerformanceSummary={recorded:number;top:Array<{id:string;topic:string;score:number;rate:number|null}>;byStyle:PerformanceGroup[];byAudience:PerformanceGroup[];byWeekday:PerformanceGroup[]};

const AUDIENCE_LABELS={A:"음식 탐색형",B:"약속 결정형",C:"호기심 입문형"} as const;
const WEEKDAYS=["일","월","화","수","목","금","토"];
// 올린 날: 직접 적은 날 → 없으면 게시 희망일시의 한국 날짜.
const postedDay=(draft:PerformanceDraft)=>draft.performance?.posted_on??(draft.planned_publish_at?new Date(Date.parse(draft.planned_publish_at)+9*3_600_000).toISOString().slice(0,10):undefined);

function groupAverage(items:Array<{key?:string;score:number}>,label:(key:string)=>string):PerformanceGroup[] {
  const groups=new Map<string,number[]>();
  for(const item of items)if(item.key)groups.set(item.key,[...(groups.get(item.key)??[]),item.score]);
  return [...groups].map(([key,scores])=>({key,label:label(key),count:scores.length,average:Math.round(scores.reduce((a,b)=>a+b,0)/scores.length)}))
    .sort((a,b)=>b.average-a.average);
}

export function summarizePerformance(drafts:PerformanceDraft[]):PerformanceSummary {
  const scored=drafts.flatMap(draft=>draft.performance?[{draft,score:engagementScore(draft.performance),rate:engagementRate(draft.performance)}]:[]);
  return {
    recorded:scored.length,
    top:[...scored].sort((a,b)=>b.score-a.score).slice(0,3).map(({draft,score,rate})=>({id:draft.id,topic:draft.topic,score,rate})),
    byStyle:groupAverage(scored.map(({draft,score})=>({key:draft.design_style,score})),key=>STYLES[key as StyleId]?.label??key),
    byAudience:groupAverage(scored.map(({draft,score})=>({key:draft.audience,score})),key=>AUDIENCE_LABELS[key as keyof typeof AUDIENCE_LABELS]??key),
    byWeekday:groupAverage(scored.map(({draft,score})=>{const day=postedDay(draft);return {key:day?String(new Date(`${day}T00:00:00Z`).getUTCDay()):undefined,score};}),key=>`${WEEKDAYS[Number(key)]}요일`),
  };
}

// 주제 추천 AI에 넘길 "반응 좋았던 주제". 기록이 2개 이상일 때만, 평균보다 점수가 높은 것 가운데 상위 n개.
// (기록이 하나뿐이면 비교 대상이 없어 "잘 됐다"고 말할 수 없다.)
export function likedTopicTitles(drafts:PerformanceDraft[],n=3):string[] {
  const scored=drafts.flatMap(draft=>draft.performance?[{topic:draft.topic,score:engagementScore(draft.performance)}]:[]);
  if(scored.length<2)return [];
  const average=scored.reduce((sum,item)=>sum+item.score,0)/scored.length;
  return [...new Set(scored.filter(item=>item.score>average).sort((a,b)=>b.score-a.score).map(item=>item.topic))].slice(0,n);
}
