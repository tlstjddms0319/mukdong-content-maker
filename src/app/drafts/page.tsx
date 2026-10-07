import Link from "next/link";
import { WizardShell } from "@/components/wizard/WizardShell";
import { createDraftRepository } from "@/features/drafts/repository";
import { requireOwnerPage } from "@/features/auth/guard";
import { PlanningControls } from "@/components/drafts/PlanningControls";
import { ContentCalendar } from "@/components/drafts/ContentCalendar";
import { MonthPlanner } from "@/components/drafts/MonthPlanner";
import { DuplicateDraftButton } from "@/components/drafts/DuplicateDraftButton";
import { PerformanceForm } from "@/components/drafts/PerformanceForm";
import { PerformanceInsights } from "@/components/drafts/PerformanceInsights";
import { summarizePerformance } from "@/features/drafts/performance";
import { createInstagramRepository } from "@/features/instagram/repository";
import { publishStatusOf } from "@/features/instagram/publicationState";
import { PublishStatusBadge } from "@/components/drafts/PublishStatusBadge";
import { DeleteDraftButton } from "@/components/drafts/DeleteDraftButton";
import { StorageWarning } from "@/components/states/StorageWarning";
import { draftThumbnailUrl } from "@/features/drafts/summary";

export const dynamic="force-dynamic";

export default async function DraftsPage() {
  await requireOwnerPage();
  // 목록은 가벼운 요약만 읽는다(이미지는 썸네일 주소로 따로 받는다). 예전에는 초안마다 원본 이미지를 통째로 HTML에 넣었다.
  const drafts=await createDraftRepository().listDraftSummaries();
  const planned=drafts.filter(draft=>draft.planned_publish_at).sort((a,b)=>a.planned_publish_at!.localeCompare(b.planned_publish_at!));
  // Dynamic server page: compare against the time of this request, not a build-time value.
  // eslint-disable-next-line react-hooks/purity
  const now=Date.now();
  // 초안마다 Instagram 게시 기록을 읽어 상태(게시됨·실패·확인 필요·예약 놓침…)를 보여 준다. 기록 파일은 작아서 함께 읽어도 가볍다.
  const instagram=createInstagramRepository();
  const publications=new Map(await Promise.all(drafts.map(async draft=>[draft.id,await instagram.readPublication(draft.id).catch(()=>null)] as const)));
  const statusOf=(draft:typeof drafts[number])=>publishStatusOf(draft,publications.get(draft.id)??null,now);
  const plannedInDisplayOrder=[...planned.filter(draft=>Date.parse(draft.planned_publish_at!)>=now),...planned.filter(draft=>Date.parse(draft.planned_publish_at!)<now)];
  const calendarItems=plannedInDisplayOrder.map(draft=>{const parts=Object.fromEntries(new Intl.DateTimeFormat("en",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(draft.planned_publish_at!)).map(part=>[part.type,part.value]));return {id:draft.id,topic:draft.topic,date:`${parts.year}-${parts.month}-${parts.day}`,time:`${parts.hour}:${parts.minute}`,reviewed:!!draft.final_review_complete};});
  const initialMonth=calendarItems[0]?.date.slice(0,7);
  return <WizardShell step="topic" section="drafts">
    <p className="eyebrow">저장한 작업</p>
    <h1>내 초안</h1>
    <StorageWarning/>
    <p className="lead">전에 만든 게시물을 다시 확인하고 고칠 수 있어요.</p>
    <MonthPlanner drafts={drafts.map(draft=>({id:draft.id,topic:draft.topic,plan_date:draft.plan_date,hasImages:draft.imageCount>0,hasCaption:draft.hasCaption,reviewed:!!draft.final_review_complete}))}/>
    <PerformanceInsights summary={summarizePerformance(drafts)}/>
    {drafts.length===0?<div className="state-card drafts-empty"><h2>아직 저장한 초안이 없어요</h2><p>주제와 이미지를 고르면 초안이 자동 저장돼요.</p><Link className="button primary" href="/?new=1">새 초안 만들기</Link></div>
      :<><section className="planning-overview" aria-label="게시 계획"><div><h2>게시 계획</h2><p>희망일시를 저장한 초안을 모아 봤어요. Instagram을 연결하고 ‘최종 확인 완료’를 켠 초안만 그 시각에 자동으로 게시돼요. 서버가 잠들어 있으면 늦어질 수 있고, 6시간 넘게 지나면 게시하지 않고 ‘예약 놓침’으로 남겨요.</p></div>{initialMonth&&<ContentCalendar items={calendarItems} initialMonth={initialMonth}/>} {plannedInDisplayOrder.length?<ol className="planning-list">{plannedInDisplayOrder.map(draft=>{const overdue=Date.parse(draft.planned_publish_at!)<now;return <li key={draft.id}><div><strong>{draft.topic}</strong><small>{new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",dateStyle:"medium",timeStyle:"short"}).format(new Date(draft.planned_publish_at!))}</small></div><div className="planning-overview-status">{(()=>{const status=statusOf(draft);return status.state==="none"||status.state==="scheduled"?<><span className="soft-badge">{draft.final_review_complete?"최종 확인 완료":"확인 필요"}</span>{overdue&&<span className="soft-badge">날짜 지남</span>}</>:<span className={`soft-badge publish-state-${status.state}`}>{status.label}</span>;})()}</div><Link className="button secondary" href={`/?draft=${encodeURIComponent(draft.id)}`}>초안 열기</Link></li>})}</ol>:<p>아직 날짜를 정한 초안이 없어요. 아래에서 게시 희망일시를 저장해 주세요.</p>}</section><div className="drafts-toolbar"><span>저장된 초안 {drafts.length}개 · 최근 수정순</span><Link className="button primary" href="/?new=1">새 초안 만들기</Link></div><ul className="drafts-list">{drafts.map(draft=>{const thumbnail=draftThumbnailUrl(draft);const cover=draft.imageCount>0;const status=statusOf(draft);return <li key={draft.id} className="draft-card"><div className="draft-cover" role="img" aria-label={`${draft.topic} 대표 이미지`} style={thumbnail?{backgroundImage:`url(${thumbnail})`}:undefined}/><div className="draft-details"><span className="soft-badge">{draft.caption?.trim()?"문안까지 저장됨":"이미지 저장됨"}</span><h2>{draft.topic}</h2><p>{draft.caption?.trim()||"문안을 작성하면 여기에 함께 저장돼요."}</p><small>마지막 수정 {new Intl.DateTimeFormat("ko-KR",{dateStyle:"medium"}).format(new Date(draft.updated_at))}</small></div><div className="draft-actions"><Link className="button secondary" href={`/?draft=${encodeURIComponent(draft.id)}`}>다시 열기</Link>{cover&&<DuplicateDraftButton draftId={draft.id} topic={draft.topic}/>}<DeleteDraftButton draftId={draft.id} topic={draft.topic} published={status.state==="published"}/><Link className="button secondary" aria-label={`${draft.topic} 같은 주제로 새로 만들기`} href={`/?${new URLSearchParams({topic:draft.topic,audience:draft.audience,imageBrief:draft.image_brief??"",brief:draft.content_brief??""})}`}>같은 주제로 새로</Link></div><PublishStatusBadge draftId={draft.id} status={status}/><PlanningControls draftId={draft.id} topic={draft.topic} plannedPublishAt={draft.planned_publish_at} finalReviewComplete={draft.final_review_complete} canReview={cover&&draft.hasCaption}/>{cover&&<PerformanceForm draftId={draft.id} topic={draft.topic} performance={draft.performance}/>}</li>})}</ul></>}
  </WizardShell>;
}
