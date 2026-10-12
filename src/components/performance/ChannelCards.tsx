import type { ReactNode } from "react";
import { LineChart } from "./LineChart";
import { NaverPeriodForm } from "./NaverPeriodForm";
import { PostBoard } from "./PostBoard";
import { StatTile } from "./StatTile";
import { BarList } from "./BarList";
import { formatCount,percentChange,shortDate,sumOf } from "./format";
import { groupSources } from "@/features/metrics/sources";
import { dailyAverage,monthEquivalent,newKeywords,youngShare,type NaverPeriod } from "@/features/metrics/naver";
import type { ChannelState,Ga4Day,InstagramDay,InstagramPost } from "@/features/metrics/store";

// 성과 화면의 채널별 칸. 숫자는 칸(StatTile)으로 크게, 흐름은 선 그래프로, 비교는 가로 막대로 보여 준다.
function Status({state}:{state?:ChannelState}){
  if(!state?.lastRunOn)return <span className="channel-status idle">아직 가져오지 않음</span>;
  if(state.lastError)return <span className="channel-status warn" role="alert"><span aria-hidden="true">⚠</span> {state.lastError}</span>;
  return <span className="channel-status ok"><span aria-hidden="true">●</span> {shortDate(state.lastRunOn)} 확인</span>;
}
// collected=false: 자동 수집이 없는 채널(네이버)이라 수집 상태 대신 children만 보여 준다.
function ChannelHead({title,icon,state,collected=true,children}:{title:string;icon:string;state?:ChannelState;collected?:boolean;children?:ReactNode}){
  return <header className="channel-head"><h2><span className="channel-icon" aria-hidden="true">{icon}</span>{title}</h2><div className="channel-meta">{children}{collected&&<Status state={state}/>}</div></header>;
}

export function InstagramCard({days,state,insights,connected,posts=[]}:{days:InstagramDay[];state?:ChannelState;insights:boolean;connected:boolean;posts?:InstagramPost[]}){
  const followers=days.filter(d=>d.followers!==undefined);
  const first=followers[0]?.followers,last=followers.at(-1)?.followers;
  const avg=(key:"views"|"likes"|"saves")=>{const list=posts.map(p=>p[key]).filter((v):v is number=>v!==undefined);return list.length?Math.round(list.reduce((a,b)=>a+b,0)/list.length):undefined;};
  return <section className="channel" aria-label="인스타그램">
    <ChannelHead title="인스타그램" icon="◎" state={state}/>
    {!insights&&<p className="notice">{connected?"설정에서 인스타그램을 다시 연결하면 팔로워·도달·조회를 자동으로 가져와요.":"설정에서 인스타그램을 연결하면 팔로워·도달·조회를 자동으로 가져와요."}</p>}
    <div className="stat-row">
      <StatTile label="팔로워" value={last} unit="명" delta={first!==undefined&&last!==undefined&&followers.length>1?{value:last-first,unit:"명",caption:"이 기간"}:undefined}/>
      <StatTile label="도달" value={sumOf(days,d=>d.reach)} compact hint="날마다 본 사람 수의 합"/>
      <StatTile label="조회" value={sumOf(days,d=>d.views)} compact/>
      <StatTile label="반응한 계정" value={sumOf(days,d=>d.accountsEngaged)}/>
      <StatTile label="프로필 방문" value={sumOf(days,d=>d.profileViews)}/>
      <StatTile label="링크 클릭" value={sumOf(days,d=>d.websiteClicks)}/>
    </div>
    <LineChart label="팔로워" unit="명" points={followers.map(d=>({x:d.date,y:d.followers!}))}/>
    <div className="subsection">
      <div className="subsection-head"><h3>게시물별 현황</h3>{posts.length>0&&<p>게시물 {posts.length}개 · 평균 조회 {formatCount(avg("views"))} · 평균 좋아요 {formatCount(avg("likes"))} · 평균 저장 {formatCount(avg("saves"))}</p>}</div>
      <PostBoard posts={posts}/>
    </div>
  </section>;
}

export function HomepageCard({days,previous=[],state,configured}:{days:Ga4Day[];previous?:Ga4Day[];state?:ChannelState;configured:boolean}){
  const sources=new Map<string,number>();
  for(const d of days)for(const s of d.sources)sources.set(s.sourceMedium,(sources.get(s.sourceMedium)??0)+s.sessions);
  const groups=groupSources([...sources].map(([sourceMedium,sessions])=>({sourceMedium,sessions})));
  const change=(pick:(d:Ga4Day)=>number|undefined)=>{const p=percentChange(sumOf(days,pick),sumOf(previous,pick));return p===undefined?undefined:{value:p,percent:true,caption:"앞 기간보다"};};
  return <section className="channel" aria-label="홈페이지">
    <ChannelHead title="홈페이지" icon="⌂" state={state}/>
    {!configured&&<p className="notice">구글 애널리틱스 연결이 필요해요. 도움말 문서(PERFORMANCE_METRICS)의 순서대로 서비스 계정을 추가해 주세요.</p>}
    <div className="stat-row">
      <StatTile label="방문" value={sumOf(days,d=>d.sessions)} delta={change(d=>d.sessions)}/>
      <StatTile label="페이지 조회" value={sumOf(days,d=>d.pageViews)} delta={change(d=>d.pageViews)}/>
      <StatTile label="전화 버튼" value={sumOf(days,d=>d.phoneClicks)} unit="번"/>
      <StatTile label="길찾기 버튼" value={sumOf(days,d=>d.directionsClicks)} unit="번"/>
    </div>
    <LineChart label="일별 방문자" unit="명" points={days.filter(d=>d.activeUsers!==undefined).map(d=>({x:d.date,y:d.activeUsers!}))}/>
    {groups.length>0&&<div className="subsection">
      <div className="subsection-head"><h3>어디서 들어왔나</h3><p>방문 {formatCount(groups.reduce((a,g)=>a+g.sessions,0))}번 기준</p></div>
      <BarList label="들어온 곳" items={groups.map(g=>({key:g.group,label:g.group,value:g.sessions,note:`${g.percent}%`}))}/>
      <p className="field-help">직접 방문은 주소를 직접 치거나 즐겨찾기, 카카오톡처럼 출처가 남지 않는 앱 안 링크로 들어온 경우예요. 비율은 날마다 많이 들어온 10곳을 모은 것 기준이에요.</p>
      <details className="metric-details"><summary>자세히 (구글 애널리틱스 원래 이름)</summary>
        <table className="metric-table"><tbody>{groups.flatMap(g=>g.items.map(item=><tr key={item.sourceMedium}><th scope="row">{item.label===g.group?g.group:`${g.group} · ${item.label}`}<br/><small className="source-raw">{item.sourceMedium}</small></th><td>{formatCount(item.sessions)}</td></tr>))}</tbody></table>
      </details>
    </div>}
  </section>;
}

const periodName=(p:NaverPeriod)=>{const [,m]=p.start.split("-").map(Number);const full=p.dataDays>=28;return `${m}월${full?"":` (${p.dataDays}일)`}`;};

export function NaverCard({periods}:{periods:NaverPeriod[]}){
  const latest=periods.at(-1),before=periods.at(-2);
  const young=latest?youngShare(latest):undefined,youngBefore=before?youngShare(before):undefined;
  const fresh=latest?new Set(newKeywords(latest,before)):new Set<string>();
  return <section className="channel channel-wide" aria-label="네이버 플레이스">
    <ChannelHead title="네이버 플레이스" icon="N" collected={false}>{latest&&<span className="channel-status idle">{shortDate(latest.checkedOn)} 기록</span>}</ChannelHead>
    {latest?<>
      <div className="stat-row">
        <StatTile label={`하루 평균 유입 · ${periodName(latest)}`} value={dailyAverage(latest)} unit="회" delta={before?{value:percentChange(dailyAverage(latest),dailyAverage(before))!,percent:true,caption:`${periodName(before)}보다`}:undefined} spark={periods.map(dailyAverage)}/>
        <StatTile label="한 달로 늘리면" value={monthEquivalent(latest)} unit="회" hint="하루 평균 × 그달 일수"/>
        <StatTile label="리뷰 등록" value={latest.reviews} unit="건"/>
        <StatTile label="20~30대 비율(어림)" value={young} display={young===undefined?"—":`${young}%`} delta={young!==undefined&&youngBefore!==undefined?{value:Math.round((young-youngBefore)*10)/10,unit:"%p",caption:`${periodName(before!)}보다`}:undefined}/>
      </div>
      <div className="split">
        <div className="subsection">
          <div className="subsection-head"><h3>기간별 하루 평균 유입</h3><p>숫자가 있는 날로 나눈 값</p></div>
          <BarList label="기간별 하루 평균 유입" unit="회" items={periods.map(p=>({key:p.id,label:periodName(p),value:dailyAverage(p),note:`한 달 약 ${formatCount(monthEquivalent(p))}`}))}/>
        </div>
        <div className="subsection">
          <div className="subsection-head"><h3>찾아온 검색어 · {periodName(latest)}</h3><p>네이버 화면의 비율</p></div>
          <BarList label="유입 키워드" unit="%" items={latest.keywords.map(k=>({key:k.name,label:k.name,value:k.percent,badge:fresh.has(k.name)?"새로":undefined}))}/>
          {latest.peakHours&&<p className="field-help">많이 본 시간: {latest.peakHours}</p>}
        </div>
      </div>
    </>:<p className="chart-empty">아직 네이버 기록이 없어요.</p>}
    <details className="metric-details"><summary>표로 보기 (기간별 전체 숫자)</summary>
      <div className="table-scroll"><table className="metric-table">
        <thead><tr><th>기간</th><th>숫자 있는 날</th><th>유입</th><th>하루 평균</th><th>한 달 환산</th><th>리뷰</th><th>20~30대(어림)</th><th>새 키워드</th><th>많이 본 시간</th></tr></thead>
        <tbody>{periods.map((p,i)=>{const y=youngShare(p);const fk=newKeywords(p,periods[i-1]);return <tr key={p.id}>
          <th scope="row">{p.start}~{p.end}</th><td>{p.dataDays}일</td><td>{formatCount(p.placeVisits)}</td>
          <td>{dailyAverage(p)}</td><td>{`약 ${formatCount(monthEquivalent(p))}`}</td><td>{formatCount(p.reviews)}</td>
          <td>{y===undefined?"—":`${y}%`}</td><td>{fk.length?fk.join(", "):"—"}</td><td>{p.peakHours??"—"}</td>
        </tr>;})}</tbody>
      </table></div>
      {periods.map(p=><div key={p.id} className="naver-detail"><h3>{p.start}~{p.end}</h3>
        <p>유입 채널: {p.channels.map(c=>`${c.name} ${c.count!==undefined?`${c.count}회 `:""}${c.percent!==undefined?`(${c.percent}%)`:""}`).join(" · ")}</p>
        <p>유입 키워드: {p.keywords.map(k=>`${k.name} ${k.percent}%`).join(" · ")}</p>
        {p.gender&&<p>성별: 남 {p.gender.male}% · 여 {p.gender.female}%</p>}
        {p.note&&<p className="field-help">{p.note}</p>}
      </div>)}
    </details>
    <NaverPeriodForm/>
  </section>;
}

// 맨 위 요약: 세 채널의 대표 숫자 하나씩.
export function SummaryStrip({instagram,ga4,previousGa4,naver}:{instagram:InstagramDay[];ga4:Ga4Day[];previousGa4:Ga4Day[];naver:NaverPeriod[]}){
  const followers=instagram.filter(d=>d.followers!==undefined).map(d=>d.followers!);
  const visits=sumOf(ga4,d=>d.sessions),visitsBefore=sumOf(previousGa4,d=>d.sessions);
  const latest=naver.at(-1),before=naver.at(-2);
  const visitChange=percentChange(visits,visitsBefore);
  return <div className="summary-strip" aria-label="요약">
    <StatTile label="인스타그램 팔로워" value={followers.at(-1)} unit="명" spark={followers} delta={followers.length>1?{value:followers.at(-1)!-followers[0],unit:"명",caption:"이 기간"}:undefined} hint={followers.length?undefined:"다시 연결 뒤부터 쌓여요"}/>
    <StatTile label="홈페이지 방문" value={visits} unit="번" spark={ga4.map(d=>d.sessions??0)} delta={visitChange===undefined?undefined:{value:visitChange,percent:true,caption:"앞 기간보다"}}/>
    <StatTile label="네이버 플레이스 하루 평균" value={latest?dailyAverage(latest):undefined} unit="회" spark={naver.map(dailyAverage)} delta={latest&&before?{value:percentChange(dailyAverage(latest),dailyAverage(before))!,percent:true,caption:`${periodName(before)}보다`}:undefined}/>
  </div>;
}
