import { dailyAverage,monthEquivalent,youngShare,type NaverPeriod } from "./naver";
import type { Ga4Day,InstagramDay,InstagramPost } from "./store";
import { kstDateOf } from "./dates";

const IG_LABELS:Record<string,string>={followers:"팔로워",mediaCount:"게시물 수",reach:"도달",views:"조회",accountsEngaged:"반응한 계정",totalInteractions:"전체 반응",profileViews:"프로필 방문",websiteClicks:"링크 클릭"};
const GA_LABELS:Record<string,string>={activeUsers:"방문자",sessions:"방문",pageViews:"페이지 조회",phoneClicks:"전화 버튼",directionsClicks:"길찾기 버튼"};
const cell=(value:string|number)=>{const text=String(value);return /[",\n]/.test(text)?`"${text.replaceAll('"','""')}"`:text;};

const POST_LABELS:Record<string,string>={views:"조회",reach:"도달",likes:"좋아요",comments:"댓글",saves:"저장",shares:"공유"};
export function toCsv({instagram,ga4,naver,posts=[]}:{instagram:InstagramDay[];ga4:Ga4Day[];naver:NaverPeriod[];posts?:InstagramPost[]}){
  const rows:(string|number)[][]=[["채널","기간","지표","값"]];
  for(const d of instagram)for(const [key,label] of Object.entries(IG_LABELS)){const v=d[key as keyof InstagramDay];if(typeof v==="number")rows.push(["인스타그램",d.date,label,v]);}
  // 게시물 줄: 기간 칸에 "올린 날 글 첫 줄"을 둔다(열 수는 그대로, 엑셀에서 게시물별로 거르기 쉽게).
  for(const p of posts){
    const title=(p.caption?.split(/\r?\n/)[0]??"").slice(0,40)||p.permalink;
    for(const [key,label] of Object.entries(POST_LABELS)){const v=p[key as keyof InstagramPost];if(typeof v==="number")rows.push(["인스타그램 게시물",`${kstDateOf(p.timestamp)} ${title}`,label,v]);}
  }
  for(const d of ga4){
    for(const [key,label] of Object.entries(GA_LABELS)){const v=d[key as keyof Ga4Day];if(typeof v==="number")rows.push(["홈페이지",d.date,label,v]);}
    for(const s of d.sources)rows.push(["홈페이지",d.date,`유입:${s.sourceMedium}`,s.sessions]);
  }
  for(const p of naver){
    const span=`${p.start}~${p.end}`,push=(label:string,v:number|undefined)=>{if(v!==undefined)rows.push(["네이버 플레이스",span,label,v]);};
    push("숫자가 있는 날",p.dataDays);push("플레이스 유입",p.placeVisits);push("하루 평균 유입",dailyAverage(p));push("한 달 환산 유입",monthEquivalent(p));
    push("리뷰 등록",p.reviews);push("20~30대 비율(어림)",youngShare(p));push("블로그 조회",p.blogViews);push("블로그 방문자",p.blogVisitors);
    for(const c of p.channels){push(`유입 채널:${c.name}(회)`,c.count);push(`유입 채널:${c.name}(%)`,c.percent);}
    for(const k of p.keywords)push(`유입 키워드:${k.name}(%)`,k.percent);
    if(p.gender){push("남성(%)",p.gender.male);push("여성(%)",p.gender.female);}
  }
  return rows.map(r=>r.map(cell).join(",")).join("\n")+"\n";
}
