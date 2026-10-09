import Link from "next/link";
import { WizardShell } from "@/components/wizard/WizardShell";
import { createDraftRepository } from "@/features/drafts/repository";
import { requireOwnerPage } from "@/features/auth/guard";
import { ContentCalendar } from "@/components/drafts/ContentCalendar";
import { MonthPlanner } from "@/components/drafts/MonthPlanner";
import { PerformanceInsights } from "@/components/drafts/PerformanceInsights";
import { summarizePerformance } from "@/features/drafts/performance";
import { createInstagramRepository } from "@/features/instagram/repository";
import { publishStatusOf } from "@/features/instagram/publicationState";

export const dynamic="force-dynamic";

// "더보기 → 한 달 계획": 가끔 쓰는 것(한 달 주제 계획, 올릴 날짜를 정한 게시물 달력, 반응 돌아보기)을 모은 화면.
// 예전에는 내 게시물(초안) 화면 위쪽에 함께 있어 목록을 찾기 어려웠다.
export default async function PlanPage() {
  await requireOwnerPage();
  // 보관함 게시물은 계획·달력·진행 상태에서 뺀다(지금은 안 올리기로 한 것이라 "확인 필요"로 보이면 헷갈린다). 반응 기록 통계에는 넣는다.
  const allDrafts=await createDraftRepository().listDraftSummaries();
  const drafts=allDrafts.filter(draft=>!draft.archived);
  // Dynamic server page: compare against the time of this request, not a build-time value.
  // eslint-disable-next-line react-hooks/purity
  const now=Date.now();
  const instagram=createInstagramRepository();
  const planned=drafts.filter(draft=>draft.planned_publish_at).sort((a,b)=>a.planned_publish_at!.localeCompare(b.planned_publish_at!));
  const publications=new Map(await Promise.all(planned.map(async draft=>[draft.id,await instagram.readPublication(draft.id).catch(()=>null)] as const)));
  const connection=await instagram.readConnection().catch(()=>null);
  const connected=Boolean(connection&&Date.parse(connection.expiresAt)>now);
  const statusOf=(draft:typeof drafts[number])=>publishStatusOf(draft,publications.get(draft.id)??null,now,{connected});
  const plannedInDisplayOrder=[...planned.filter(draft=>Date.parse(draft.planned_publish_at!)>=now),...planned.filter(draft=>Date.parse(draft.planned_publish_at!)<now)];
  const calendarItems=plannedInDisplayOrder.map(draft=>{const parts=Object.fromEntries(new Intl.DateTimeFormat("en",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(draft.planned_publish_at!)).map(part=>[part.type,part.value]));return {id:draft.id,topic:draft.topic,date:`${parts.year}-${parts.month}-${parts.day}`,time:`${parts.hour}:${parts.minute}`,reviewed:!!draft.final_review_complete};});
  const initialMonth=calendarItems[0]?.date.slice(0,7);
  return <WizardShell step="topic" section="plan">
    <h1>한 달 계획</h1>
    <p className="lead">한 달 동안 올릴 주제를 미리 정하고, 올릴 날짜를 정한 게시물을 달력으로 봐요.</p>
    <MonthPlanner drafts={drafts.map(draft=>({id:draft.id,topic:draft.topic,plan_date:draft.plan_date,hasImages:draft.imageCount>0,hasCaption:draft.hasCaption,reviewed:!!draft.final_review_complete}))}/>
    <section className="planning-overview" aria-label="올릴 날짜">
      <div><h2>올릴 날짜를 정한 게시물</h2><p>인스타그램을 연결하고 ‘최종 확인 완료’를 켠 게시물만 그 시각에 저절로 올라가요. 늦어질 수 있고, 6시간 넘게 지나면 올리지 않아요.</p></div>
      {initialMonth&&<ContentCalendar items={calendarItems} initialMonth={initialMonth}/>}
      {plannedInDisplayOrder.length?<ol className="planning-list">{plannedInDisplayOrder.map(draft=>{const overdue=Date.parse(draft.planned_publish_at!)<now;const status=statusOf(draft);return <li key={draft.id}><div><strong>{draft.topic}</strong><small>{new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",dateStyle:"medium",timeStyle:"short"}).format(new Date(draft.planned_publish_at!))}</small></div><div className="planning-overview-status">{status.state==="none"||status.state==="scheduled"?<><span className="soft-badge">{draft.final_review_complete?"최종 확인 완료":"확인 필요"}</span>{overdue&&<span className="soft-badge">날짜 지남</span>}</>:<span className={`soft-badge publish-state-${status.state}`}>{status.label}</span>}</div><Link className="button secondary" href={`/?draft=${encodeURIComponent(draft.id)}`}>열기</Link></li>;})}</ol>
        :<p>아직 날짜를 정한 게시물이 없어요. 내 게시물에서 게시물마다 ‘올릴 날짜·반응 적기’를 눌러 정할 수 있어요.</p>}
    </section>
    <PerformanceInsights summary={summarizePerformance(allDrafts)}/>
  </WizardShell>;
}
