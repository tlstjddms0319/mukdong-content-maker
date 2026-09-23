import Link from "next/link";
import { WizardShell } from "@/components/wizard/WizardShell";
import { createDraftRepository } from "@/features/drafts/repository";
import { selectedDraftMedia } from "@/features/drafts/selection";
import { requireOwnerPage } from "@/features/auth/guard";
import { PlanningControls } from "@/components/drafts/PlanningControls";
import { ContentCalendar } from "@/components/drafts/ContentCalendar";

export const dynamic="force-dynamic";

export default async function DraftsPage() {
  await requireOwnerPage();
  const drafts=await createDraftRepository().listDrafts();
  const planned=drafts.filter(draft=>draft.planned_publish_at).sort((a,b)=>a.planned_publish_at!.localeCompare(b.planned_publish_at!));
  // Dynamic server page: compare against the time of this request, not a build-time value.
  // eslint-disable-next-line react-hooks/purity
  const now=Date.now();
  const plannedInDisplayOrder=[...planned.filter(draft=>Date.parse(draft.planned_publish_at!)>=now),...planned.filter(draft=>Date.parse(draft.planned_publish_at!)<now)];
  const calendarItems=plannedInDisplayOrder.map(draft=>{const parts=Object.fromEntries(new Intl.DateTimeFormat("en",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(draft.planned_publish_at!)).map(part=>[part.type,part.value]));return {id:draft.id,topic:draft.topic,date:`${parts.year}-${parts.month}-${parts.day}`,time:`${parts.hour}:${parts.minute}`,reviewed:!!draft.final_review_complete};});
  const initialMonth=calendarItems[0]?.date.slice(0,7);
  return <WizardShell step="topic" section="drafts">
    <p className="eyebrow">저장한 작업</p>
    <h1>내 초안</h1>
    <p className="lead">전에 만든 게시물을 다시 확인하고 고칠 수 있어요.</p>
    {drafts.length===0?<div className="state-card drafts-empty"><h2>아직 저장한 초안이 없어요</h2><p>주제와 이미지를 고르면 초안이 자동 저장돼요.</p><Link className="button primary" href="/">새 초안 만들기</Link></div>
      :<><section className="planning-overview" aria-label="게시 계획"><div><h2>게시 계획</h2><p>희망일시를 저장한 초안을 모아 봤어요. 자동으로 게시되지는 않아요.</p></div>{initialMonth&&<ContentCalendar items={calendarItems} initialMonth={initialMonth}/>} {plannedInDisplayOrder.length?<ol className="planning-list">{plannedInDisplayOrder.map(draft=>{const overdue=Date.parse(draft.planned_publish_at!)<now;return <li key={draft.id}><div><strong>{draft.topic}</strong><small>{new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",dateStyle:"medium",timeStyle:"short"}).format(new Date(draft.planned_publish_at!))}</small></div><div className="planning-overview-status"><span className="soft-badge">{draft.final_review_complete?"최종 확인 완료":"확인 필요"}</span>{overdue&&<span className="soft-badge">날짜 지남</span>}</div><Link className="button secondary" href={`/?draft=${encodeURIComponent(draft.id)}`}>초안 열기</Link></li>})}</ol>:<p>아직 날짜를 정한 초안이 없어요. 아래에서 게시 희망일시를 저장해 주세요.</p>}</section><div className="drafts-toolbar"><span>저장된 초안 {drafts.length}개 · 최근 수정순</span><Link className="button primary" href="/">새 초안 만들기</Link></div><ul className="drafts-list">{drafts.map(draft=>{const cover=selectedDraftMedia(draft)[0];return <li key={draft.id} className="draft-card"><div className="draft-cover" role="img" aria-label={`${draft.topic} 대표 이미지`} style={cover?{backgroundImage:`url(${cover.file_id})`}:undefined}/><div className="draft-details"><span className="soft-badge">{draft.caption?.trim()?"문안까지 저장됨":"이미지 저장됨"}</span><h2>{draft.topic}</h2><p>{draft.caption?.trim()||"문안을 작성하면 여기에 함께 저장돼요."}</p><small>마지막 수정 {new Intl.DateTimeFormat("ko-KR",{dateStyle:"medium"}).format(new Date(draft.updated_at))}</small></div><Link className="button secondary" href={`/?draft=${encodeURIComponent(draft.id)}`}>다시 열기</Link><PlanningControls draftId={draft.id} topic={draft.topic} plannedPublishAt={draft.planned_publish_at} finalReviewComplete={draft.final_review_complete} canReview={!!cover&&!!draft.caption?.trim()}/></li>})}</ul></>}
  </WizardShell>;
}
