import { LineChart } from "./LineChart";
import { NaverPeriodForm } from "./NaverPeriodForm";
import { groupSources } from "@/features/metrics/sources";
import { dailyAverage,monthEquivalent,newKeywords,youngShare,type NaverPeriod } from "@/features/metrics/naver";
import type { ChannelState,Ga4Day,InstagramDay } from "@/features/metrics/store";

const fmt=(n:number|undefined)=>n===undefined?"—":n.toLocaleString("ko-KR");
const sum=<T,>(list:T[],pick:(item:T)=>number|undefined)=>{const values=list.map(pick).filter((v):v is number=>v!==undefined);return values.length?values.reduce((a,b)=>a+b,0):undefined;};
function Status({state}:{state?:ChannelState}){
  if(!state?.lastRunOn)return <p className="field-help">아직 가져온 적이 없어요.</p>;
  return <p className="field-help">마지막 확인 {state.lastRunOn}{state.lastError?<> · <strong role="alert">{state.lastError}</strong></>:" · 정상"}</p>;
}
function Totals({rows}:{rows:[string,number|undefined][]}){
  return <table className="metric-table"><tbody>{rows.map(([label,value])=><tr key={label}><th scope="row">{label}</th><td>{fmt(value)}</td></tr>)}</tbody></table>;
}

export function InstagramCard({days,state,insights,connected}:{days:InstagramDay[];state?:ChannelState;insights:boolean;connected:boolean}){
  const followers=days.filter(d=>d.followers!==undefined);
  return <section className="metric-card" aria-label="인스타그램">
    <h2>인스타그램</h2>
    {!insights&&<p className="notice">{connected?"설정에서 인스타그램을 다시 연결하면 팔로워·도달·조회를 자동으로 가져와요.":"설정에서 인스타그램을 연결하면 팔로워·도달·조회를 자동으로 가져와요."}</p>}
    {followers.length>0&&<p className="metric-big">{`${fmt(followers[0].followers)} → ${fmt(followers.at(-1)!.followers)}명`}</p>}
    <LineChart label="팔로워" points={followers.map(d=>({x:d.date,y:d.followers!}))}/>
    <Totals rows={[["도달",sum(days,d=>d.reach)],["조회",sum(days,d=>d.views)],["반응한 계정",sum(days,d=>d.accountsEngaged)],["프로필 방문",sum(days,d=>d.profileViews)],["링크 클릭",sum(days,d=>d.websiteClicks)]]}/>
    <p className="field-help">도달·반응한 계정은 날마다의 값을 더한 것이라, 같은 사람이 여러 날 보면 여러 번 세어져요.</p>
    <Status state={state}/>
  </section>;
}

export function HomepageCard({days,state,configured}:{days:Ga4Day[];state?:ChannelState;configured:boolean}){
  const sources=new Map<string,number>();
  for(const d of days)for(const s of d.sources)sources.set(s.sourceMedium,(sources.get(s.sourceMedium)??0)+s.sessions);
  const groups=groupSources([...sources].map(([sourceMedium,sessions])=>({sourceMedium,sessions})));
  return <section className="metric-card" aria-label="홈페이지">
    <h2>홈페이지</h2>
    {!configured&&<p className="notice">구글 애널리틱스 연결이 필요해요. 도움말 문서(PERFORMANCE_METRICS)의 순서대로 서비스 계정을 추가해 주세요.</p>}
    <LineChart label="일별 방문자" points={days.filter(d=>d.activeUsers!==undefined).map(d=>({x:d.date,y:d.activeUsers!}))}/>
    <Totals rows={[["방문",sum(days,d=>d.sessions)],["페이지 조회",sum(days,d=>d.pageViews)],["전화 버튼",sum(days,d=>d.phoneClicks)],["길찾기 버튼",sum(days,d=>d.directionsClicks)]]}/>
    {groups.length>0&&<>
      <h3>어디서 들어왔나</h3>
      <table className="metric-table"><thead><tr><th>들어온 곳</th><td>방문</td><td>비율</td></tr></thead>
        <tbody>{groups.map(g=><tr key={g.group}><th scope="row">{g.group}</th><td>{fmt(g.sessions)}</td><td>{`${g.percent}%`}</td></tr>)}</tbody></table>
      <p className="field-help">직접 방문은 주소를 직접 치거나 즐겨찾기, 카카오톡처럼 출처가 남지 않는 앱 안 링크로 들어온 경우예요. 비율은 날마다 많이 들어온 10곳을 모은 것 기준이에요.</p>
      <details className="metric-details"><summary>자세히 (구글 애널리틱스 원래 이름)</summary>
        <table className="metric-table"><tbody>{groups.flatMap(g=>g.items.map(item=><tr key={item.sourceMedium}><th scope="row">{item.label===g.group?g.group:`${g.group} · ${item.label}`}<br/><small className="source-raw">{item.sourceMedium}</small></th><td>{fmt(item.sessions)}</td></tr>))}</tbody></table>
      </details>
    </>}
    <Status state={state}/>
  </section>;
}

export function NaverCard({periods}:{periods:NaverPeriod[]}){
  return <section className="metric-card metric-wide" aria-label="네이버 플레이스">
    <h2>네이버 플레이스</h2>
    <p className="field-help">하루 평균은 숫자가 있는 날로 나눈 값이고, 한 달 환산은 그 평균에 그달 일수를 곱한 값이에요. 키워드·연령은 네이버 화면의 비율이에요.</p>
    <div className="table-scroll"><table className="metric-table">
      <thead><tr><th>기간</th><th>숫자 있는 날</th><th>유입</th><th>하루 평균</th><th>한 달 환산</th><th>리뷰</th><th>20~30대(어림)</th><th>새 키워드</th><th>많이 본 시간</th></tr></thead>
      <tbody>{periods.map((p,i)=>{const young=youngShare(p);const fresh=newKeywords(p,periods[i-1]);return <tr key={p.id}>
        <th scope="row">{p.start}~{p.end}</th><td>{p.dataDays}일</td><td>{fmt(p.placeVisits)}</td>
        <td>{dailyAverage(p)}</td><td>{`약 ${monthEquivalent(p).toLocaleString("ko-KR")}`}</td><td>{fmt(p.reviews)}</td>
        <td>{young===undefined?"—":`${young}%`}</td><td>{fresh.length?fresh.join(", "):"—"}</td><td>{p.peakHours??"—"}</td>
      </tr>;})}</tbody>
    </table></div>
    <details className="metric-details"><summary>키워드·채널·연령 자세히</summary>
      {periods.map(p=><div key={p.id}><h3>{p.start}~{p.end}</h3>
        <p>유입 채널: {p.channels.map(c=>`${c.name} ${c.count!==undefined?`${c.count}회 `:""}${c.percent!==undefined?`(${c.percent}%)`:""}`).join(" · ")}</p>
        <p>유입 키워드: {p.keywords.map(k=>`${k.name} ${k.percent}%`).join(" · ")}</p>
        {p.gender&&<p>성별: 남 {p.gender.male}% · 여 {p.gender.female}%</p>}
        {p.note&&<p className="field-help">{p.note}</p>}
      </div>)}
    </details>
    <NaverPeriodForm/>
  </section>;
}
