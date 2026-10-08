import Link from "next/link";
import { WizardShell } from "@/components/wizard/WizardShell";
import { createDraftRepository } from "@/features/drafts/repository";
import { requireOwnerPage } from "@/features/auth/guard";
import { PlanningControls } from "@/components/drafts/PlanningControls";
import { DuplicateDraftButton } from "@/components/drafts/DuplicateDraftButton";
import { PerformanceForm } from "@/components/drafts/PerformanceForm";
import { createInstagramRepository } from "@/features/instagram/repository";
import { publishStatusOf } from "@/features/instagram/publicationState";
import { PublishStatusBadge } from "@/components/drafts/PublishStatusBadge";
import { DeleteDraftButton } from "@/components/drafts/DeleteDraftButton";
import { StorageWarning } from "@/components/states/StorageWarning";
import { draftThumbnailUrl } from "@/features/drafts/summary";

export const dynamic="force-dynamic";

// "내 게시물"(예전 이름: 내 초안). 만든 게시물을 최근 순으로 보여 주고, 열기·복제·지우기만 바로 보이게 둔다.
// 올릴 날짜 정하기와 반응 적기는 카드마다 접어 두고, 한 달 계획·달력·반응 돌아보기는 "더보기 → 한 달 계획"으로 옮겼다.
export default async function DraftsPage() {
  await requireOwnerPage();
  // 목록은 가벼운 요약만 읽는다(이미지는 썸네일 주소로 따로 받는다).
  const drafts=await createDraftRepository().listDraftSummaries();
  // Dynamic server page: compare against the time of this request, not a build-time value.
  // eslint-disable-next-line react-hooks/purity
  const now=Date.now();
  // 게시물마다 인스타그램 올린 기록을 읽어 상태(올림·실패·확인 필요·예약 놓침…)를 보여 준다. 기록 파일은 작아서 함께 읽어도 가볍다.
  const instagram=createInstagramRepository();
  const publications=new Map(await Promise.all(drafts.map(async draft=>[draft.id,await instagram.readPublication(draft.id).catch(()=>null)] as const)));
  const statusOf=(draft:typeof drafts[number])=>publishStatusOf(draft,publications.get(draft.id)??null,now);
  return <WizardShell step="topic" section="drafts">
    <h1>내 게시물</h1>
    <StorageWarning/>
    <p className="lead">만든 게시물을 다시 열어 보고, 올리거나 고칠 수 있어요.</p>
    {drafts.length===0?<div className="state-card drafts-empty"><h2>아직 만든 게시물이 없어요</h2><p>‘만들기’에서 주제를 고르고 만들기를 누르면 여기에 저절로 모여요.</p><Link className="button primary big" href="/?new=1">새로 만들기</Link></div>
      :<><div className="drafts-toolbar"><span>게시물 {drafts.length}개 · 최근 고친 순</span><Link className="button primary" href="/?new=1">새로 만들기</Link></div><ul className="drafts-list">{drafts.map(draft=>{const thumbnail=draftThumbnailUrl(draft);const cover=draft.imageCount>0;const status=statusOf(draft);return <li key={draft.id} className="draft-card">
        <div className="draft-cover" role="img" aria-label={`${draft.topic} 첫 장`} style={thumbnail?{backgroundImage:`url(${thumbnail})`}:undefined}/>
        <div className="draft-details"><span className="soft-badge">{draft.caption?.trim()?"사진·글 완성":cover?"사진만 있어요":"아직 만드는 중"}</span><h2>{draft.topic}</h2><p>{draft.caption?.trim()||"글은 열어서 확인할 수 있어요."}</p><small>마지막으로 고친 날 {new Intl.DateTimeFormat("ko-KR",{dateStyle:"medium"}).format(new Date(draft.updated_at))}</small></div>
        <div className="draft-actions"><Link className="button primary" href={`/?draft=${encodeURIComponent(draft.id)}`}>열기</Link>{cover&&<DuplicateDraftButton draftId={draft.id} topic={draft.topic}/>}<DeleteDraftButton draftId={draft.id} topic={draft.topic} published={status.state==="published"}/><Link className="button secondary" aria-label={`${draft.topic} 같은 주제로 새로 만들기`} href={`/?${new URLSearchParams({topic:draft.topic,audience:draft.audience,imageBrief:draft.image_brief??"",brief:draft.content_brief??""})}`}>같은 주제로 새로</Link></div>
        <PublishStatusBadge draftId={draft.id} status={status}/>
        <details className="draft-more"><summary>올릴 날짜 · 반응 적기</summary>
          <PlanningControls draftId={draft.id} topic={draft.topic} plannedPublishAt={draft.planned_publish_at} finalReviewComplete={draft.final_review_complete} canReview={cover&&draft.hasCaption}/>
          {cover&&<PerformanceForm draftId={draft.id} topic={draft.topic} performance={draft.performance}/>}
        </details>
      </li>;})}</ul></>}
  </WizardShell>;
}
