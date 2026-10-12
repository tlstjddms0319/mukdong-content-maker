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
import { KeepRunningLink } from "@/components/drafts/KeepRunningLink";
import { ArchiveToggleButton } from "@/components/drafts/ArchiveToggleButton";
import { purgeExpiredDraftsIfDue } from "@/features/drafts/purge";
import { DRAFT_RETENTION_DAYS, daysUntilDeletion } from "@/features/drafts/retention";

export const dynamic="force-dynamic";

// "내 게시물"(예전 이름: 내 초안). 만든 게시물을 최근 순으로 보여 준다. 카드마다 주인공 버튼은 "열기" 하나이고,
// 복제해서 고치기·같은 주제로 새로·지우기는 작은 "더보기" 안에 접어 둔다(고를 것을 줄인다. 지우기는 한 번 더 묻는다).
// 다른 게시물을 열거나 새로 시작하는 링크는 만드는 중인 게시물이 있으면 먼저 묻는다(KeepRunningLink).
// 올릴 날짜 정하기와 반응 적기는 카드마다 접어 두고, 한 달 계획·달력·반응 돌아보기는 "더보기 → 한 달 계획"으로 옮겼다.
// 위쪽 두 칸: "게시물"(기본)과 "보관함"(?view=archive, 확인 화면에서 '보관함에 보관하기'를 누른 것).
export default async function DraftsPage({searchParams}:{searchParams:Promise<{view?:string}>}) {
  await requireOwnerPage();
  const archiveView=(await searchParams).view==="archive";
  // 만든 지 30일이 지난 게시물(보관함 제외)을 먼저 지운다(6시간에 한 번만 실제로 돈다).
  await purgeExpiredDraftsIfDue().catch(()=>{});
  // 목록은 가벼운 요약만 읽는다(이미지는 썸네일 주소로 따로 받는다).
  const all=await createDraftRepository().listDraftSummaries();
  const archivedCount=all.filter(draft=>draft.archived).length;
  const drafts=all.filter(draft=>Boolean(draft.archived)===archiveView);
  // Dynamic server page: compare against the time of this request, not a build-time value.
  // eslint-disable-next-line react-hooks/purity
  const now=Date.now();
  // 게시물마다 인스타그램 올린 기록을 읽어 상태(올림·실패·확인 필요·예약 놓침…)를 보여 준다. 기록 파일은 작아서 함께 읽어도 가볍다.
  const instagram=createInstagramRepository();
  const publications=new Map(await Promise.all(drafts.map(async draft=>[draft.id,await instagram.readPublication(draft.id).catch(()=>null)] as const)));
  // 저장된 인스타그램 연결(이 서버의 저장소만 읽는다. 인스타그램에 묻지 않음). 없거나 만료면 예약돼 있어도 올라가지 않는다고 보여 준다.
  const connection=await instagram.readConnection().catch(()=>null);
  const connected=Boolean(connection&&Date.parse(connection.expiresAt)>now);
  const statusOf=(draft:typeof drafts[number])=>publishStatusOf(draft,publications.get(draft.id)??null,now,{connected});
  return <WizardShell step="topic" section="drafts">
    <h1>내 게시물</h1>
    <StorageWarning/>
    <p className="lead">만든 게시물을 다시 열어 보고, 올리거나 고칠 수 있어요.</p>
    <p className="field-help retention-note">{archiveView?"보관함에 넣은 게시물은 지워지지 않고 계속 남아요.":`🗓 ${DRAFT_RETENTION_DAYS}일 지나면 저절로 지워져요 · 남기려면 ‘더보기 → 보관함에 넣기’`}</p>
    <nav className="drafts-tabs" aria-label="게시물 / 보관함"><a href="/drafts" aria-current={archiveView?undefined:"page"}>게시물 {all.length-archivedCount}</a><a href="/drafts?view=archive" aria-current={archiveView?"page":undefined}>보관함 {archivedCount}</a></nav>
    {drafts.length===0&&archiveView?<div className="state-card drafts-empty"><h2>보관함이 비어 있어요</h2><p>확인 화면에서 ‘보관함에 보관하기’를 누르면 여기에 모여요.</p></div>
    :drafts.length===0?<div className="state-card drafts-empty"><h2>아직 만든 게시물이 없어요</h2><p>‘만들기’에서 주제를 고르고 만들기를 누르면 여기에 저절로 모여요.</p><KeepRunningLink className="button primary big" href="/?new=1">새로 만들기</KeepRunningLink></div>
      :<><div className="drafts-toolbar"><span>{archiveView?"보관함":"게시물"} {drafts.length}개 · 최근 고친 순</span><KeepRunningLink className="button secondary" href="/?new=1">새로 만들기</KeepRunningLink></div><ul className="drafts-list">{drafts.map(draft=>{const thumbnail=draftThumbnailUrl(draft);const cover=draft.imageCount>0;const status=statusOf(draft);return <li key={draft.id} className="draft-card">
        <div className="draft-cover" role="img" aria-label={`${draft.topic} 첫 장`} style={thumbnail?{backgroundImage:`url(${thumbnail})`}:undefined}/>
        <div className="draft-details"><span className="soft-badge">{draft.caption?.trim()?"사진·글 완성":cover?"사진만 있어요":"아직 만드는 중"}</span><h2>{draft.topic}</h2><p>{draft.caption?.trim()||"글은 열어서 확인할 수 있어요."}</p><small>마지막으로 고친 날 {new Intl.DateTimeFormat("ko-KR",{dateStyle:"medium"}).format(new Date(draft.updated_at))}</small>{(()=>{const left=daysUntilDeletion(draft,now);return left!==null&&left<=7?<small className="retention-left">{left<=1?"곧 지워져요":`${left}일 뒤 지워져요`} · 남기려면 보관함에</small>:null;})()}</div>
        <div className="draft-actions"><KeepRunningLink className="button primary" aria-label={`${draft.topic} 열기`} draftId={draft.id} href={`/?draft=${encodeURIComponent(draft.id)}`}>열기</KeepRunningLink>
          <details className="draft-tools"><summary aria-label={`${draft.topic} 더보기`}>더보기</summary><div className="draft-tools-body">
            {cover&&<DuplicateDraftButton draftId={draft.id} topic={draft.topic}/>}
            <KeepRunningLink className="button secondary" aria-label={`${draft.topic} 같은 주제로 새로 만들기`} href={`/?${new URLSearchParams({topic:draft.topic,audience:draft.audience,imageBrief:draft.image_brief??"",brief:draft.content_brief??""})}`}>같은 주제로 새로</KeepRunningLink>
            <ArchiveToggleButton draftId={draft.id} topic={draft.topic} archived={Boolean(draft.archived)}/>
            <DeleteDraftButton draftId={draft.id} topic={draft.topic} published={status.state==="published"}/>
          </div></details></div>
        <PublishStatusBadge key={`${status.state}|${status.label}`} draftId={draft.id} status={status}/>
        <details className="draft-more"><summary>올릴 날짜 · 반응 적기</summary>
          <PlanningControls draftId={draft.id} topic={draft.topic} plannedPublishAt={draft.planned_publish_at} finalReviewComplete={draft.final_review_complete} canReview={cover&&draft.hasCaption}/>
          {cover&&<PerformanceForm draftId={draft.id} topic={draft.topic} performance={draft.performance}/>}
        </details>
      </li>;})}</ul></>}
  </WizardShell>;
}
