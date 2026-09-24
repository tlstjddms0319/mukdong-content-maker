import Link from "next/link";
import type { Draft } from "@/features/drafts/schema";
import { selectedDraftMedia } from "@/features/drafts/selection";

function previewUrl(fileId: string) {
  return /^(data:image\/(?:png|jpeg|webp|gif);base64,|https?:\/\/|\/(?!\/))/i.test(fileId) ? fileId : null;
}

export function ImageGallery({ drafts }: { drafts: Draft[] }) {
  return <>
    <p className="eyebrow">이미지 제작실</p>
    <h1>보이는 이미지부터 준비해요</h1>
    <p className="lead">주제를 고른 뒤 실제 사진을 올리거나 AI 이미지를 만들 수 있어요.</p>
    <div className="image-mode-guide">
      <div><strong>실제 사진</strong><p>내 사진을 바로 사용해요.</p></div>
      <div><strong>AI 이미지</strong><p>표지를 고른 뒤 여러 장으로 만들어요.</p></div>
      <div><strong>사진 + AI</strong><p>내 사진을 참고해 이미지를 만들어요.</p></div>
    </div>
    <div className="drafts-toolbar"><span>저장된 초안 {drafts.length}개</span><Link className="button primary" href="/">이미지 제작 시작</Link></div>
    {drafts.length===0?<div className="state-card drafts-empty"><h2>아직 저장된 초안이 없어요</h2><p>주제를 먼저 고르면 이미지 제작으로 이어져요.</p></div>
      :<ul className="image-gallery">{drafts.map(draft=>{
        const selected=selectedDraftMedia(draft);
        const cover=selected[0] ? previewUrl(selected[0].file_id) : null;
        return <li className="image-gallery-card" key={draft.id}>
          {cover?<div className="image-gallery-cover" role="img" aria-label={`${draft.topic} 선택 이미지 미리보기`} style={{backgroundImage:`url(${cover})`}}/>
            :<div className="image-gallery-cover image-gallery-missing">{selected.length?"미리보기 없음":"이미지 미선택"}</div>}
          <div className="image-gallery-details"><h2>{draft.topic}</h2><p>{selected.length?`선택 이미지 ${selected.length}장`:"이미지를 아직 선택하지 않았어요."}</p><Link className="button secondary" href={`/?draft=${encodeURIComponent(draft.id)}`}>초안 열기</Link></div>
        </li>;
      })}</ul>}
  </>;
}
