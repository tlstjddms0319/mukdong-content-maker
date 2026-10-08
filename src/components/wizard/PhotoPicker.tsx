"use client";
import { useRef, useState } from "react";
import Image from "next/image";
import { readJsonResponse } from "@/lib/http/readJson";
import { LibraryFilterBar } from "@/components/images/LibraryFilterBar";
import type { LibraryAsset } from "@/features/images/freeCards";
import { filterLibrary, popularTags, usageLabel, type LibrarySort } from "@/features/images/libraryFilter";
import { MAX_STUDIO_PHOTOS, addLibraryPhoto, addPhotos, removePhoto, type GenerationState } from "@/features/images/generationStore";

// 2단계 "사진 올리기 (선택)". 사장님 사진을 고르면 그 사진으로 카드를 그리고, 없으면 AI가 그린다.
// 예전 사진 화면의 순서 바꾸기·맛 점수·파노라마 같은 세부는 빼고, 올리기·전에 올린 사진에서 고르기·빼기만 둔다.
// 첫 사진이 첫 장(표지)이 된다.
export function PhotoPicker({state}:{state:GenerationState}){
  const inputRef=useRef<HTMLInputElement>(null);
  const [library,setLibrary]=useState<LibraryAsset[]|null>(null);
  const [query,setQuery]=useState("");
  const [sort,setSort]=useState<LibrarySort>("unused");
  const [libraryError,setLibraryError]=useState("");
  const {photos,phase,photoStatus}=state;
  const busy=phase!=="idle";
  const openLibrary=async()=>{
    if(library){setLibrary(null);return;}
    setLibraryError("");
    try{
      const response=await fetch("/api/images/assets");
      const data=await readJsonResponse(response);
      if(!response.ok)throw new Error();
      setLibrary((data.assets as LibraryAsset[]).filter(asset=>asset.kind==="photo"));
    }catch{setLibraryError("전에 올린 사진을 불러오지 못했어요. 잠시 뒤 다시 눌러 주세요.");}
  };
  const shown=library?filterLibrary(library,query,sort):[];
  return <section className="photo-picker" aria-labelledby="photo-picker-title">
    <h2 id="photo-picker-title">사진 올리기 <small>(선택)</small></h2>
    <p className="field-help">가게에서 찍은 사진이 있으면 올려 주세요. 첫 번째 사진이 첫 장이 돼요. 없으면 AI가 그려 드려요.</p>
    <input ref={inputRef} aria-label="사진 파일" type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={event=>{void addPhotos([...(event.target.files??[])]);event.target.value="";}}/>
    <div className="photo-picker-actions">
      <button type="button" className="button secondary" disabled={busy||photos.length>=MAX_STUDIO_PHOTOS} onClick={()=>inputRef.current?.click()}>📷 사진 고르기</button>
      <button type="button" className="button secondary" disabled={busy} aria-expanded={Boolean(library)} onClick={()=>void openLibrary()}>{library?"전에 올린 사진 닫기":"전에 올린 사진에서 고르기"}</button>
    </div>
    {phase==="uploading"&&photoStatus&&<p role="status" className="field-help">{photoStatus}</p>}
    {libraryError&&<p role="alert">{libraryError}</p>}
    {library&&(library.length?<div className="library-picker">
      <LibraryFilterBar query={query} onQuery={setQuery} sort={sort} onSort={setSort} tags={popularTags(library)} count={shown.length}/>
      <div className="photo-library" aria-label="전에 올린 사진">{shown.map(photo=><button key={photo.id} type="button" className="photo-thumb library-thumb" disabled={busy||photos.some(item=>item.id===photo.id)} onClick={()=>addLibraryPhoto({id:photo.id,preview:photo.preview,name:photo.name})} aria-label={`${photo.name} 추가 (${usageLabel(photo)})`} title={photo.name}><Image src={photo.preview} alt="" width={96} height={96} unoptimized/><span>{photo.useCount?`${photo.useCount}번`:"새 사진"}</span></button>)}</div>
    </div>:<p className="field-help">전에 올린 사진이 아직 없어요.</p>)}
    {photos.length>0&&<ol className="photo-strip" aria-label="고른 사진">{photos.map((photo,index)=><li key={photo.id} aria-label={`${index+1}번 사진`}>
      <Image src={photo.preview} alt={photo.name} width={110} height={110} unoptimized/>
      <span className="photo-order">{index===0?"첫 장":index+1}</span>
      <span className="photo-strip-actions"><button type="button" disabled={busy} aria-label={`${index+1}번 사진 빼기`} onClick={()=>removePhoto(index)}>✕</button></span>
    </li>)}</ol>}
  </section>;
}
