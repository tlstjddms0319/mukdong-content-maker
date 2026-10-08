import Link from "next/link";
import type { PerformanceGroup, PerformanceSummary } from "@/features/drafts/performance";

// "성과 돌아보기": 적어 둔 성과를 모아 반응이 좋았던 게시물과 디자인 계열·독자 유형·요일별 평균 반응 점수를 보여 준다.
// 막대 길이는 그 묶음 안의 최고 평균을 100%로 놓은 상대 비교다.
function GroupBars({title,groups}:{title:string;groups:PerformanceGroup[]}){
  if(!groups.length)return null;
  const max=Math.max(...groups.map(group=>group.average),1);
  return <div className="insight-group"><h3>{title}</h3><ul>{groups.map(group=><li key={group.key}>
    <span>{group.label} <small>({group.count}개)</small></span>
    <span className="insight-bar" aria-hidden="true"><span style={{width:`${Math.max(4,group.average/max*100)}%`}}/></span>
    <strong>{group.average.toLocaleString("ko-KR")}</strong>
  </li>)}</ul></div>;
}

export function PerformanceInsights({summary}:{summary:PerformanceSummary}){
  if(!summary.recorded)return null;
  return <section className="performance-insights" aria-label="성과 돌아보기">
    <div><h2>성과 돌아보기</h2><p>적어 둔 성과 {summary.recorded}개를 모았어요. 반응 좋았던 주제는 다음 주제 추천에 참고해요.{summary.recorded<5?" 기록이 5개 이상 모이면 비교가 더 믿을 만해요.":""}</p></div>
    <ol className="insight-top">{summary.top.map((item,index)=><li key={item.id}>
      <span className="insight-rank">{index+1}</span>
      <Link href={`/?draft=${encodeURIComponent(item.id)}`}>{item.topic}</Link>
      <span className="soft-badge">반응 점수 {item.score.toLocaleString("ko-KR")}{item.rate!==null?` · 반응률 ${item.rate}%`:""}</span>
    </li>)}</ol>
    <div className="insight-grid">
      <GroupBars title="모양별" groups={summary.byStyle}/>
      <GroupBars title="손님 유형별" groups={summary.byAudience}/>
      <GroupBars title="올린 요일별" groups={summary.byWeekday}/>
    </div>
  </section>;
}
