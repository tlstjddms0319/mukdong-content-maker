"use client";
import { useRef } from "react";
import Image from "next/image";
import type { StudioPhoto } from "@/features/images/generationStore";

// 1단계 "사진으로 주제 정하기": 주제보다 사진을 먼저 넣으면, 사진에 보이는 음식으로 주제 3개를 추천받는다.
// 넣은 사진은 다음 단계(만들기)로 그대로 넘어가 카드에 쓰인다. 사진을 모두 빼면 보통 추천으로 돌아간다.
// status: 올리는 중·사진 읽는 중 안내(없으면 빈 문자열). busy면 버튼을 잠근다.
export const TOPIC_PHOTO_MAX=5;
export function TopicPhotoBox({photos,busy,status,error,onAdd,onRemove}:{photos:StudioPhoto[];busy:boolean;status:string;error:string;onAdd:(files:File[])=>void;onRemove:(index:number)=>void}){
  const inputRef=useRef<HTMLInputElement>(null);
  return <section className="photo-picker topic-photo-box" aria-labelledby="topic-photo-title">
    <h2 id="topic-photo-title">📷 사진으로 주제 정하기 <small>(선택)</small></h2>
    <p className="field-help">찍어 둔 음식 사진을 먼저 넣으면, 그 사진에 맞는 주제 3개를 추천해 드려요. 넣은 사진은 만들 때 그대로 써요.</p>
    <input ref={inputRef} aria-label="주제용 사진 파일" type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={event=>{onAdd([...(event.target.files??[])].slice(0,TOPIC_PHOTO_MAX-photos.length));event.target.value="";}}/>
    <div className="photo-picker-actions">
      <button type="button" className="button secondary" disabled={busy||photos.length>=TOPIC_PHOTO_MAX} onClick={()=>inputRef.current?.click()}>{photos.length?"사진 더 넣기":"사진 넣고 주제 추천받기"}</button>
    </div>
    {status&&<p role="status" className="field-help">{status}</p>}
    {error&&<p role="alert" className="field-help">{error}</p>}
    {photos.length>0&&<ol className="photo-strip" aria-label="주제용 사진">{photos.map((photo,index)=><li key={photo.id} aria-label={`주제용 ${index+1}번 사진`}>
      <Image src={photo.preview} alt={photo.name} width={110} height={110} unoptimized/>
      <span className="photo-strip-actions"><button type="button" disabled={busy} aria-label={`주제용 ${index+1}번 사진 빼기`} onClick={()=>onRemove(index)}>✕</button></span>
    </li>)}</ol>}
  </section>;
}
