"use client";
import { useState } from "react";
import { buildExportBundle } from "@/lib/files/exportBundle";
import { buildManualPostingGuide, formatManualPostingGuide } from "@/features/publishing/manualGuide";
import { InstagramPublish } from "./InstagramPublish";

const DEFAULT_CAPTION = "처음 만나는 홍어라면, 삼합부터 천천히 즐겨보세요. #묵동맛집";
export type ReviewImage={url:string;source:"photo"|"design"|"ai-generated"|"ai-edited"};

// 클릭 직후 주소를 지우면 일부 브라우저(특히 Safari)가 내려받기를 시작하지 못한다. 잠시 뒤에 지운다.
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
const slideName = (index: number) => `instagram-${String(index + 1).padStart(2, "0")}.jpg`;

async function imageBytes(imageUrl: string) {
  if (imageUrl.startsWith("data:")) {
    const [header, payload] = imageUrl.split(",", 2);
    if (header.endsWith(";base64")) return Uint8Array.from(atob(payload), character => character.charCodeAt(0));
    return new TextEncoder().encode(decodeURIComponent(payload));
  }
  return new Uint8Array(await (await fetch(imageUrl)).arrayBuffer());
}

export function ExportActions({ caption = DEFAULT_CAPTION, images, topic="처음 먹는 홍어, 삼합부터", audience="A", draftId }: { caption?:string; images:ReviewImage[]; topic?:string; audience?:"A"|"B"|"C"; draftId?:string }) {
  const guide=buildManualPostingGuide({topic,audience});
  // 복사·저장 결과를 한 줄로 알려 준다(예전에는 눌러도 아무 표시가 없고, 실패해도 몰랐다).
  const [notice,setNotice]=useState("");
  const copyText=async(text:string,label:string)=>{
    try{await navigator.clipboard.writeText(text);setNotice(`${label}을(를) 복사했어요.`);}
    catch{setNotice(`${label}을(를) 복사하지 못했어요. 글을 길게 눌러 직접 복사해 주세요.`);}
  };
  const copy = () => void copyText(caption,"문안");
  const copyHashtags = () => void copyText(guide.hashtags.join(" "),"해시태그");
  const copyMusicSearch = () => void copyText(guide.music.searchTerms.join(", "),"음악 검색어");
  // 휴대폰에서 장마다 사진첩에 저장: 공유 시트가 파일을 받을 수 있으면(iPhone·Android) 한 번에 넘기고, 아니면 한 장씩 내려받는다.
  const saveSlides = async () => {
    const files = await Promise.all(images.map(async (image, index) => new File([await imageBytes(image.url) as BlobPart], slideName(index), { type: "image/jpeg" })));
    try {
      if (navigator.canShare?.({ files })) { await navigator.share({ files, title: topic }); setNotice("공유 창에서 '이미지 저장'을 누르면 사진첩에 순서대로 저장돼요."); return; }
    } catch (error) { if (error instanceof DOMException && error.name === "AbortError") return; }
    for (const [index, file] of files.entries()) { download(file, slideName(index)); await new Promise(resolve => setTimeout(resolve, 400)); }
    setNotice(`${files.length}장을 내려받았어요. 파일 이름 순서(01, 02 …)대로 올리면 돼요.`);
  };
  const downloadImage = async () => { const cover=images[0]; if(cover)download(new Blob([await imageBytes(cover.url)], { type:"image/jpeg" }), "instagram-cover.jpg"); };
  const downloadBundle = async () => {
    const bundle = await buildExportBundle({ caption, images:await Promise.all(images.map(async image=>({bytes:await imageBytes(image.url),name:image.url,source:image.source}))), checks:["사용자 선택 완료", "게시 전 사실 정보 확인 필요"], postingGuide:formatManualPostingGuide(guide) });
    download(new Blob([bundle as BlobPart], { type:"application/zip" }), "instagram-draft.zip");
  };
  return <><div className="export-actions"><button type="button" className="button secondary" disabled={!images.length} onClick={()=>void downloadImage()}>표지 이미지 받기</button><button type="button" className="button secondary" disabled={!images.length} onClick={()=>void saveSlides()}>장별로 사진첩에 저장</button><button type="button" className="button secondary" onClick={copy}>문안 복사</button><button type="button" className="button primary" disabled={!images.length} onClick={()=>void downloadBundle()}>전체 묶음 받기</button></div>{notice&&<p role="status" className="field-help">{notice}</p>}<section className="publish-panel manual-publish-panel" aria-labelledby="manual-publish-title"><div><p className="eyebrow">수동 게시 준비</p><h2 id="manual-publish-title">Instagram 앱에서 직접 게시해요</h2><p>게시 API 연결 없이도 필요한 자료를 한곳에서 확인할 수 있어요.</p></div><div className="manual-guide-grid"><div><h3>추천 해시태그</h3><div className="hashtag-groups">{guide.hashtagGroups.map(group=><div className="hashtag-row" key={group.label}><strong>{group.label}</strong><div className="tag-list">{group.tags.map(tag=><span key={tag}>{tag}</span>)}</div></div>)}</div><button type="button" className="button secondary" onClick={copyHashtags}>해시태그 복사</button></div><div><h3>음악 방향</h3><strong>{guide.music.mood}</strong><p className="music-search">검색어: {guide.music.searchTerms.join(" · ")}</p><p>{guide.music.note}</p><button type="button" className="button secondary" onClick={copyMusicSearch}>음악 검색어 복사</button></div></div><div><h3>직접 게시 순서</h3><ol className="manual-checklist">{guide.checklist.map(item=><li key={item}>{item}</li>)}</ol><a className="button secondary" href={guide.placeUrl} target="_blank" rel="noreferrer">네이버 플레이스 확인</a></div></section><InstagramPublish draftId={draftId} caption={caption} imageUrls={images.map(image=>image.url)}/></>;
}
