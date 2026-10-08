import Link from "next/link";
import { draftThumbnailUrl, type DraftSummary } from "@/features/drafts/summary";
import { ImageCover } from "./ImageCover";

// "더보기 → 이미지 모음": 만든 게시물의 첫 장을 모아 보고, 아래에서 전에 올린 사진(사진 보관함)을 정리한다.
// 게시물 요약과 작은 썸네일만 쓴다(원본 이미지를 화면에 통째로 넣지 않는다).
export function ImageGallery({ drafts }: { drafts: DraftSummary[] }) {
  return <>
    <h1>이미지 모음</h1>
    <p className="lead">만든 게시물의 사진과, 전에 올린 사진을 한곳에서 봐요.</p>
    <div className="drafts-toolbar"><span>만든 게시물 {drafts.length}개</span><Link className="button primary" href="/">새로 만들기</Link></div>
    {drafts.length===0?<div className="state-card drafts-empty"><h2>아직 만든 게시물이 없어요</h2><p>‘만들기’에서 주제를 고르면 시작할 수 있어요.</p></div>
      :<ul className="image-gallery">{drafts.map(draft=>{
        const cover=draftThumbnailUrl(draft);
        return <li className="image-gallery-card" key={draft.id}>
          <ImageCover cover={cover} title={draft.topic} hasSelection={draft.imageCount > 0} />
          <div className="image-gallery-details"><h2>{draft.topic}</h2><p>{draft.imageCount?`사진 ${draft.imageCount}장`:"사진이 아직 없어요."}</p><Link className="button secondary" href={`/?draft=${encodeURIComponent(draft.id)}`}>열기</Link></div>
        </li>;
      })}</ul>}
  </>;
}
