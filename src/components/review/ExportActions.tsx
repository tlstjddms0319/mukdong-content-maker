"use client";
import { useState } from "react";
import { buildExportBundle } from "@/lib/files/exportBundle";
import { buildManualPostingGuide, formatManualPostingGuide } from "@/features/publishing/manualGuide";
import { copyText as writeClipboard, download, imageBytes, saveSlides as saveToAlbum, type ReviewImage } from "./exportFiles";

const DEFAULT_CAPTION = "처음 만나는 홍어라면, 삼합부터 천천히 즐겨보세요. #묵동맛집";
export type { ReviewImage };

export function ExportActions({ caption = DEFAULT_CAPTION, images, topic="처음 먹는 홍어, 삼합부터", audience="A" }: { caption?:string; images:ReviewImage[]; topic?:string; audience?:"A"|"B"|"C" }) {
  const guide=buildManualPostingGuide({topic,audience});
  // 복사·저장 결과를 한 줄로 알려 준다(예전에는 눌러도 아무 표시가 없고, 실패해도 몰랐다).
  const [notice,setNotice]=useState("");
  const copyText=async(text:string,label:string)=>setNotice(await writeClipboard(text)?`${label}을(를) 복사했어요.`:`${label}을(를) 복사하지 못했어요. 글을 길게 눌러 직접 복사해 주세요.`);
  const copy = () => void copyText(caption,"글");
  const copyHashtags = () => void copyText(guide.hashtags.join(" "),"# 태그");
  const copyMusicSearch = () => void copyText(guide.music.searchTerms.join(", "),"음악 찾을 말");
  const saveSlides = async () => {
    const result=await saveToAlbum(images,topic);
    if(result==="shared")setNotice("공유 창에서 '이미지 저장'을 누르면 사진첩에 순서대로 저장돼요.");
    else if(result==="downloaded")setNotice(`${images.length}장을 내려받았어요. 파일 이름 순서(01, 02 …)대로 올리면 돼요.`);
  };
  const downloadImage = async () => { const cover=images[0]; if(cover)download(new Blob([await imageBytes(cover.url)], { type:"image/jpeg" }), "instagram-cover.jpg"); };
  const downloadBundle = async () => {
    const bundle = await buildExportBundle({ caption, images:await Promise.all(images.map(async image=>({bytes:await imageBytes(image.url),name:image.url,source:image.source}))), checks:["사용자 선택 완료", "게시 전 사실 정보 확인 필요"], postingGuide:formatManualPostingGuide(guide) });
    download(new Blob([bundle as BlobPart], { type:"application/zip" }), "instagram-draft.zip");
  };
  // 확인 화면 "더보기" 안의 파일 받기·# 태그·음악·직접 올리는 순서. 큰 버튼 두 개(바로 올리기·휴대폰에 저장)는 확인 화면에 따로 있다.
  return <><div className="export-actions"><button type="button" className="button secondary" disabled={!images.length} onClick={()=>void downloadImage()}>첫 장만 받기</button><button type="button" className="button secondary" disabled={!images.length} onClick={()=>void saveSlides()}>장별로 사진첩에 저장</button><button type="button" className="button secondary" onClick={copy}>글 복사</button><button type="button" className="button secondary" disabled={!images.length} onClick={()=>void downloadBundle()}>전체 묶음 받기</button></div>{notice&&<p role="status" className="field-help">{notice}</p>}<section className="publish-panel manual-publish-panel" aria-labelledby="manual-publish-title"><div><h3 id="manual-publish-title">인스타그램 앱에서 직접 올리기</h3><p>사진을 저장한 뒤 인스타그램 앱에서 올릴 때 참고하세요.</p></div><div className="manual-guide-grid"><div><h4># 태그 추천</h4><div className="hashtag-groups">{guide.hashtagGroups.map(group=><div className="hashtag-row" key={group.label}><strong>{group.label}</strong><div className="tag-list">{group.tags.map(tag=><span key={tag}>{tag}</span>)}</div></div>)}</div><button type="button" className="button secondary" onClick={copyHashtags}># 태그 복사</button></div><div><h4>어울리는 음악</h4><strong>{guide.music.mood}</strong><p className="music-search">찾을 말: {guide.music.searchTerms.join(" · ")}</p><p>{guide.music.note}</p><button type="button" className="button secondary" onClick={copyMusicSearch}>음악 찾을 말 복사</button></div></div><div><h4>올리는 순서</h4><ol className="manual-checklist">{guide.checklist.map(item=><li key={item}>{item}</li>)}</ol><a className="button secondary" href={guide.placeUrl} target="_blank" rel="noreferrer">네이버 플레이스 확인</a></div></section></>;
}
