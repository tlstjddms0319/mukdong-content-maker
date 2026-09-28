"use client";
import { buildExportBundle } from "@/lib/files/exportBundle";
import { buildManualPostingGuide, formatManualPostingGuide } from "@/features/publishing/manualGuide";

const DEFAULT_CAPTION = "처음 만나는 홍어라면, 삼합부터 천천히 즐겨보세요. #묵동맛집";
export type ReviewImage={url:string;source:"photo"|"design"|"ai-generated"|"ai-edited"};

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  URL.revokeObjectURL(url);
}

async function imageBytes(imageUrl: string) {
  if (imageUrl.startsWith("data:")) {
    const [header, payload] = imageUrl.split(",", 2);
    if (header.endsWith(";base64")) return Uint8Array.from(atob(payload), character => character.charCodeAt(0));
    return new TextEncoder().encode(decodeURIComponent(payload));
  }
  return new Uint8Array(await (await fetch(imageUrl)).arrayBuffer());
}

export function ExportActions({ caption = DEFAULT_CAPTION, images, topic="처음 먹는 홍어, 삼합부터", audience="A" }: { caption?:string; images:ReviewImage[]; topic?:string; audience?:"A"|"B"|"C" }) {
  const guide=buildManualPostingGuide({topic,audience});
  const copy = () => navigator.clipboard?.writeText(caption);
  const copyHashtags = () => navigator.clipboard?.writeText(guide.hashtags.join(" "));
  const copyMusicSearch = () => navigator.clipboard?.writeText(guide.music.searchTerms.join(", "));
  const downloadImage = async () => { const cover=images[0]; if(cover)download(new Blob([await imageBytes(cover.url)], { type:"image/jpeg" }), "instagram-cover.jpg"); };
  const downloadBundle = async () => {
    const bundle = await buildExportBundle({ caption, images:await Promise.all(images.map(async image=>({bytes:await imageBytes(image.url),name:image.url,source:image.source}))), checks:["사용자 선택 완료", "게시 전 사실 정보 확인 필요"], postingGuide:formatManualPostingGuide(guide) });
    download(new Blob([bundle as BlobPart], { type:"application/zip" }), "instagram-draft.zip");
  };
  return <><div className="export-actions"><button type="button" className="button secondary" disabled={!images.length} onClick={()=>void downloadImage()}>표지 이미지 받기</button><button type="button" className="button secondary" onClick={copy}>문안 복사</button><button type="button" className="button primary" disabled={!images.length} onClick={()=>void downloadBundle()}>전체 묶음 받기</button></div><section className="publish-panel manual-publish-panel" aria-labelledby="manual-publish-title"><div><p className="eyebrow">수동 게시 준비</p><h2 id="manual-publish-title">Instagram 앱에서 직접 게시해요</h2><p>게시 API 연결 없이도 필요한 자료를 한곳에서 확인할 수 있어요.</p></div><div className="manual-guide-grid"><div><h3>추천 해시태그</h3><div className="hashtag-groups">{guide.hashtagGroups.map(group=><div className="hashtag-row" key={group.label}><strong>{group.label}</strong><div className="tag-list">{group.tags.map(tag=><span key={tag}>{tag}</span>)}</div></div>)}</div><button type="button" className="button secondary" onClick={copyHashtags}>해시태그 복사</button></div><div><h3>음악 방향</h3><strong>{guide.music.mood}</strong><p className="music-search">검색어: {guide.music.searchTerms.join(" · ")}</p><p>{guide.music.note}</p><button type="button" className="button secondary" onClick={copyMusicSearch}>음악 검색어 복사</button></div></div><div><h3>직접 게시 순서</h3><ol className="manual-checklist">{guide.checklist.map(item=><li key={item}>{item}</li>)}</ol><a className="button secondary" href={guide.placeUrl} target="_blank" rel="noreferrer">네이버 플레이스 확인</a></div></section></>;
}
