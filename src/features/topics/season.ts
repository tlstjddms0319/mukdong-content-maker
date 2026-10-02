// 주제 추천에 넣을 "지금 이 시기" 정보. 외부 API 없이 날짜만으로 계산한다.
// 한국 시간(KST) 기준 오늘 날짜에서 계절·다가오는 명절·절기성 행사(복날, 김장철, 연말 모임 등)를 뽑아
// AI가 시기에 맞는 질문을 고르게 하고, 화면에는 "이번 시즌" 표시를 붙인다.
// 실시간 검색 인기도는 아니며, 날짜로 알 수 있는 사실만 다룬다.

export type SeasonEvent={
  id:string;          // 준비된 주제(fallback)와 연결하는 키
  name:string;        // 화면 표시용 이름. 예: "추석", "초복"
  hook:string;        // AI에게 주는 소재 힌트. 홍어와 이어질 수 있는 장면 위주로.
  start:string;       // 행사 시작일(YYYY-MM-DD, 포함)
  end:string;         // 행사 마지막 날(포함)
};
export type SeasonContext={today:string;season:string;events:Array<SeasonEvent&{daysAway:number}>};

const DAY=86_400_000;
const iso=(time:number)=>new Date(time).toISOString().slice(0,10);
const utc=(y:number,m:number,d:number)=>Date.UTC(y,m-1,d);

// 음력 명절은 계산이 복잡해 확인된 양력 날짜를 표로 둔다(설날·추석 당일). 표 밖의 해는 명절을 건너뛴다.
const LUNAR_HOLIDAYS:Record<number,{seollal:string;chuseok:string}>={
  2025:{seollal:"2025-01-29",chuseok:"2025-10-06"},
  2026:{seollal:"2026-02-17",chuseok:"2026-09-25"},
  2027:{seollal:"2027-02-07",chuseok:"2027-09-15"},
  2028:{seollal:"2028-01-26",chuseok:"2028-10-03"},
  2029:{seollal:"2029-02-13",chuseok:"2029-09-22"},
  2030:{seollal:"2030-02-03",chuseok:"2030-09-12"},
};

// 복날: 하지부터 세어 셋째 경(庚)일이 초복, 넷째가 중복, 입추부터 첫 경일이 말복이다(시작일이 경일이면 그날부터 센다).
// 일진은 2000-01-07이 갑자(甲子)일인 것을 기준으로 천간을 구한다(甲=0 … 庚=6).
const GAPJA_REF=utc(2000,1,7);
const isGyeong=(time:number)=>(((Math.round((time-GAPJA_REF)/DAY))%10)+10)%10===6;
function nthGyeong(from:number,n:number){
  let time=from,count=0;
  for(;;time+=DAY)if(isGyeong(time)&&++count===n)return time;
}
// 하지(6/21)·입추(8/7)는 해마다 하루 정도 움직이지만 복날 시즌 안내에는 이 근사로 충분하다.
function boknal(year:number){
  return {cho:nthGyeong(utc(year,6,21),3),jung:nthGyeong(utc(year,6,21),4),mal:nthGyeong(utc(year,8,7),1)};
}
// 10월 마지막 목요일(막걸리의 날).
function lastThursdayOfOctober(year:number){
  let time=utc(year,10,31);
  while(new Date(time).getUTCDay()!==4)time-=DAY;
  return time;
}

function eventsOfYear(year:number):SeasonEvent[] {
  const events:SeasonEvent[]=[];
  const lunar=LUNAR_HOLIDAYS[year];
  if(lunar){
    // 명절은 연휴 앞뒤로 장보기·가족 모임 이야기가 나오므로 일주일 전부터 다룬다.
    const around=(date:string,before:number,after:number)=>{const day=Date.parse(`${date}T00:00:00Z`);return {start:iso(day-before*DAY),end:iso(day+after*DAY)};};
    events.push({id:"seollal",name:"설날",hook:"설 연휴 가족 모임 상차림, 고향 음식과 명절에 모여 먹는 음식 이야기",...around(lunar.seollal,7,2)});
    events.push({id:"chuseok",name:"추석",hook:"추석 연휴 가족 모임 상차림, 명절 음식과 오랜만에 모인 자리의 메뉴 이야기",...around(lunar.chuseok,7,2)});
  }
  const bok=boknal(year);
  for(const [name,time] of [["초복",bok.cho],["중복",bok.jung],["말복",bok.mal]] as const){
    events.push({id:"boknal",name,hook:`${name} 보양 음식을 찾는 시기, 더운 날 기운 나는 한 끼와 함께 먹는 음식 이야기`,start:iso(time-5*DAY),end:iso(time)});
  }
  const makgeolli=lastThursdayOfOctober(year);
  events.push({id:"makgeolli",name:"막걸리의 날",hook:"10월 마지막 목요일 막걸리의 날, 막걸리와 어울리는 안주 조합 이야기",start:iso(makgeolli-7*DAY),end:iso(makgeolli)});
  events.push(
    {id:"spring",name:"봄 나들이철",hook:"날이 풀려 바깥 약속이 늘어나는 봄, 새 학기·새 직장 모임 메뉴 이야기",start:`${year}-03-15`,end:`${year}-04-30`},
    {id:"family",name:"가정의 달",hook:"어버이날·가족 외식이 많은 5월, 부모님 세대와 함께 먹는 음식 이야기",start:`${year}-05-01`,end:`${year}-05-20`},
    {id:"rainy",name:"장마철",hook:"비 오는 날 막걸리와 전·회가 생각나는 장마철 이야기",start:`${year}-06-20`,end:`${year}-07-25`},
    {id:"kimjang",name:"김장철",hook:"김장하고 수육을 삶는 김장철, 새 김치와 묵은지, 수육에 곁들이는 음식 이야기",start:`${year}-11-10`,end:`${year}-12-10`},
    {id:"yearend",name:"연말 모임",hook:"송년회·연말 모임 메뉴를 정하는 시기, 여럿이 나눠 먹기 좋은 한 상 이야기",start:`${year}-12-01`,end:`${year}-12-31`},
    {id:"newyear",name:"신년 모임",hook:"신년회와 새해 첫 모임, 한 해를 시작하며 함께 먹는 음식 이야기",start:`${year}-01-02`,end:`${year}-01-20`},
  );
  return events;
}

const SEASONS=["겨울","겨울","봄","봄","봄","여름","여름","여름","가을","가을","가을","겨울"] as const;
// 계절마다 날씨·분위기 힌트. 행사가 없는 주에도 시기감을 줄 수 있게 한다.
const SEASON_MOOD:Record<string,string>={
  봄:"일교차가 큰 환절기, 입맛이 달라지는 시기",
  여름:"덥고 습해 시원하거나 기운 나는 음식을 찾는 시기",
  가을:"선선해져 모임과 술자리가 늘어나는 시기",
  겨울:"추워서 따뜻한 국물·수육과 모임 음식이 생각나는 시기",
};

// 오늘(KST)을 기준으로 진행 중이거나 21일 안에 시작하는 행사를 가까운 순으로 고른다.
export function seasonContext(now:Date=new Date(),lookaheadDays=21):SeasonContext {
  const kst=new Date(now.getTime()+9*3_600_000);
  const today=utc(kst.getUTCFullYear(),kst.getUTCMonth()+1,kst.getUTCDate());
  const year=kst.getUTCFullYear();
  const events=[...eventsOfYear(year-1),...eventsOfYear(year),...eventsOfYear(year+1)]
    .map(event=>({...event,startTime:Date.parse(`${event.start}T00:00:00Z`),endTime:Date.parse(`${event.end}T00:00:00Z`)}))
    .filter(event=>event.endTime>=today&&event.startTime<=today+lookaheadDays*DAY)
    .map(event=>({id:event.id,name:event.name,hook:event.hook,start:event.start,end:event.end,daysAway:Math.max(0,Math.round((event.startTime-today)/DAY))}))
    .sort((a,b)=>a.daysAway-b.daysAway)
    .slice(0,3);
  const season=SEASONS[kst.getUTCMonth()];
  return {today:iso(today),season,events};
}

// 프롬프트에 넣을 한 단락. 행사가 없으면 계절 분위기만 준다.
export function seasonPromptText(context:SeasonContext):string {
  const events=context.events.map(event=>`${event.name}(${event.daysAway===0?"진행 중":`${event.daysAway}일 뒤 시작`}): ${event.hook}`).join(" / ");
  return `오늘은 ${context.today}(한국 시간), ${context.season}입니다. 계절 분위기: ${SEASON_MOOD[context.season]}.${events?` 이번 시기의 행사: ${events}.`:""}`;
}
