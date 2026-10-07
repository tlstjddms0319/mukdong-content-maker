import Link from "next/link";
import { draftThumbnailUrl, type DraftSummary } from "@/features/drafts/summary";
import { ImageCover } from "./ImageCover";

// 초안 요약과 작은 썸네일만 쓴다(원본 이미지를 화면에 통째로 넣지 않는다).
export function ImageGallery({ drafts }: { drafts: DraftSummary[] }) {
  return <>
    <p className="eyebrow">이미지 제작실</p>
    <h1>보이는 이미지부터 준비해요</h1>
    <p className="lead">사진과 글자로 무료 카드를 편집하거나, 실제 사진·AI 이미지를 사용할 수 있어요.</p>
    <div className="image-mode-guide">
      <div><strong>무료 카드 편집</strong><p>보관한 사진과 질문으로 사진형·비교형·글자형 카드를 만들어요.</p></div>
      <div><strong>실제 사진</strong><p>내 사진을 바로 사용해요.</p></div>
      <div><strong>AI 이미지</strong><p>표지를 고른 뒤 여러 장으로 만들어요.</p></div>
      <div><strong>사진 + AI</strong><p>내 사진을 참고해 이미지를 만들어요.</p></div>
    </div>
    <div className="drafts-toolbar"><span>저장된 초안 {drafts.length}개</span><Link className="button primary" href="/">이미지 제작 시작</Link></div>
    {drafts.length===0?<div className="state-card drafts-empty"><h2>아직 저장된 초안이 없어요</h2><p>주제를 먼저 고르면 이미지 제작으로 이어져요.</p></div>
      :<ul className="image-gallery">{drafts.map(draft=>{
        const cover=draftThumbnailUrl(draft);
        return <li className="image-gallery-card" key={draft.id}>
          <ImageCover cover={cover} title={draft.topic} hasSelection={draft.imageCount > 0} />
          <div className="image-gallery-details"><h2>{draft.topic}</h2><p>{draft.imageCount?`선택 이미지 ${draft.imageCount}장`:"이미지를 아직 선택하지 않았어요."}</p><Link className="button secondary" href={`/?draft=${encodeURIComponent(draft.id)}`}>초안 열기</Link></div>
        </li>;
      })}</ul>}
  </>;
}
