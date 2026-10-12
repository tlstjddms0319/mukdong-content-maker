import { z } from "zod";
import { daysInMonth,diffDays } from "./dates";

// 네이버 스마트플레이스·블로그 통계는 공식 API가 없어 Claude가 통계 화면을 읽어 기간 단위로 기록한다.
// 네이버 화면의 '일 평균'은 달력 일수로 나눠 일부만 있는 달(예: 8/25부터 잡힌 8월)을 작게 보이게 하므로 쓰지 않는다.
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const percent=z.number().min(0).max(100);
const count=z.number().int().min(0).max(10_000_000);
const share=z.object({name:z.string().trim().min(1).max(40),percent});
const ages=z.array(percent).length(7); // 10대~70대, 성별 안에서의 비율

export const NaverPeriodSchema=z.object({
  id:z.string().min(1).max(60),
  start:day,end:day,
  dataDays:z.number().int().min(1),
  placeVisits:count,
  channels:z.array(z.object({name:z.string().trim().min(1).max(40),count:count.optional(),percent:percent.optional()})).max(10),
  keywords:z.array(share).max(5),
  gender:z.object({male:percent,female:percent}).optional(),
  ageMale:ages.optional(),ageFemale:ages.optional(),
  peakHours:z.string().max(40).optional(),
  reviews:count.optional(),
  blogViews:count.optional(),blogVisitors:count.optional(),
  checkedOn:day,
  note:z.string().max(300).optional(),
}).refine(p=>p.start<=p.end,{message:"끝나는 날이 시작일보다 빨라요."})
  .refine(p=>p.dataDays<=diffDays(p.start,p.end)+1,{message:"숫자가 있는 날이 기간 일수보다 많아요."});
export type NaverPeriod=z.infer<typeof NaverPeriodSchema>;

const round1=(n:number)=>Math.round(n*10)/10;
export const dailyAverage=(p:NaverPeriod)=>round1(p.placeVisits/p.dataDays);
export const monthEquivalent=(p:NaverPeriod)=>Math.round(p.placeVisits/p.dataDays*daysInMonth(p.start));

// 전체 중 20~30대 비율(%) 어림값. 네이버 연령 비율은 성별 안의 비율이라 성별 비율로 가중한다.
export function youngShare(p:NaverPeriod){
  if(!p.gender||!p.ageMale||!p.ageFemale)return undefined;
  return round1((p.gender.male*(p.ageMale[1]+p.ageMale[2])+p.gender.female*(p.ageFemale[1]+p.ageFemale[2]))/100);
}

export function newKeywords(p:NaverPeriod,previous?:NaverPeriod){
  if(!previous)return [];
  const before=new Set(previous.keywords.map(k=>k.name));
  return p.keywords.map(k=>k.name).filter(name=>!before.has(name)).sort((a,b)=>a.localeCompare(b,"ko"));
}

export const findOverlap=(list:NaverPeriod[],p:NaverPeriod)=>list.find(o=>o.id!==p.id&&o.start<=p.end&&p.start<=o.end);

// 2026-10-12 사용자 화면에서 확인한 첫 기록. 10월은 11일 치 중간값이며 11월 초에 덮어쓴다.
export const NAVER_SEED:NaverPeriod[]=[
  {id:"2026-08",start:"2026-08-25",end:"2026-08-31",dataDays:7,placeVisits:87,reviews:0,checkedOn:"2026-10-12",peakHours:"17~18시",
    channels:[{name:"네이버지도",count:58,percent:66.67},{name:"네이버검색",count:29,percent:33.33}],
    keywords:[{name:"묵동홍어마을",percent:33.33},{name:"묵동홍어",percent:33.33},{name:"홍어마을노원",percent:12.5},{name:"먹골홍어",percent:12.5},{name:"홍어먹골",percent:8.33}],
    gender:{male:65,female:35},ageMale:[0,22,24,17,26,11,0],ageFemale:[0,16,36,32,16,0,0],
    note:"플레이스 유입은 8월 25일부터 잡혔다."},
  {id:"2026-09",start:"2026-09-01",end:"2026-09-30",dataDays:30,placeVisits:444,reviews:1,checkedOn:"2026-10-12",peakHours:"15시 (15~18시 높음)",
    channels:[{name:"네이버지도",count:259,percent:58.33},{name:"네이버검색",count:177,percent:39.86},{name:"네이버 블로그",count:6,percent:1.35},{name:"네이버 모바일메인",count:1,percent:0.23},{name:"네이버 MY플레이스",count:1,percent:0.23}],
    keywords:[{name:"묵동홍어마을",percent:49.5},{name:"묵동홍어",percent:26.73},{name:"먹골역홍어",percent:8.91},{name:"홍어본가",percent:7.92},{name:"홍어마을",percent:6.93}],
    gender:{male:64,female:36},ageMale:[0,19,26,25,21,6,4],ageFemale:[0,16,20,27,24,13,0]},
  {id:"2026-10",start:"2026-10-01",end:"2026-10-11",dataDays:11,placeVisits:260,reviews:0,checkedOn:"2026-10-12",peakHours:"18시 (15~19시 높음)",
    channels:[{name:"네이버지도",count:159,percent:61.15},{name:"네이버검색",count:100,percent:38.46},{name:"네이버 MY플레이스",count:1,percent:0.38}],
    keywords:[{name:"묵동홍어마을",percent:56.86},{name:"먹골홍어",percent:15.69},{name:"묵동홍어",percent:11.76},{name:"묵동홍어집",percent:9.8},{name:"석계역삼합",percent:5.88}],
    gender:{male:62,female:38},ageMale:[0,19,16,22,32,8,3],ageFemale:[0,20,5,32,37,5,1],
    note:"10월 11일까지의 중간값."},
];
